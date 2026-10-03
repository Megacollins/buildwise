"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import { LOCALES } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { setLocale, setMeasurementSystem } from "@/app/actions/auth";
import { cx } from "@/components/ui";

export function LanguageSwitcher({ className, showUnits = false }: { className?: string; showUnits?: boolean }) {
  const { locale, system } = useI18n();
  const [pending, start] = useTransition();
  return (
    <div className={cx("flex items-center gap-2", pending && "opacity-60", className)}>
      <label className="relative flex items-center">
        <Globe className="pointer-events-none absolute start-2 size-3.5 text-muted" aria-hidden />
        <span className="sr-only">Language</span>
        <select value={locale} onChange={(e) => start(() => setLocale(e.target.value))}
          className="h-8 appearance-none rounded-md border border-line bg-surface ps-7 pe-2 text-[12.5px] text-text hover:border-line-strong">
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>{l.label}{l.status === "draft" ? " (draft)" : ""}</option>
          ))}
        </select>
      </label>
      {showUnits && (
        <label className="flex items-center">
          <span className="sr-only">Units</span>
          <select value={system} onChange={(e) => start(() => setMeasurementSystem(e.target.value))}
            className="h-8 appearance-none rounded-md border border-line bg-surface px-2 text-[12.5px] text-text hover:border-line-strong">
            <option value="metric">m / m²</option>
            <option value="imperial">ft / ft²</option>
          </select>
        </label>
      )}
    </div>
  );
}
