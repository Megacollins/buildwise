import type { Metadata } from "next";
import { requireUser } from "@/server/auth";
import { listRegions } from "@/server/catalog";
import { getI18n } from "@/server/i18n";
import { PageHeader } from "@/components/ui";
import { NewProjectWizard, type WizardRegion } from "@/components/wizard/NewProjectWizard";

export const metadata: Metadata = { title: "New home" };

export default async function NewProjectPage() {
  await requireUser();
  const { t } = await getI18n();
  const regions: WizardRegion[] = (await listRegions()).map((r) => ({
    id: r.id, country: r.country, subdivision: r.subdivision, city: r.city, currency: r.currency,
    measurementSystem: r.measurementSystem, climate: r.climate.summary, setbacks: r.planning.defaultSetbacks,
    suggests: {
      majlis: r.architecture.program.majlis, staffRooms: r.architecture.program.staffRooms, carport: r.architecture.carport.typical,
      why: [...(r.architecture.program.majlis || r.architecture.program.staffRooms ? [r.architecture.program.why] : []), ...(r.architecture.carport.typical ? [r.architecture.carport.why] : [])],
    },
  }));
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader eyebrow={t("dash.create")} title={t("wizard.title")} />
      <NewProjectWizard regions={regions} />
    </main>
  );
}
