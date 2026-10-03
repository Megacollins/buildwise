"use client";

import { createContext, useContext, useMemo } from "react";
import { createT, type Locale, type Messages, type TFunction, localeInfo } from "./config";
import type { MeasurementSystem } from "@/domain/units";

interface Ctx { locale: Locale; t: TFunction; bcp47: string; system: MeasurementSystem }
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, messages, system, children }: {
  locale: Locale; messages: Messages; system: MeasurementSystem; children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ locale, t: createT(messages), bcp47: localeInfo(locale).bcp47, system }),
    [locale, messages, system],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
