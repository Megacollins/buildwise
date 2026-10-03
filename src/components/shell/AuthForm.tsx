"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/app/actions/auth";
import { Button, Field, Input, Notice } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export function AuthForm({ mode, next }: { mode: "signin" | "signup"; next?: string }) {
  const { t } = useI18n();
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "signin" ? signIn : signUp, undefined);
  const fe = state?.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state?.error && <Notice tone="danger">{state.error}</Notice>}
      {mode === "signup" && (
        <Field label={t("auth.name")} htmlFor="name" error={fe.name}>
          <Input id="name" name="name" autoComplete="name" required aria-invalid={!!fe.name} />
        </Field>
      )}
      <Field label={t("auth.email")} htmlFor="email" error={fe.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!fe.email} />
      </Field>
      {mode === "signin" && (
        <div className="-mb-2 flex justify-end"><Link href="/forgot-password" className="text-[12.5px] text-muted hover:text-text">Forgot password?</Link></div>
      )}
      <Field label={t("auth.password")} htmlFor="password" error={fe.password} hint={mode === "signup" ? t("auth.passwordHint") : undefined}>
        <Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required aria-invalid={!!fe.password} />
      </Field>
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending ? t("common.loading") : mode === "signin" ? t("auth.submitSignIn") : t("auth.submitSignUp")}
      </Button>
      <p className="text-center text-[13px] text-muted">
        {mode === "signin" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
        <Link href={mode === "signin" ? "/signup" : "/login"} className="font-medium text-accent-strong hover:underline">
          {mode === "signin" ? t("auth.submitSignUp") : t("auth.submitSignIn")}
        </Link>
      </p>
    </form>
  );
}
