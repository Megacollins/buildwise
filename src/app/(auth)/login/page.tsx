import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/shell/AuthForm";
import { getI18n } from "@/server/i18n";
import { getCurrentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/app");
  const { t } = await getI18n();
  const { next } = await searchParams;
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{t("auth.signInTitle")}</h1>
      <div className="mt-8"><AuthForm mode="signin" next={next} /></div>
    </div>
  );
}
