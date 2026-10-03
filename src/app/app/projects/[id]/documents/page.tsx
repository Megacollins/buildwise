import Link from "next/link";
import { FileText, FileSpreadsheet, Box, Stamp, Printer } from "lucide-react";
import { loadWorkspace } from "@/server/workspace";
import { Badge, Card, CardHeader, Notice } from "@/components/ui";

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await loadWorkspace(id);
  const base = `/app/projects/${id}`;
  const docs = [
    { icon: FileText, title: "Architectural plan package", body: "Site plan, floor plans, elevations and section with title blocks.", status: "print", href: `${base}/plans` },
    { icon: FileSpreadsheet, title: "Room, door & window schedules", body: "Generated from the model on sheet A-601.", status: "print", href: `${base}/plans` },
    { icon: FileSpreadsheet, title: "Finishes / material schedule", body: "Room-by-room finishes from your selections (sheet A-602).", status: "print", href: `${base}/plans` },
    { icon: FileText, title: "Cost estimate", body: "Itemised estimate with quantities, rates and basis.", status: "view", href: `${base}/cost` },
    { icon: FileText, title: "Project summary PDF", body: "One-page brief, key figures and drawings.", status: "soon" },
    { icon: Box, title: "3D model export (glTF / IFC)", body: "For use in other design tools.", status: "soon" },
    { icon: Stamp, title: "Professional review documents", body: "Available once a qualified professional has reviewed the design.", status: "locked" },
  ] as const;
  return (
    <div className="space-y-5">
      <Notice tone="info" title="Documents are generated from the current design version">
        Printable sheets are available now from the Plans tab. Direct PDF generation and model exports are on the roadmap.
      </Notice>
      <Card>
        <CardHeader title="Project documents" />
        <ul className="divide-y divide-line">
          {docs.map((d) => (
            <li key={d.title} className="flex items-center gap-4 px-5 py-4">
              <d.icon className="size-5 shrink-0 text-faint" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-medium text-text">{d.title}</div>
                <div className="text-[12.5px] text-muted">{d.body}</div>
              </div>
              {d.status === "print" && <Link href={d.href} className="inline-flex items-center gap-1.5 text-[13px] text-accent-strong hover:underline"><Printer className="size-3.5" aria-hidden />Open & print</Link>}
              {d.status === "view" && <Link href={d.href} className="text-[13px] text-accent-strong hover:underline">View</Link>}
              {d.status === "soon" && <Badge>Coming soon</Badge>}
              {d.status === "locked" && <Badge tone="warn">Professional review required</Badge>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
