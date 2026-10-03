import { en, type MessageKey, type Messages } from "./messages/en";
import * as drafts from "./messages/drafts";

export type Locale = "en" | "fr" | "es" | "pt" | "ar" | "de" | "zh" | "ja" | "hi" | "yo" | "ig" | "ha";

export interface LocaleInfo {
  code: Locale;
  /** Name in its own language */
  label: string;
  dir: "ltr" | "rtl";
  /** complete = fully reviewed; draft = machine-drafted, partial, falls back to English */
  status: "complete" | "draft";
  /** BCP-47 tag for number/date formatting */
  bcp47: string;
}

export const LOCALES: LocaleInfo[] = [
  { code: "en", label: "English", dir: "ltr", status: "complete", bcp47: "en" },
  { code: "fr", label: "Français", dir: "ltr", status: "draft", bcp47: "fr" },
  { code: "es", label: "Español", dir: "ltr", status: "draft", bcp47: "es" },
  { code: "pt", label: "Português", dir: "ltr", status: "draft", bcp47: "pt" },
  { code: "ar", label: "العربية", dir: "rtl", status: "draft", bcp47: "ar" },
  { code: "de", label: "Deutsch", dir: "ltr", status: "draft", bcp47: "de" },
  { code: "zh", label: "中文", dir: "ltr", status: "draft", bcp47: "zh-CN" },
  { code: "ja", label: "日本語", dir: "ltr", status: "draft", bcp47: "ja" },
  { code: "hi", label: "हिन्दी", dir: "ltr", status: "draft", bcp47: "hi" },
  { code: "yo", label: "Yorùbá", dir: "ltr", status: "draft", bcp47: "yo" },
  { code: "ig", label: "Igbo", dir: "ltr", status: "draft", bcp47: "ig" },
  { code: "ha", label: "Hausa", dir: "ltr", status: "draft", bcp47: "ha" },
];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "bw_locale";

const DICTS: Record<Locale, Partial<Messages>> = {
  en, fr: drafts.fr, es: drafts.es, pt: drafts.pt, ar: drafts.ar, de: drafts.de,
  zh: drafts.zh, ja: drafts.ja, hi: drafts.hi, yo: drafts.yo, ig: drafts.ig, ha: drafts.ha,
};

export const isLocale = (v: unknown): v is Locale => LOCALES.some((l) => l.code === v);
export const localeInfo = (l: Locale) => LOCALES.find((x) => x.code === l)!;

/** Full dictionary for a locale with per-key English fallback. */
export function getMessages(locale: Locale): Messages {
  return { ...en, ...DICTS[locale] } as Messages;
}

export type TFunction = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function createT(messages: Messages): TFunction {
  return (key, vars) => {
    let s = messages[key] ?? en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

export type { MessageKey, Messages };
