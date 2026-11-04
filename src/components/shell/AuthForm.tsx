"use client";

import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { signInAsLocalDemo } from "@/app/actions/auth";
import { Button, Notice, buttonClass, cx } from "@/components/ui";
import { useI18n } from "@/i18n/client";

const ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  expired: "That sign-in took too long or was started in another tab. Please try again.",
  failed: "We couldn’t complete Google sign-in. Please try again.",
  unverified: "Your Google account’s email address isn’t verified, so we can’t use it to sign you in.",
  conflict: "This email is already linked to a different Google account.",
  not_configured: "Google sign-in isn’t set up on this server yet.",
  rate_limited: "Too many sign-in attempts. Please wait a few minutes and try again.",
  no_demo: "The local demo account doesn’t exist yet — run `npm run db:seed`.",
};

/** Google is the only way to sign in; one button serves both new and returning people. */
export function AuthForm({ next, error, googleReady, localDemo }: { next?: string; error?: string; googleReady: boolean; localDemo: boolean }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const href = `/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <div className="space-y-4">
      {error && <Notice tone="danger">{ERRORS[error] ?? ERRORS.failed}</Notice>}
      {googleReady ? (
        <a href={href} className={cx(buttonClass("secondary", "lg"), "w-full justify-center gap-3")}>
          <GoogleMark /> {t("auth.continueWithGoogle")}
        </a>
      ) : (
        !error && <Notice tone="warn">{ERRORS.not_configured}</Notice>
      )}
      <p className="text-center text-[12.5px] text-muted">{t("auth.googleNote")}</p>
      {localDemo && (
        <div className="border-t border-line pt-4">
          <Button className="w-full" disabled={pending} onClick={() => start(() => signInAsLocalDemo(next))}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Sign in as the local demo user
          </Button>
          <p className="mt-2 text-center text-[12px] text-faint">Local development only — not available on a live site.</p>
        </div>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
