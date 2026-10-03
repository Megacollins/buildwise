import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, createT, getMessages, isLocale, localeInfo, type Locale } from "@/i18n/config";
import type { MeasurementSystem } from "@/domain/units";
import { getCurrentUser } from "./auth";

/** Locale precedence: explicit cookie → signed-in user preference → Accept-Language → English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  const user = await getCurrentUser();
  if (user && isLocale(user.locale)) return user.locale;
  const accept = (await headers()).get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const code = part.split(";")[0].trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
});

export const getMeasurementSystem = cache(async (): Promise<MeasurementSystem> => {
  const cookie = (await cookies()).get("bw_units")?.value;
  if (cookie === "metric" || cookie === "imperial") return cookie;
  const user = await getCurrentUser();
  return user?.measurementSystem ?? "metric";
});

export async function getI18n() {
  const locale = await getLocale();
  const messages = getMessages(locale);
  return { locale, messages, t: createT(messages), info: localeInfo(locale), bcp47: localeInfo(locale).bcp47 };
}
