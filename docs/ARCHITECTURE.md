# Buildwise architecture

## 1. The building model is the product

`src/domain/model/types.ts` defines `BuildingModel`: site (plot, setbacks, north, driveway, parking),
footprint, design parameters, levels, roof and material selections. Each `Level` holds:

- `layout` — the **editable intent**: a parametric grid of full-width rows (front rooms, circulation,
  rear rooms), each split into bays. Dimensions are integer millimetres, centreline to centreline.
- `rooms`, `walls`, `doors`, `windows`, `stairs` — **derived** by `rebuildModel()` (`build.ts`).

Derivation is deterministic, so the same layout always yields the same elements with the same ids.
"Moving a wall" means changing the layout dimension that produced it; everything else follows:

```
ModelOp ──applyOp──▶ layout change ──rebuildModel──▶ rooms / walls / openings / stairs
                                                   ├─▶ FloorPlan, SitePlan, Elevation, Section (SVG)
                                                   ├─▶ BuildingScene (three.js)
                                                   ├─▶ computeQuantities ─▶ estimateCost
                                                   └─▶ schedules (rooms, doors, windows, finishes)
```

`geometry.ts` (openings per wall, solid wall intervals, roof form, elevation projection) and
`fixtures.ts` (fixtures placed against the wall opposite each room's door) are shared by the 2D
and 3D renderers, so they cannot disagree.

### Units
All geometry is stored as integer mm. `src/domain/units` converts only at presentation time
(metric m/m², imperial ft-in/ft²). Nothing is stored as a formatted string.

### Why a versioned JSON document rather than a table per element
Each `DesignVersion` stores the full model as an immutable, schema-versioned (`schemaVersion`)
document plus the server-computed estimate. This mirrors how BIM formats treat a design snapshot:
restoring or comparing versions is atomic, and views can never drift from one another. Queryable
figures (estimate range, gross area) are denormalised onto the version row. If element-level
querying is needed later (e.g. cross-project analytics), a projection into relational tables can
be added without changing the source of truth.

## 1b. Deterministic validation (`src/domain/model/validate.ts`)

`validateModel()` runs 26 named rules (no AI) grouped as Model, Rooms, Walls, Openings,
Circulation, Stairs, Site and Comfort — e.g. rooms tile the footprint without overlap, every wall
end connects, exterior walls close the envelope, every opening lies within an existing wall and
below the ceiling, every room has a door, stairs rise exactly one storey into a stair room above,
the building lies within the plot.

- **error** = the model is internally inconsistent. `applyOp` refuses any edit that introduces an
  error (with the reason), the generator marks such concepts `feasible: false`, and the server will
  not create a project from them.
- **warning** = valid but worth a look (no window, steep stair, indicative setbacks).

Passing means self-consistent, not code-compliant. `src/domain/model/validate.test.ts` sweeps
hundreds of generated briefs across all regions, applies thousands of edits, and tampers with
models to prove each rule fires. Run with `npm test`.

## 1c. Design language: style × region (`src/domain/generator/design-language.ts`)

Style (`STYLE_PROFILES`: roof preference, glazing, balcony policy, balustrade, character
materials) and region (`Region.architecture`: plinth, boundary & gate, sun-shading, porch,
balconies, services such as AC units / water tank / generator house, compound paving, drains,
planting, lighting, roof conventions per style, typical local materials) are resolved
separately and combined. Every decision carries a plain-language reason, stored on the model as
`designNotes` and shown on the project overview. The resulting `ExteriorIntent` is part of the
building model; `deriveExterior()` (`src/domain/model/exterior.ts`) turns it into geometry
(steps, porch, balconies with balcony doors, window hoods, AC units, boundary segments with gate
openings, paving, paths, drains, trees, services, lights). That geometry is drawn on the site
plan, floor plans and elevations, rendered in 3D, priced by the cost engine (`rates.external`)
and checked by the model check. Schema v1 models are upgraded by `migrateModel()`; the upgrade is
saved as a labelled version.

## 1d. Massing: projecting bays and L-shapes

`model.massing.groups` splits the front of the house into groups whose edges line up on every
floor; a group with `depth > 0` is a full-height volume projecting forward of the main facade.
Front-row rooms take the depth of the group containing their centre (`projectionAt`), so rooms
stay rectangles and walls, openings, quantities and the 3D all follow automatically. Shared
geometry (`buildingBounds`, `wallOutward`, `roofBlocks`, `roofFaces`) replaces every
"the house is one rectangle" assumption: slabs and plinth follow the outline, flat roofs get a
parapet on every outer wall, and pitched roofs get one roof per volume (a projecting volume gets
a front-facing gable or hip that runs into the main roof). The elevations project those same roof
surfaces. The generator (`planMassing`) chooses a shared group edge that fits every floor's
front rooms — concept B gets a projecting bay, C an L-shape with the entrance in the inner
corner — and falls back to a rectangle (with a note) when the rooms can't line up. The
`massing-aligned` rule guarantees volumes run full height; edits to a volume's edge move it on
all floors, and the `projection` op sets or flattens its depth.

## 1e. Terraces, set-back floors and pools

Massing groups carry a depth per floor (`depth` for the ground floor, `upper[]` above;
`groupDepthAt`). An upper floor can be flush, set back behind the main facade (negative depth),
or a wing can be single-storey (upper depth 0). `exposedRects(lower, upper)` finds roof areas of
a lower floor not covered by the floor above; `deriveExterior` turns them into terraces with
balustrades on their open edges, and `rebuildModel` (now bottom-up) gives rooms overlooking a
usable terrace a glazed terrace door. New rules: `floors-supported` (no overhangs) and
`setback-roof` (a pitched roof can't yet follow a set-back top floor). The generator makes a
flat-roof L's wing single-storey with a roof terrace, and may set a generous modern home's upper
floor back. Ops: `levelDepth` (per floor, `level: 0` = all upper floors).

Pools are an optional requirement (`pool`), sized by concept, placed by `deriveExterior` in the
rear garden or side yards clear of the house, driveway, paving and services (before services and
trees are placed), reduced if necessary, and otherwise reported as not fitting — never squeezed
in. Priced per m² of water + deck + equipment; checked by `pool-placement`; `pool` op and
assistant intents add or remove one.

## 1f. 3D visualisation (`src/components/three`)

The renderer only *interprets* the model; it never invents geometry. Every position comes from
rooms, walls, openings, `roofFaces()`, `exteriorGeometry` and `levelFixtures()` — the same data the
plans, quantities and cost engine use.

- `core.tsx` — mm→metre mapping, `Box` (metre UVs so textures keep real scale), `Beam`, and `useMats`
  (one material set per stage, built from the selected finishes incl. `accent_finish`).
- `parts/Walls.tsx` — wall pieces around openings; windows set back in a reveal with frame, mullions,
  transom and sill; entrance/garage/internal door leaves. Frame profile from `exterior.visual.frame`.
- `parts/Roof.tsx` — slopes/gables from `roofFaces()` plus soffit, fascia, gutters; parapet + coping for flat roofs.
- `parts/Attached.tsx` — steps, porch (columns, canopy, downlights), balconies and terraces with a shared
  balustrade builder, window surrounds (from hoods), AC units.
- `parts/Site.tsx` — street, compound, boundary/gates, services, pool, planting (palette from
  `exterior.visual.planting`, resolved from the region), parking bays, lights.
- `parts/Interior.tsx` — slabs (+ floor bands when the style calls for them), floor finishes by room type,
  stairs with handrails, furniture shapes per fixture kind.
- `cameras.ts` — presets (whole property, front, rear, left, right, top, entrance, living room, bedroom,
  plan cutaway) computed from building bounds, the entrance door and room geometry. Elevation presets leave
  out trees between the camera and that face, as an architectural elevation render would.
- `Viewer3D.tsx` — eased camera transitions, sun position/colour/intensity from the time slider, locally
  generated environment lighting (no network), soft shadows, optional N8AO ambient occlusion ("HQ").

Nothing regional is hard-coded in the renderer: planting, frames, floor bands and accent placement are
resolved by the design language (style × region) and stored on `model.exterior`.

## 1g. Regional conventions beyond style (schema v3)

Region data (`Region.architecture`) also says *how* things are built and what a local home contains:

- `shading.form` (+ `formByStyle`): `surround` (hood + fins, e.g. Lagos), `overhang` (head only),
  `screen` (perforated mashrabiya-style panel; Dubai traditional/regional). Resolved to `exterior.shadingForm`;
  priced per m² of screen where the region has `screenPerM2`, otherwise per metre of hood.
- `services.tank`: `stand` | `roof` | `underground`. A roof tank needs a flat roof — `deriveExterior` falls back to
  underground otherwise (and the `roof` op now rebuilds, so this re-derives). Priced via `waterTankByType`.
- `carport`: suggested in the brief where typical (Dubai); `deriveExterior` covers the open parking bays with posts
  between bays; priced by area (`carportPerM2`); drawn on the site plan and in 3D.
- `program`: suggests a `majlis` (front row, ground floor) and staff rooms (`staff`, each with its own bathroom,
  named per region, e.g. "Maid’s room"). The wizard pre-fills these per city; the user decides.
- Landscaping is a material: `land-gravel` (gravel & desert planting) is the Dubai standard, so the plot reads as sand.
  The neighbourhood outside the plot follows `visual.planting` (arid → sand).

Migration v2 → v3 backfills `services.tank` and `shadingForm` from the region; nothing the user chose changes.
Rooms (majlis/staff) and carports are brief changes, so existing projects need regenerating to get them.

## 2. Concept generation (`src/domain/generator`)

`generateModel()` turns requirements + plot + region into a model:

1. Build a room programme per level (bedroom distribution, ground-floor guest room, WC, stair on
   every level of multi-storey homes).
2. Split each level into front / hall / rear rows; flexible rooms are balanced between rows.
3. Search footprint widths, scoring room proportions, plot fit and site coverage.
4. Distribute bay widths by target area with minimum widths; the stair keeps a fixed width and
   position so it stacks between floors.
5. Place the footprint on the plot behind setbacks / front-yard parking; add the driveway.
6. Choose the roof from style and regional practice; rebuild; collect plain-language warnings.

`generateConcepts()` produces three concepts; **Concept A searches area factor and finish tier to
fit the budget** (the budget is a design constraint, not a label). If nothing fits, it says so.

## 3. Cost engine (`src/domain/cost`)

`estimateCost(model, region, catalog)` is pure. Each line records quantity (from
`computeQuantities`), rate range, amount range, basis text and data provenance. Construction items
use regional supply-and-install rates; finishes use the material catalog (supply) plus a labour
factor; preliminaries and contingency are percentages. Totals are ranges; the mid-point is shown
only as a reference. Money is rounded according to magnitude to avoid false precision.

`optimisationOptions()` applies candidate ops (area reduction, roof simplification, smaller windows,
removing optional rooms, per-category and whole-package tier downgrades) to a copy of the model and
re-estimates — savings are measured, not guessed.

The server recomputes the estimate for every saved version (`src/server/projects.ts`). The client
runs the same engine only for instant previews.

## 4. Regional intelligence (`src/domain/regions`, `src/data`)

A `Region` holds country/subdivision/city, currency, measurement system, locale, climate and
design hints, construction practice (typical walls/roof, wall thicknesses), indicative planning
defaults, architectural patterns, regulatory references (always `verified: false` for now), cost
rates and a `dataStatus` (`sample | partner_supplied | verified`). Regions and material prices live
in the database (seeded from `src/data`), so verified datasets can replace samples without code changes.

## 5. Server, auth and security (`src/server`)

- Opaque session tokens in an httpOnly, SameSite=Lax cookie; only the SHA-256 hash is stored.
  Passwords are bcrypt-hashed. Sign-in errors don't reveal whether an email exists.
- `src/proxy.ts` performs an optimistic redirect for signed-out visitors; **authorisation is enforced
  in the data layer** (`getProjectForUser`, `loadWorkspace`, and every server action filters by owner).
- All server-action input is validated with Zod (`ModelOpSchema`, `RequirementsSchema`, etc.).
- Secrets live in `.env` (git-ignored); `.env.example` documents them.

## 6. Localisation (`src/i18n`)

Typed message keys (`MessageKey`), English as the complete base, per-key fallback for draft locales,
`dir="rtl"` for Arabic, logical CSS properties (`ms-/me-/ps-/start-`) in the UI, and Intl-based
number, currency and date formatting. Drawings stay LTR (as real drawings do). Locale precedence:
cookie → user preference → Accept-Language → English.

## 7. AI assistant

`src/server/assistant.ts` defines an `AssistantProvider` interface. The current provider is
rule-based. Any provider (e.g. an LLM) must return `ModelOp`s, which are validated, applied to a copy
of the model and priced by the cost engine before the user sees them. Nothing is applied without
the user choosing it.

## 8. Roadmap hooks

- Drawing sheets: add a sheet definition + renderer (roof plan, RCP, electrical, plumbing).
- Irregular plots: extend `Site.plot` to a polygon; the generator already works on a buildable area.
- Professional review: `ReviewRequest` records exist; stage advancement to `PROFESSIONALLY_REVIEWED`
  must only come from a verified reviewer workflow.
- Documents: `Document` table + object storage key for generated PDFs/exports.
