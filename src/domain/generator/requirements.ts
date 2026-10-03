import { z } from "zod";

/** What the user asked for. Stored on the project; the generator turns it into a model. */
export const RequirementsSchema = z.object({
  bedrooms: z.number().int().min(1).max(8),
  bathrooms: z.number().int().min(1).max(8),
  floors: z.number().int().min(1).max(3),
  parking: z.number().int().min(0).max(4),
  garage: z.boolean().default(false),
  office: z.boolean().default(false),
  laundry: z.boolean().default(true),
  storage: z.boolean().default(false),
  guestRoomDownstairs: z.boolean().default(false),
  familyLounge: z.boolean().default(false),
  separateDining: z.boolean().default(true),
  balcony: z.boolean().default(false),
  outdoorSpace: z.boolean().default(true),
  pool: z.boolean().default(false),
  /** Formal guest reception room near the entrance */
  majlis: z.boolean().default(false),
  /** Household staff rooms, each with its own bathroom */
  staffRooms: z.number().int().min(0).max(2).default(0),
  /** Covered parking over the open parking bays */
  carport: z.boolean().default(false),
  style: z.string().min(1).max(40).default("modern"),
  notes: z.string().max(2000).default(""),
});
export type Requirements = z.infer<typeof RequirementsSchema>;

export const PlotSchema = z.object({
  width: z.number().int().min(6000).max(200000), // mm
  depth: z.number().int().min(6000).max(200000),
  northAngleDeg: z.number().min(0).max(359).default(0),
});
export type PlotInput = z.infer<typeof PlotSchema>;

export const STYLES = [
  "modern", "contemporary", "minimalist", "traditional", "mediterranean", "scandinavian",
  "tropical", "industrial", "luxury", "regional", "custom",
] as const;
