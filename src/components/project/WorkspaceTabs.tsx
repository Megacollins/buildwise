"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { cx } from "@/components/ui";
import type { MessageKey } from "@/i18n/config";

const TABS: { seg: string; key: MessageKey }[] = [
  { seg: "", key: "ws.overview" }, { seg: "design", key: "ws.design" }, { seg: "plans", key: "ws.plans" },
  { seg: "3d", key: "ws.3d" }, { seg: "materials", key: "ws.materials" }, { seg: "cost", key: "ws.cost" },
  { seg: "documents", key: "ws.documents" }, { seg: "professionals", key: "ws.professionals" }, { seg: "versions", key: "ws.versions" },
];

export function WorkspaceTabs({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const path = usePathname();
  const base = `/app/projects/${projectId}`;
  return (
    <nav aria-label="Project" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none]">
      {TABS.map((tab) => {
        const href = tab.seg ? `${base}/${tab.seg}` : base;
        const active = tab.seg ? path.startsWith(href) : path === base;
        return (
          <Link key={tab.seg} href={href} aria-current={active ? "page" : undefined}
            className={cx("whitespace-nowrap border-b-2 px-3 py-3 text-[13.5px] transition-colors",
              active ? "border-accent font-medium text-text" : "border-transparent text-muted hover:text-text")}>
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
