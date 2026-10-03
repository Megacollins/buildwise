"use client";

/**
 * Converts the building model into three.js meshes. Pure composition — every
 * position and size comes from the model (rooms, walls, openings, roof, exterior
 * geometry); the parts only decide how each element is built and finished.
 *
 * Coordinate mapping: model (x, y, z) mm → three (x, z, −y) metres, in plot coordinates,
 * so the street is at +z and the viewer standing in the street sees the front unmirrored.
 *
 * Stages show ONE building gaining detail:
 *   blueprint → translucent massing on a dark site
 *   structure → plinth, frame, slabs, walls, roof, steps and porch in raw concrete/block
 *   finished  → materials, glazing, balconies, surrounds, boundary, gates, paving, services, planting, lights
 *   furnished → + furniture and fixtures inside, cars in the bays
 */
import { useMemo } from "react";
import type { BuildingModel } from "@/domain/model/types";
import type { MaterialLooks } from "@/domain/materials/colors";
import { accentWallIds } from "@/domain/model/facade";
import { Box, m, useMats, type VisualMode } from "./core";
import { RoofMesh } from "./parts/Roof";
import { Attached } from "./parts/Attached";
import { SiteContext } from "./parts/Site";
import { LevelMeshes } from "./parts/Interior";

export type { VisualMode } from "./core";

export interface SceneOptions {
  mode: VisualMode;
  /** Highest level index to show; levels above are hidden (cutaway). null = all + roof */
  cutLevel: number | null;
  night: boolean;
  looks: MaterialLooks;
  /** Elevation views: omit trees between this face and the camera */
  clearSide?: "front" | "rear" | "left" | "right";
}

export function BuildingScene({ model, options }: { model: BuildingModel; options: SceneOptions }) {
  const { mode, looks, night } = options;
  const blueprint = mode === "blueprint";
  const finished = mode === "finished" || mode === "furnished";
  const mats = useMats(mode, looks, night);
  const accent = useMemo(() => (looks.accent_finish ? accentWallIds(model) : new Set<string>()), [model, looks.accent_finish]);
  const slimFrames = model.exterior?.visual?.frame === "slim";

  const o = model.site.footprintOrigin;
  const t = model.params.wallThickness.exterior;
  const plinth = model.exterior?.plinth ?? 300;
  const visibleLevels = model.levels.filter((l) => options.cutLevel === null || l.index <= options.cutLevel);
  const showRoof = options.cutLevel === null;
  const ground = model.levels.find((l) => l.index === 0)!;

  return (
    <group>
      <SiteContext model={model} mode={mode} looks={looks} night={night} clearSide={options.clearSide} showRoof={showRoof} />

      <group position={[m(o.x), m(plinth), -m(o.y)]}>
        {/* Raised ground floor (plinth) with a slightly recessed base course */}
        {ground.rooms.map((r) => (
          <Box key={`pl-${r.id}`} x0={r.x - t / 2} y0={r.y - t / 2} z0={-plinth} x1={r.x + r.width + t / 2} y1={r.y + r.depth + t / 2} z1={0} material={mats.plinth} />
        ))}
        {model.exteriorGeometry && !blueprint && <Attached model={model} mats={mats} finished={finished} visibleLevels={visibleLevels.map((l) => l.id)} />}

        {visibleLevels.map((level) => (
          <LevelMeshes key={level.id} model={model} level={level} mats={mats} furnished={mode === "furnished"} finished={finished} night={night}
            accentWalls={accent} slimFrames={slimFrames} />
        ))}

        {showRoof && <RoofMesh model={model} mats={mats} finished={finished} />}
      </group>
    </group>
  );
}
