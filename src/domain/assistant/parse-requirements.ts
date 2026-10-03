/**
 * Deterministic extraction of structured requirements from a plain-language
 * description (English only for now). Only fields that are clearly stated are
 * returned, so the user always sees and confirms what was understood.
 */
import type { Requirements } from "@/domain/generator/requirements";
import { STYLES } from "@/domain/generator/requirements";

const NUMBER_WORDS: Record<string, number> = {
  one: 1, single: 1, a: 1, an: 1, two: 2, double: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
};
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s.toLowerCase()]);
const N = "(\\d+|one|two|three|four|five|six|seven|eight|a|an|single|double)";

export interface ParsedRequirements { fields: Partial<Requirements>; understood: string[] }

export function parseRequirements(text: string): ParsedRequirements {
  const t = text.toLowerCase();
  const f: Partial<Requirements> = {};
  const understood: string[] = [];
  const grab = (re: RegExp) => { const m = t.match(re); return m ? num(m[1]) : undefined; };

  const beds = grab(new RegExp(`${N}[\\s-]*(?:bed(?:room)?s?|br)\\b`));
  if (beds && beds <= 8) { f.bedrooms = beds; understood.push(`${beds} bedrooms`); }
  const baths = grab(new RegExp(`${N}[\\s-]*(?:bath(?:room)?s?|toilets?)\\b`));
  if (baths && baths <= 8) { f.bathrooms = baths; understood.push(`${baths} bathrooms`); }
  const floors = grab(new RegExp(`${N}[\\s-]*(?:stor(?:e)?y|stories|storeys|floors?|levels?)\\b`));
  if (floors && floors <= 3) { f.floors = floors; understood.push(`${floors} floor${floors > 1 ? "s" : ""}`); }
  else if (/\b(duplex|two[- ]storey|two[- ]story|upstairs)\b/.test(t)) { f.floors = 2; understood.push("2 floors"); }
  else if (/\b(bungalow|single[- ]storey|single[- ]story|one level)\b/.test(t)) { f.floors = 1; understood.push("1 floor"); }

  const cars = grab(new RegExp(`(?:parking|space|room)\\s+for\\s+${N}\\s+cars?`)) ?? grab(new RegExp(`${N}[\\s-]*(?:car|parking)`));
  if (cars && cars <= 4) { f.parking = cars; understood.push(`parking for ${cars}`); }
  if (/\bgarage\b/.test(t)) { f.garage = true; understood.push("garage"); if (!f.parking) f.parking = 1; }
  if (/\b(office|study|work from home)\b/.test(t)) { f.office = true; understood.push("home office"); }
  if (/\blaundry\b/.test(t)) { f.laundry = true; understood.push("laundry"); }
  if (/\b(store|storage|pantry)\b/.test(t)) { f.storage = true; understood.push("storage"); }
  if (/\b(parents?|elderly|guest)\b.*\b(downstairs|ground floor)\b|\bground[- ]floor bedroom\b/.test(t)) { f.guestRoomDownstairs = true; understood.push("bedroom downstairs"); }
  if (/\b(family (lounge|room)|tv room|upstairs lounge)\b/.test(t)) { f.familyLounge = true; understood.push("family lounge"); }
  if (/\bbalcon(y|ies)\b/.test(t)) { f.balcony = true; understood.push("balcony"); }
  if (/\b(swimming[- ]?pool|pool)\b/.test(t)) { f.pool = true; understood.push("swimming pool"); }
  if (/\bmajlis\b/.test(t)) { f.majlis = true; understood.push("majlis"); }
  const staff = (/\b(maid|housekeeper|nanny|helper)('?s)?\b/.test(t) ? 1 : 0) + (/\bdriver('?s)?\b/.test(t) ? 1 : 0)
    || (/\b(staff room|staff quarters|boys'? ?quarters?)\b/.test(t) ? 1 : 0);
  if (staff) { f.staffRooms = Math.min(2, staff); understood.push(`${f.staffRooms} staff room${f.staffRooms > 1 ? "s" : ""}`); }
  if (/\b(carport|covered parking|shaded parking|car shade)\b/.test(t)) { f.carport = true; understood.push("carport"); }
  if (/\bopen[- ]plan\b/.test(t)) { f.separateDining = false; understood.push("open-plan dining"); }
  for (const s of STYLES) if (s !== "custom" && t.includes(s)) { f.style = s; understood.push(`${s} style`); break; }
  return { fields: f, understood };
}
