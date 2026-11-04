import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { getI18n } from "@/server/i18n";
import { Card, CardHeader, PageHeader, Badge } from "@/components/ui";
import { LanguageSwitcher } from "@/components/shell/LanguageSwitcher";
import { LOCALES } from "@/i18n/config";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const { t } = await getI18n();
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader title={t("nav.settings")} />
      <Card>
        <CardHeader title="Account" />
        <dl className="grid gap-3 p-5 text-[13.5px] sm:grid-cols-2">
          <div><dt className="text-faint">Name</dt><dd>{user.name}</dd></div>
          <div>
            <dt className="text-faint">Email</dt>
            <dd className="flex flex-wrap items-center gap-2">{user.email} {user.googleId ? <Badge tone="ok">Google account</Badge> : <Badge>Local demo</Badge>}</dd>
          </div>
        </dl>
        <p className="px-5 pb-5 text-[12.5px] text-muted">
          {user.googleId ? "You sign in with Google. Your name and email come from your Google account." : "This is the local demo account, available only on a development machine."}
        </p>
      </Card>
      <Card>
        <CardHeader title={`${t("field.language")} & ${t("field.units").toLowerCase()}`} subtitle="Applies to menus, labels, drawings and number formats. Geometry is always stored in millimetres." />
        <div className="space-y-4 p-5">
          <LanguageSwitcher showUnits />
          <p className="text-[12.5px] text-muted">
            English is complete. Other languages are machine-drafted and awaiting review by native speakers; untranslated text falls back to English.
            Arabic uses a right-to-left layout.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {LOCALES.map((l) => <Badge key={l.code} tone={l.status === "complete" ? "ok" : "neutral"}>{l.label} · {l.status}</Badge>)}
          </div>
        </div>
      </Card>
    </main>
  );
}
