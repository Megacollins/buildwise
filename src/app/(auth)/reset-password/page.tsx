import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/shell/AccountForms";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

/** The token is only checked and consumed when the form is submitted, so email link scanners can't use it up. */
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <div className="mt-8">
        {token ? <ResetPasswordForm token={token} /> : (
          <Notice tone="warn" title="This link is incomplete">
            Open the link from your email again, or <Link href="/forgot-password" className="text-accent-strong hover:underline">request a new one</Link>.
          </Notice>
        )}
      </div>
    </div>
  );
}
