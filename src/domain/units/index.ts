/**
 * Units.
 *
 * All geometry in Buildwise is stored as integer millimetres (see `Mm`).
 * Nothing in the building model is ever stored as a formatted string.
 * Conversion happens only at the presentation layer, through this module.
 */

export type Mm = number;
export type MeasurementSystem = "metric" | "imperial";

export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;
export const M2_PER_FT2 = 0.09290304;

export const mmToM = (mm: Mm) => mm / 1000;
export const mToMm = (m: number): Mm => Math.round(m * 1000);
export const ftToMm = (ft: number): Mm => Math.round(ft * MM_PER_FOOT);
export const mmToFt = (mm: Mm) => mm / MM_PER_FOOT;
/** Area in mm² → m² */
export const mm2ToM2 = (mm2: number) => mm2 / 1_000_000;
export const m2ToFt2 = (m2: number) => m2 / M2_PER_FT2;
export const ft2ToM2 = (ft2: number) => ft2 * M2_PER_FT2;

/** Parse a user-entered length (in the given unit) into mm. */
export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft" | "yd";

const MM_PER: Record<LengthUnit, number> = {
  mm: 1, cm: 10, m: 1000, in: MM_PER_INCH, ft: MM_PER_FOOT, yd: MM_PER_FOOT * 3,
};

export function toMm(value: number, unit: LengthUnit): Mm {
  return Math.round(value * MM_PER[unit]);
}
export function fromMm(mm: Mm, unit: LengthUnit): number {
  return mm / MM_PER[unit];
}

/** Format a length for display. Metric → "4.20 m", imperial → 13' 9" */
export function formatLength(mm: Mm, system: MeasurementSystem, opts: { compact?: boolean } = {}): string {
  if (system === "metric") {
    const m = mm / 1000;
    return opts.compact ? m.toFixed(2) : `${m.toFixed(2)} m`;
  }
  const totalIn = Math.round(mm / MM_PER_INCH);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn - ft * 12;
  return inch === 0 ? `${ft}'` : `${ft}' ${inch}"`;
}

/** Dimension-string format used on drawings (no unit suffix for metric, like real sheets). */
export function formatDimension(mm: Mm, system: MeasurementSystem): string {
  if (system === "metric") return (mm / 1000).toFixed(2);
  return formatLength(mm, "imperial");
}

export function formatArea(m2: number, system: MeasurementSystem, digits = 1): string {
  if (system === "metric") return `${m2.toFixed(digits)} m²`;
  return `${Math.round(m2ToFt2(m2)).toLocaleString("en-US")} ft²`;
}

export function areaUnitLabel(system: MeasurementSystem) {
  return system === "metric" ? "m²" : "ft²";
}

/** Convert a per-m² rate into the display system's per-area rate. */
export function perAreaRate(ratePerM2: number, system: MeasurementSystem) {
  return system === "metric" ? ratePerM2 : ratePerM2 * M2_PER_FT2;
}
