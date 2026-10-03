import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifyEmailToken } from "@/app/actions/auth";
import { Button, LinkButton, Notice } from "@/components/ui";
import { getCurrentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Confirm email", referrer: "no-referrer" };

/**
 * Confirmation happens on an explicit button press (POST), not on page load,
 * so link-scanning email security tools can't consume the token.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const { token, status } = await searchParams;
  const user = await getCurrentUser();

  async function confirm(form: FormData) {
    "use server";
    const ok = await verifyEmailToken(String(form.get("token") ?? ""));
    redirect(`/verify-email?status=${ok ? "ok" : "invalid"}`);
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Confirm your email</h1>
      <div className="mt-8 space-y-4">
        {status === "ok" && (
          <>
            <Notice tone="ok" title="Email confirmed">Thanks — your email address is confirmed.</Notice>
            <LinkButton href={user ? "/app" : "/login"} variant="primary">{user ? "Continue to Buildwise" : "Sign in"}</LinkButton>
          </>
        )}
        {status === "invalid" && (
          <Notice tone="danger" title="This link is invalid or has expired">
            Sign in and use “Resend confirmation email” to get a new link.
          </Notice>
        )}
        {!status && token && (
          <form action={confirm} className="space-y-4">
            <input type="hidden" name="token" value={token} />
            <p className="text-[14px] text-muted">Press the button to confirm this email address belongs to you.</p>
            <Button type="submit" variant="primary" size="lg" className="w-full">Confirm my email</Button>
          </form>
        )}
        {!status && !token && <Notice tone="warn">Open the confirmation link from your email.</Notice>}
      </div>
    </div>
  );
}
