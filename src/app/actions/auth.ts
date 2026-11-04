"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { db } from "@/server/db";
import { createSession, destroySession, getCurrentUser } from "@/server/auth";
import { LOCAL_DEMO_EMAIL, localDemoSignInAvailable } from "@/server/local-demo";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

// Signing in is "Continue with Google" (src/server/google.ts, /api/auth/google).

export async function signOut() {
  await destroySession();
  redirect("/");
}

/** Local development only: sign in to the seeded demo account (see src/server/local-demo.ts). */
export async function signInAsLocalDemo(next?: string) {
  if (!localDemoSignInAvailable()) redirect("/login");
  const user = await db.user.findUnique({ where: { email: LOCAL_DEMO_EMAIL }, select: { id: true } });
  if (!user) redirect("/login?error=no_demo");
  await createSession(user.id);
  redirect(next && next.startsWith("/app") && !next.startsWith("//") ? next : "/app");
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
