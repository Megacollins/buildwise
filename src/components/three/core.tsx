"use client";

/**
 * Shared rendering primitives.
 * Coordinate mapping: model (x, y, z) mm → three (x, z, −y) metres. Box UVs are in metres,
 * so procedural textures keep real-world scale on every surface.
 */
import { useMemo } from "react";
import * as THREE from "three";
import type { MaterialLooks } from "@/domain/materials/colors";
import { plainMaterial, surfaceMaterial } from "./textures";

export type VisualMode = "blueprint" | "structure" | "finished" | "furnished";
export const m = (mm: number) => mm / 1000;

/** Axis-aligned box from model-space corners (mm), with UVs in metres. */
export function Box({ x0, y0, z0, x1, y1, z1, material, castShadow = true, receiveShadow = true }: {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; material: THREE.Material; castShadow?: boolean; receiveShadow?: boolean;
}) {
  const sx = Math.abs(x1 - x0), sy = Math.abs(y1 - y0), sz = Math.abs(z1 - z0);
  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(m(sx), m(sz), m(sy));
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims: [number, number][] = [[sy, sz], [sy, sz], [sx, sy], [sx, sy], [sx, sz], [sx, sz]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * m(dims[f][0]), uv.getY(i) * m(dims[f][1]));
    }
    return g;
  }, [sx, sy, sz]);
  if (sx < 1 || sy < 1 || sz < 1) return null;
  return (
    <mesh geometry={geometry} position={[m((x0 + x1) / 2), m((z0 + z1) / 2), -m((y0 + y1) / 2)]} material={material} castShadow={castShadow} receiveShadow={receiveShadow} />
  );
}

/** Flat ground-level rectangle with metre UVs. */
export function Ground({ x, y, width, depth, z = 5, material }: { x: number; y: number; width: number; depth: number; z?: number; material: THREE.Material }) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(m(width), m(depth));
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * m(width), uv.getY(i) * m(depth));
    return g;
  }, [width, depth]);
  if (width <= 0 || depth <= 0) return null;
  return <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[m(x + width / 2), m(z), -m(y + depth / 2)]} material={material} receiveShadow />;
}

/** A square-section member between two model-space points (rails, sloped handrails). */
export function Beam({ a, b, size, material }: { a: { x: number; y: number; z: number }; b: { x: number; y: number; z: number }; size: number; material: THREE.Material }) {
  const { position, quaternion, length } = useMemo(() => {
    const A = new THREE.Vector3(m(a.x), m(a.z), -m(a.y));
    const B = new THREE.Vector3(m(b.x), m(b.z), -m(b.y));
    const dir = new THREE.Vector3().subVectors(B, A);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    return { position: A.clone().add(B).multiplyScalar(0.5), quaternion: q, length: dir.length() };
  }, [a.x, a.y, a.z, b.x, b.y, b.z]);
  return (
    <mesh position={position} quaternion={quaternion} material={material} castShadow>
      <boxGeometry args={[m(size), length, m(size)]} />
    </mesh>
  );
}

export interface Mats {
  ext: THREE.Material; accent: THREE.Material; int: THREE.Material; slab: THREE.Material; floor: THREE.Material;
  plinth: THREE.Material; glass: THREE.Material; frame: THREE.Material; door: THREE.Material; garage: THREE.Material;
  stair: THREE.Material; counter: THREE.Material; cabinet: THREE.Material; roof: THREE.Material; soffit: THREE.Material;
  fascia: THREE.Material; gutter: THREE.Material; trim: THREE.Material; column: THREE.Material; metal: THREE.Material;
  steel: THREE.Material; balGlass: THREE.Material; stone: THREE.Material; invisible: THREE.Material;
}

