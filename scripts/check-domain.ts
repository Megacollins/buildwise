import { generateConcepts } from "@/domain/generator/concepts";
import { RequirementsSchema } from "@/domain/generator/requirements";
import { REGIONS } from "@/data/regions";
import { MATERIALS, defaultSelections } from "@/data/materials";
import { toRegionalCatalog } from "@/domain/materials/regional";
import { ftToMm } from "@/domain/units";

const req = RequirementsSchema.parse({ bedrooms: 4, bathrooms: 4, floors: 2, parking: 2, style: "modern" });
for (const region of REGIONS) {
  const concepts = generateConcepts({
    requirements: req, plot: { width: ftToMm(50), depth: ftToMm(100), northAngleDeg: 0 }, region,
    catalog: toRegionalCatalog(MATERIALS, region.id), budget: region.id.startsWith("ng") ? 30_000_000 : null,
    selectionsForTier: defaultSelections,
  });
  console.log(`\n=== ${region.city} (${region.currency})`);
  for (const c of concepts) {
    const e = c.estimate;
    console.log(c.key, c.name, `FP ${c.model.footprint.width}x${c.model.footprint.depth}`, `GFA ${e.grossFloorArea.toFixed(0)}m2`,
      `total ${Math.round(e.total[0]).toLocaleString()}–${Math.round(e.total[1]).toLocaleString()}`, `per m2 ${Math.round(e.perM2[0])}–${Math.round(e.perM2[1])}`);
    if (c.key === "B" && region.id.startsWith("ng")) {
      for (const l of c.model.levels) {
        console.log(" ", l.name, l.rooms.map((r) => `${r.name} ${r.clearWidth}x${r.clearDepth} ${r.area.toFixed(1)}`).join(" | "));
        console.log("   walls", l.walls.length, "doors", l.doors.map(d=>d.tag+":"+d.kind).join(","), "windows", l.windows.length, "stairs", l.stairs.length);
      }
      console.log("  warnings", c.model.warnings);
      for (const g of e.groups) console.log("   ", g.group, Math.round(g.amount[0]).toLocaleString(), Math.round(g.amount[1]).toLocaleString());
    }
  }
}
