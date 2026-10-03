"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { db } from "@/server/db";
import {
  createSession, destroyAllSessions, destroySession, getCurrentUser, hashPassword, requireUser,
  verifyPassword, verifyPasswordOrDummy,
} from "@/server/auth";
import { createProject } from "@/server/projects";
import { clientIp, consumeRateLimit, resetRateLimit, retryMessage } from "@/server/rate-limit";
import { consumeAuthToken, issueAuthToken } from "@/server/tokens";
import { actionEmail, appUrl, sendEmail } from "@/server/email";
import { SAMPLE_PROJECTS } from "@/data/sample-projects";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

export type AuthState = { error?: string; fieldErrors?: Record<string, string>; message?: string } | undefined;

const Email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(200);
const Password = z.string().min(10, "Use at least 10 characters.").max(200, "Use at most 200 characters.");

const SignUpSchema = z.object({ name: z.string().trim().min(1, "Please enter your name.").max(80), email: Email, password: Password })
  .refine((d) => d.password.toLowerCase() !== d.email, { path: ["password"], message: "Don’t use your email address as your password." });
const SignInSchema = z.object({ email: Email, password: z.string().min(1, "Enter your password.").max(200) });

const fieldErrors = (e: z.ZodError) => Object.fromEntries(e.issues.map((i) => [String(i.path[0]), i.message]));

async function sendVerificationEmail(user: { id: string; email: string; name: string }) {
  const token = await issueAuthToken(user.id, "EMAIL_VERIFICATION");
  return sendEmail(actionEmail({
    to: user.email,
    subject: "Confirm your email for Buildwise",
    greeting: `Hi ${user.name},`,
    body: "Please confirm this is your email address. We use it to recover your account and to contact you about professional reviews of your designs.",
    action: "Confirm email",
    url: appUrl(`/verify-email?token=${encodeURIComponent(token)}`),
    footer: "This link expires in 48 hours. If you didn’t create a Buildwise account, you can ignore this email.",
  }));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const limit = await consumeRateLimit(`signup:ip:${await clientIp()}`, 10, 3600);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };
  const parsed = SignUpSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { name, email, password } = parsed.data;
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    return { fieldErrors: { email: "An account with this email already exists. Try signing in or resetting your password." } };
  }
  const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
  // Every new account starts with its own copy of the sample project so nothing is empty.
  const sample = SAMPLE_PROJECTS[0];
  await createProject({
    userId: user.id, name: sample.name, regionId: sample.regionId, addressLine: sample.addressLine,
    plot: sample.plot, requirements: sample.requirements, budget: sample.budget,
    conceptKey: sample.conceptKey, description: sample.description, isSample: true,
  });
  await sendVerificationEmail(user);
  await createSession(user.id);
  redirect("/app");
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = SignInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { email, password } = parsed.data;
  // Per-IP limit slows credential stuffing; per-account limit slows guessing one password.
  const byIp = await consumeRateLimit(`signin:ip:${await clientIp()}`, 30, 900);
  const byAccount = await consumeRateLimit(`signin:email:${email}`, 8, 900);
  if (!byIp.ok || !byAccount.ok) return { error: retryMessage(Math.max(byIp.retryAfter, byAccount.retryAfter)) };

  const user = await db.user.findUnique({ where: { email } });
  if (!(await verifyPasswordOrDummy(password, user?.passwordHash))) {
    return { error: "Email or password is incorrect." };
  }
  await resetRateLimit(`signin:email:${email}`);
  await db.session.deleteMany({ where: { userId: user!.id, expiresAt: { lt: new Date() } } });
  await createSession(user!.id);
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/app") && !next.startsWith("//") ? next : "/app");
}

export async function signOut() {
  await destroySession();
  redirect("/");
}

/** Always returns the same message whether or not the account exists. */
export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = Email.safeParse(form.get("email"));
  if (!parsed.success) return { fieldErrors: { email: "Enter a valid email address." } };
  const email = parsed.data;
  const byIp = await consumeRateLimit(`reset:ip:${await clientIp()}`, 10, 3600);
  const byAccount = await consumeRateLimit(`reset:email:${email}`, 3, 3600);
  const generic = { message: "If an account exists for that email, we’ve sent a link to reset your password. It expires in 30 minutes." };
  if (!byIp.ok) return { error: retryMessage(byIp.retryAfter) };
  if (!byAccount.ok) return generic;
  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
  if (user) {
    const token = await issueAuthToken(user.id, "PASSWORD_RESET");
    await sendEmail(actionEmail({
      to: user.email,
      subject: "Reset your Buildwise password",
      greeting: `Hi ${user.name},`,
      body: "We received a request to reset your password. Use the button below to choose a new one.",
      action: "Reset password",
      url: appUrl(`/reset-password?token=${encodeURIComponent(token)}`),
      footer: "This link expires in 30 minutes and can be used once. If you didn’t ask for this, you can ignore this email — your password won’t change.",
    }));
  }
  return generic;
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const password = Password.safeParse(form.get("password"));
  if (!password.success) return { fieldErrors: { password: password.error.issues[0].message } };
  if (form.get("password") !== form.get("confirm")) return { fieldErrors: { confirm: "Passwords don’t match." } };
  const limit = await consumeRateLimit(`resetpw:ip:${await clientIp()}`, 20, 3600);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };
  const userId = await consumeAuthToken(String(form.get("token") ?? ""), "PASSWORD_RESET");
  if (!userId) return { error: "This reset link is invalid or has expired. Please request a new one." };
  await db.user.update({
    where: { id: userId },
    // Receiving the reset email proves control of the inbox.
    data: { passwordHash: await hashPassword(password.data), passwordChangedAt: new Date(), emailVerifiedAt: new Date() },
  });
  await destroyAllSessions(userId);
  await createSession(userId);
  redirect("/app?notice=password-reset");
}

export async function changePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const user = await requireUser();
  const limit = await consumeRateLimit(`changepw:user:${user.id}`, 10, 3600);
  if (!limit.ok) return { error: retryMessage(limit.retryAfter) };
  const next = Password.safeParse(form.get("password"));
  if (!next.success) return { fieldErrors: { password: next.error.issues[0].message } };
  if (form.get("password") !== form.get("confirm")) return { fieldErrors: { confirm: "Passwords don’t match." } };
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (!(await verifyPassword(String(form.get("current") ?? ""), row.passwordHash))) {
    return { fieldErrors: { current: "Your current password is incorrect." } };
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next.data), passwordChangedAt: new Date() } });
  // Sign out other devices; keep this one signed in with a fresh session.
  await destroyAllSessions(user.id);
  await createSession(user.id);
  return { message: "Password changed. You’ve been signed out on other devices." };
}

export async function verifyEmailToken(token: string) {
  const userId = await consumeAuthToken(token, "EMAIL_VERIFICATION");
  if (!userId) return false;
  await db.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return true;
}

export async function resendVerification(): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  if (user.emailVerifiedAt) return { ok: true, message: "Your email is already confirmed." };
  const limit = await consumeRateLimit(`verify:user:${user.id}`, 3, 3600);
  if (!limit.ok) return { ok: false, message: retryMessage(limit.retryAfter) };
  const sent = await sendVerificationEmail(user);
  return sent
    ? { ok: true, message: `We’ve sent a new confirmation link to ${user.email}.` }
    : { ok: false, message: "We couldn’t send the email right now. Please try again later." };
}

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
  refresh();
}

export async function setMeasurementSystem(system: string) {
  if (system !== "metric" && system !== "imperial") return;
  (await cookies()).set("bw_units", system, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { measurementSystem: system } });
  refresh();
}