/** One material set per visual stage, built from the selected finishes. */
export function useMats(mode: VisualMode, looks: MaterialLooks, night: boolean): Mats {
  return useMemo(() => {
    const invisible = plainMaterial("#000000", { transparent: true, opacity: 0, depthWrite: false });
    if (mode === "blueprint") {
      const b = plainMaterial("#2a5a7c", { transparent: true, opacity: 0.32, depthWrite: false });
      const d = plainMaterial("#163a52", { transparent: true, opacity: 0.6 });
      const line = plainMaterial("#7fb8dc", { transparent: true, opacity: 0.5 });
      return { ext: b, accent: b, int: b, slab: d, floor: d, plinth: d, glass: line, frame: line, door: line, garage: line, stair: d, counter: d, cabinet: d,
        roof: plainMaterial("#2a5a7c", { transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }), soffit: invisible, fascia: line, gutter: invisible,
        trim: d, column: b, metal: line, steel: line, balGlass: line, stone: d, invisible };
    }
    if (mode === "structure") {
      const block = surfaceMaterial("concrete", "#bdbab3"), conc = surfaceMaterial("concrete", "#a8a59e");
      return { ext: block, accent: block, int: block, slab: conc, floor: conc, plinth: conc, glass: invisible, frame: conc, door: invisible, garage: invisible,
        stair: conc, counter: conc, cabinet: conc, roof: surfaceMaterial("concrete", "#9c9a94", { side: THREE.DoubleSide }), soffit: surfaceMaterial("concrete", "#a8a59e", { side: THREE.DoubleSide }),
        fascia: conc, gutter: invisible, trim: conc, column: conc, metal: plainMaterial("#6d7176", { metalness: 0.4, roughness: 0.5 }),
        steel: plainMaterial("#6d7176", { metalness: 0.4, roughness: 0.5 }), balGlass: invisible, stone: conc, invisible };
    }
    const L = (k: string, color: string) => looks[k] ?? { color, texture: "plain" as const };
    const ext = L("exterior_finish", "#e4dfd6"), accent = L("accent_finish", ext.color), paint = L("wall_paint", "#eeeae2");
    const floor = L("flooring", "#d9d4cc"), roof = L("roofing", "#4a4d50"), win = L("windows", "#5e676d"), door = L("doors", "#7a5537");
    const top = L("countertops", "#3d3b39"), cab = L("cabinets", "#dcd7cd");
    return {
      ext: surfaceMaterial(ext.texture, ext.color),
      accent: looks.accent_finish ? surfaceMaterial(accent.texture, accent.color) : surfaceMaterial(ext.texture, ext.color),
      int: surfaceMaterial("render", paint.color),
      slab: surfaceMaterial("render", "#ece9e2"),
      floor: surfaceMaterial(floor.texture, floor.color, { roughness: 0.45 }),
      plinth: surfaceMaterial("render", "#8c8780"),
      glass: plainMaterial(night ? "#ffd9a0" : "#9fbccb", {
        transparent: true, opacity: night ? 0.75 : 0.42, roughness: 0.03, metalness: 0.6, envMapIntensity: 1.4,
        emissive: night ? "#ffbf6e" : "#000000", emissiveIntensity: night ? 0.55 : 0,
      }),
      frame: plainMaterial(win.color, { roughness: 0.35, metalness: 0.55 }),
      door: surfaceMaterial(door.texture, door.color, { roughness: 0.55 }),
      garage: surfaceMaterial("metal_sheet", "#4e5357", { roughness: 0.4 }),
      stair: surfaceMaterial(floor.texture, floor.color),
      counter: surfaceMaterial(top.texture, top.color, { roughness: 0.3 }),
      cabinet: surfaceMaterial(cab.texture, cab.color, { roughness: 0.5 }),
      roof: surfaceMaterial(roof.texture, roof.color, { side: THREE.DoubleSide }),
      soffit: surfaceMaterial("render", "#f1eee8", { side: THREE.DoubleSide }),
      fascia: surfaceMaterial("render", "#e9e6df"),
      gutter: plainMaterial("#3a3d40", { metalness: 0.5, roughness: 0.4 }),
      trim: surfaceMaterial("render", "#f4f2ee"),
      column: surfaceMaterial("render", "#f4f2ee"),
      metal: plainMaterial("#2b2e31", { metalness: 0.55, roughness: 0.4 }),
      steel: plainMaterial("#b8bcbf", { metalness: 0.85, roughness: 0.25 }),
      balGlass: plainMaterial("#c2dbe4", { transparent: true, opacity: 0.25, roughness: 0.03, metalness: 0.3, side: THREE.DoubleSide, depthWrite: false }),
      stone: surfaceMaterial("tile", "#d6d0c5", { roughness: 0.6 }),
      invisible,
    };
  }, [mode, looks, night]);
}

/** Outward unit direction (model x/y) for a facing side. */
export function outwardVector(side: "front" | "rear" | "left" | "right") {
  return side === "front" ? { x: 0, y: -1 } : side === "rear" ? { x: 0, y: 1 } : side === "left" ? { x: -1, y: 0 } : { x: 1, y: 0 };
}
