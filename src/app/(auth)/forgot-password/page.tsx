import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/shell/AccountForms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-[13.5px] text-muted">Enter the email you signed up with and we’ll send you a link to choose a new password.</p>
      <div className="mt-8"><ForgotPasswordForm /></div>
    </div>
  );
}
