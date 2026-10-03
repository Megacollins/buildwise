/** Demonstration projects. Cost figures produced for these are sample-data estimates. */
import type { PlotInput, Requirements } from "@/domain/generator/requirements";
import { ftToMm } from "@/domain/units";

export interface SampleProject {
  name: string;
  description: string;
  regionId: string;
  addressLine: string | null;
  plot: PlotInput;
  requirements: Requirements;
  budget: { target: number; min: number | null; max: number | null };
  conceptKey: "A" | "B" | "C";
}

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    name: "Modern 4 Bedroom Residence",
    description: "Two-storey family home on a standard 50 × 100 ft Lagos plot with open parking for two cars.",
    regionId: "ng-la-lagos",
    addressLine: "Lekki Phase 1 (sample location)",
    plot: { width: ftToMm(50), depth: ftToMm(100), northAngleDeg: 0 },
    requirements: {
      bedrooms: 4, bathrooms: 4, floors: 2, parking: 2, garage: false, office: false, laundry: true,
      storage: false, guestRoomDownstairs: true, familyLounge: false, separateDining: true, balcony: true,
      outdoorSpace: true, pool: false, majlis: false, staffRooms: 0, carport: false, style: "modern",
      notes: "Guest bedroom downstairs for visiting parents. Large kitchen.",
    },
    budget: { target: 30_000_000, min: null, max: 40_000_000 },
    conceptKey: "B",
  },
  {
    name: "L-shaped Family Home",
    description: "Two-storey contemporary home on a large Abuja plot: a single-storey garage wing projects forward with a terrace on its roof, the entrance tucked into the inner corner, and a pool in the garden.",
    regionId: "ng-fc-abuja",
    addressLine: "Guzape (sample location)",
    plot: { width: 25000, depth: 40000, northAngleDeg: 0 },
    requirements: {
      bedrooms: 4, bathrooms: 4, floors: 2, parking: 2, garage: true, office: true, laundry: true,
      storage: false, guestRoomDownstairs: true, familyLounge: true, separateDining: true, balcony: true,
      outdoorSpace: true, pool: true, majlis: false, staffRooms: 0, carport: false, style: "contemporary", notes: "Garage wing to the front with a terrace above, family lounge upstairs, pool in the garden.",
    },
    budget: { target: 250_000_000, min: null, max: null },
    conceptKey: "C",
  },
  {
    name: "Hill Country Family Home",
    description: "Single-storey three-bedroom home with a two-car garage.",
    regionId: "us-tx-austin",
    addressLine: null,
    plot: { width: ftToMm(70), depth: ftToMm(130), northAngleDeg: 20 },
    requirements: {
      bedrooms: 3, bathrooms: 2, floors: 1, parking: 2, garage: true, office: true, laundry: true,
      storage: false, guestRoomDownstairs: false, familyLounge: false, separateDining: false, balcony: false,
      outdoorSpace: true, pool: true, majlis: false, staffRooms: 0, carport: false, style: "scandinavian", notes: "Pool in the back yard.",
    },
    budget: { target: 450_000, min: null, max: null },
    conceptKey: "B",
  },
  {
    name: "Family Villa with Majlis",
    description: "Two-storey modern villa on a 20 × 35 m Dubai plot: majlis by the entrance, maid's room with its own bathroom, shaded carport, roof tank behind the parapet and a pool in the garden.",
    regionId: "ae-du-dubai",
    addressLine: null,
    plot: { width: 20000, depth: 35000, northAngleDeg: 0 },
    requirements: {
      bedrooms: 4, bathrooms: 4, floors: 2, parking: 2, garage: false, office: false, laundry: true,
      storage: true, guestRoomDownstairs: false, familyLounge: true, separateDining: true, balcony: true,
      outdoorSpace: true, pool: true, majlis: true, staffRooms: 1, carport: true, style: "modern",
      notes: "Majlis near the entrance for guests, maid's room, covered parking for two cars, pool.",
    },
    budget: { target: 3_500_000, min: null, max: null },
    conceptKey: "B",
  },
];
