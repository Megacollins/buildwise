import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/shell/AuthForm";
import { getI18n } from "@/server/i18n";
import { getCurrentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/app");
  const { t } = await getI18n();
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("auth.signUpTitle")}</h1>
      <p className="mt-2 text-[13.5px] text-muted">{t("auth.sampleNote")}</p>
      <div className="mt-8"><AuthForm mode="signup" /></div>
    </div>
  );
}
