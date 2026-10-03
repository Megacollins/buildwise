import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from "lucide-react";
import type { ValidationReport } from "@/domain/model/validate";
import { cx } from "@/components/ui";

const ICON = {
  pass: <CheckCircle2 className="size-4 shrink-0 text-ok" aria-label="Passed" />,
  warning: <AlertTriangle className="size-4 shrink-0 text-warn" aria-label="Needs review" />,
  error: <XCircle className="size-4 shrink-0 text-danger" aria-label="Failed" />,
};

/** Deterministic model check, grouped by topic. Server-renderable. */
export function ModelCheck({ report, compact = false }: { report: ValidationReport; compact?: boolean }) {
  const passed = report.results.filter((r) => r.status === "pass").length;
  const groups = [...new Set(report.results.map((r) => r.group))];
  return (
    <div>
      <div className="flex items-center gap-3 px-5 py-4">
        <ShieldCheck className={cx("size-5 shrink-0", report.valid ? "text-ok" : "text-danger")} aria-hidden />
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-text">
            {report.valid ? `Model check passed — ${passed} of ${report.results.length} rules` : `${report.errors} problem${report.errors === 1 ? "" : "s"} found`}
          </div>
          <div className="text-[12.5px] text-muted">
            {report.warnings ? `${report.warnings} item${report.warnings === 1 ? "" : "s"} to review. ` : ""}
            Geometry, openings, circulation, stairs and site — checked by rules, not AI.
          </div>
        </div>
      </div>
      {!compact && (
        <div className="divide-y divide-line border-t border-line">
          {groups.map((g) => {
            const rules = report.results.filter((r) => r.group === g);
            const worst = rules.some((r) => r.status === "error") ? "error" : rules.some((r) => r.status === "warning") ? "warning" : "pass";
            return (
              <details key={g} open={worst !== "pass"} className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-2.5 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  {ICON[worst]}
                  <span className="flex-1 text-[13px] text-text">{g}</span>
                  <span className="text-[12px] text-faint tabular">{rules.filter((r) => r.status === "pass").length}/{rules.length}</span>
                </summary>
                <ul className="space-y-2 px-5 pb-3 ps-12">
                  {rules.map((r) => (
                    <li key={r.id} className="text-[12.5px]">
                      <div className="flex items-start gap-2">
                        {ICON[r.status]}
                        <span className={r.status === "pass" ? "text-muted" : "text-text"}>{r.label}</span>
                      </div>
                      {report.issues.filter((i) => i.rule === r.id).slice(0, 4).map((i, k) => (
                        <p key={k} className="ms-6 mt-1 text-[12px] text-muted">{i.message}</p>
                      ))}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
      <p className="border-t border-line px-5 py-3 text-[11.5px] text-faint">
        Passing means the design is internally consistent. It is not a building-code, structural or planning approval.
      </p>
    </div>
  );
}
