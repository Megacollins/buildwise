"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FolderKanban, PencilRuler, LayoutGrid, Box, Palette, Calculator, HardHat, Settings, Plus, LogOut } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { cx, Logo } from "@/components/ui";
import { signOut } from "@/app/actions/auth";
import type { MessageKey } from "@/i18n/config";

const NAV: { href: string; key: MessageKey; icon: typeof Home; match?: RegExp }[] = [
  { href: "/app", key: "nav.home", icon: Home, match: /^\/app$/ },
  { href: "/app/projects", key: "nav.projects", icon: FolderKanban, match: /^\/app\/projects(\/[^/]+)?$/ },
  { href: "/app/go/design", key: "nav.design", icon: PencilRuler, match: /\/design$/ },
  { href: "/app/go/plans", key: "nav.plans", icon: LayoutGrid, match: /\/plans$/ },
  { href: "/app/go/3d", key: "nav.3d", icon: Box, match: /\/3d$/ },
  { href: "/app/go/materials", key: "nav.materials", icon: Palette, match: /\/materials$/ },
  { href: "/app/go/cost", key: "nav.cost", icon: Calculator, match: /\/cost$/ },
  { href: "/app/professionals", key: "nav.professionals", icon: HardHat, match: /professionals$/ },
  { href: "/app/settings", key: "nav.settings", icon: Settings, match: /^\/app\/settings/ },
];

export function Sidebar({ userName }: { userName: string }) {
  const { t } = useI18n();
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-e border-line bg-surface/60 lg:flex">
      <div className="flex h-16 items-center px-5"><Link href="/app" aria-label="Buildwise home"><Logo /></Link></div>
      <div className="px-3">
        <Link href="/app/new" className="flex h-9 items-center justify-center gap-2 rounded-lg bg-accent text-[13.5px] font-medium text-accent-ink hover:bg-accent-strong">
          <Plus className="size-4" aria-hidden /> {t("dash.create")}
        </Link>
      </div>
      <nav aria-label="Main" className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map((n, i) => {
          const active = n.match?.test(path) ?? path === n.href;
          return (
            <div key={n.href}>
              {i === 2 && <div className="mx-2 mb-1 mt-4 text-[11px] font-medium uppercase tracking-wider text-faint">Workspace</div>}
              {i === 7 && <div className="mx-2 mb-1 mt-4 h-px bg-line" />}
              <Link href={n.href} aria-current={active ? "page" : undefined}
                className={cx("flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] transition-colors",
                  active ? "bg-surface-3 font-medium text-text" : "text-muted hover:bg-surface-2 hover:text-text")}>
                <n.icon className={cx("size-4", active ? "text-accent-strong" : "text-faint")} aria-hidden />
                {t(n.key)}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-text" aria-hidden>
            {userName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 truncate text-[13px] text-text">{userName}</div>
          <form action={signOut}>
            <button className="rounded-md p-1.5 text-faint hover:bg-surface-2 hover:text-text" title={t("nav.signOut")} aria-label={t("nav.signOut")}>
              <LogOut className="size-4 rtl:rotate-180" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

/** Mobile: a purposeful bottom bar for the consumer tasks (projects, new, 3D, settings). */
export function MobileNav() {
  const { t } = useI18n();
  const path = usePathname();
  const items = [
    { href: "/app", icon: Home, label: t("nav.home"), active: path === "/app" },
    { href: "/app/projects", icon: FolderKanban, label: t("nav.projects"), active: path.startsWith("/app/projects") && !/\/3d$/.test(path) },
    { href: "/app/new", icon: Plus, label: "New", active: path === "/app/new", primary: true },
    { href: "/app/go/3d", icon: Box, label: "3D", active: /\/3d$/.test(path) },
    { href: "/app/settings", icon: Settings, label: t("nav.settings"), active: path.startsWith("/app/settings") },
  ];
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="grid grid-cols-5">
        {items.map((it) => (
          <li key={it.href}>
            <Link href={it.href} aria-current={it.active ? "page" : undefined}
              className={cx("flex h-16 flex-col items-center justify-center gap-1 text-[11px]", it.active ? "text-accent-strong" : "text-muted")}>
              {it.primary
                ? <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-ink"><it.icon className="size-5" aria-hidden /></span>
                : <it.icon className="size-5" aria-hidden />}
              {!it.primary && <span className="max-w-full truncate px-1">{it.label}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur lg:hidden">
      <Link href="/app" aria-label="Buildwise home"><Logo /></Link>
      <form action={signOut}>
        <button className="rounded-md p-2 text-faint hover:text-text" aria-label="Sign out"><LogOut className="size-4 rtl:rotate-180" aria-hidden /></button>
      </form>
    </header>
  );
}
