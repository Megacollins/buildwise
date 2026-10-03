/** Locale-aware formatting. Kept separate from app logic and the domain layer. */

export function formatMoney(amount: number, currency: string, bcp47 = "en", opts: { compact?: boolean } = {}) {
  // Round to a sensible precision: estimates should never look more precise than they are.
  const magnitude = Math.abs(amount);
  const step = magnitude >= 1e7 ? 1e5 : magnitude >= 1e5 ? 1e3 : magnitude >= 1e3 ? 10 : 1;
  const rounded = Math.round(amount / step) * step;
  return new Intl.NumberFormat(bcp47, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: opts.compact ? "compact" : "standard",
  }).format(rounded);
}

export function formatMoneyRange(range: [number, number], currency: string, bcp47 = "en", compact = true) {
  return `${formatMoney(range[0], currency, bcp47, { compact })} – ${formatMoney(range[1], currency, bcp47, { compact })}`;
}

export function formatNumber(n: number, bcp47 = "en", digits = 0) {
  return new Intl.NumberFormat(bcp47, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export function formatDate(d: Date | string, bcp47 = "en") {
  return new Intl.DateTimeFormat(bcp47, { dateStyle: "medium" }).format(new Date(d));
}

export function formatDateTime(d: Date | string, bcp47 = "en") {
  return new Intl.DateTimeFormat(bcp47, { dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}
