"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { MailWarning } from "lucide-react";
import { changePassword, requestPasswordReset, resendVerification, resetPassword, type AuthState } from "@/app/actions/auth";
import { Button, Field, Input, Notice } from "@/components/ui";

function Feedback({ state }: { state: AuthState }) {
  if (state?.error) return <Notice tone="danger">{state.error}</Notice>;
  if (state?.message) return <Notice tone="ok">{state.message}</Notice>;
  return null;
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Feedback state={state} />
      <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</Button>
      <p className="text-center text-[13px] text-muted"><Link href="/login" className="text-accent-strong hover:underline">Back to sign in</Link></p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(resetPassword, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <Feedback state={state} />
      {state?.error && <p className="text-[13px]"><Link href="/forgot-password" className="text-accent-strong hover:underline">Request a new link</Link></p>}
      <Field label="New password" htmlFor="password" error={fe.password} hint="At least 10 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={fe.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>{pending ? "Saving…" : "Set new password"}</Button>
      <p className="text-[12.5px] text-faint">You’ll be signed out on all other devices.</p>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(changePassword, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="grid max-w-md gap-4" noValidate key={state?.message ?? "form"}>
      <Feedback state={state} />
      <Field label="Current password" htmlFor="current" error={fe.current}>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="new-password" error={fe.password} hint="At least 10 characters.">
        <Input id="new-password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={fe.confirm}>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <div><Button type="submit" variant="primary" disabled={pending}>{pending ? "Saving…" : "Change password"}</Button></div>
    </form>
  );
}

export function ResendVerificationButton({ variant = "secondary" }: { variant?: "secondary" | "ghost" }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <Button size="sm" variant={variant} disabled={pending} onClick={() => start(async () => setResult(await resendVerification()))}>
        {pending ? "Sending…" : "Resend confirmation email"}
      </Button>
      {result && <span role="status" className={result.ok ? "text-[12.5px] text-ok" : "text-[12.5px] text-danger"}>{result.message}</span>}
    </span>
  );
}

export function VerifyEmailBanner({ email }: { email: string }) {
  return (
    <div className="border-b border-warn/25 bg-warn-soft">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-2.5 text-[13px] sm:px-8">
        <MailWarning className="size-4 shrink-0 text-warn" aria-hidden />
        <span className="text-text">Please confirm your email address (<span className="font-medium">{email}</span>) so you can recover your account and request professional reviews.</span>
        <ResendVerificationButton variant="ghost" />
      </div>
    </div>
  );
}
