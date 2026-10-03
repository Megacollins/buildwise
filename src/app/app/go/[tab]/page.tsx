import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";

const TABS = new Set(["design", "plans", "3d", "materials", "cost"]);

/** Global workspace nav items open the most recently edited project at that tab. */
export default async function GoToTab({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const user = await requireUser();
  const latest = await db.project.findFirst({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" }, select: { id: true } });
  if (!latest) redirect("/app/new");
  redirect(`/app/projects/${latest.id}/${TABS.has(tab) ? tab : ""}`);
}
