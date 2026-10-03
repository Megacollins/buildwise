"use client";

/**
 * Procedural surface textures (brick, render, timber, roof sheets, tiles, paving…),
 * drawn once on a canvas and cached. Greyscale patterns are tinted by the selected
 * material's colour, so the catalog colour stays the source of truth.
 *
 * UVs on our boxes are in metres (see BuildingScene), so `metres` below is the
 * real-world size of one texture tile.
 */
import * as THREE from "three";
import type { TextureKind } from "@/domain/materials/types";

const SIZE = 512;
const cache = new Map<string, { map: THREE.Texture; bump: THREE.Texture | null; metres: number }>();

/** Small deterministic PRNG so textures look the same on every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = c.height = SIZE;
  return [c, c.getContext("2d")!];
}

function speckle(ctx: CanvasRenderingContext2D, r: () => number, count: number, alpha: number, size = 2) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(r() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(r() * SIZE, r() * SIZE, size * r() + 0.5, size * r() + 0.5);
  }
}

const shade = (v: number) => `rgb(${v},${v},${v})`;

function draw(kind: TextureKind): { c: HTMLCanvasElement; metres: number; bump: boolean } {
  const [c, ctx] = canvas();
  const r = rng(kind.length * 9973 + kind.charCodeAt(0));
  const fill = (v: number) => { ctx.fillStyle = shade(v); ctx.fillRect(0, 0, SIZE, SIZE); };
  switch (kind) {
    case "render": {
      fill(236); speckle(ctx, r, 9000, 0.06, 3); speckle(ctx, r, 3000, 0.05, 6);
      return { c, metres: 1.5, bump: true };
    }
    case "concrete": {
      fill(200); speckle(ctx, r, 14000, 0.08, 2); speckle(ctx, r, 600, 0.06, 14);
      return { c, metres: 2, bump: true };
    }
    case "brick": {
      // 215 × 65 mm bricks + 10 mm joints; tile = 4 bricks × 8 courses
      fill(205);
      const bw = SIZE / 4, bh = SIZE / 8, j = 5;
      for (let row = 0; row < 8; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let col = -1; col < 5; col++) {
          ctx.fillStyle = shade(120 + Math.floor(r() * 70));
          ctx.fillRect(col * bw + off + j / 2, row * bh + j / 2, bw - j, bh - j);
        }
      }
      speckle(ctx, r, 5000, 0.08, 2);
      return { c, metres: 0.9, bump: true };
    }
    case "wood": {
      fill(150);
      const boards = 6, h = SIZE / boards;
      for (let b = 0; b < boards; b++) {
        ctx.fillStyle = shade(130 + Math.floor(r() * 60)); ctx.fillRect(0, b * h, SIZE, h - 3);
        for (let g = 0; g < 26; g++) {
          ctx.strokeStyle = `rgba(60,60,60,${0.08 + r() * 0.1})`; ctx.lineWidth = 1 + r() * 2;
          const y = b * h + r() * h; ctx.beginPath(); ctx.moveTo(0, y);
          ctx.bezierCurveTo(SIZE * 0.3, y + (r() - 0.5) * 8, SIZE * 0.7, y + (r() - 0.5) * 8, SIZE, y + (r() - 0.5) * 6); ctx.stroke();
        }
        ctx.fillStyle = shade(70); ctx.fillRect(0, (b + 1) * h - 3, SIZE, 3);
      }
      return { c, metres: 0.9, bump: true };
    }
    case "stone": {
      fill(110);
      for (let i = 0; i < 26; i++) {
        const w = 70 + r() * 160, h = 50 + r() * 90, x = r() * SIZE, y = r() * SIZE;
        ctx.fillStyle = shade(150 + Math.floor(r() * 80));
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
        ctx.beginPath(); ctx.roundRect(x - SIZE, y, w, h, 12); ctx.fill();
        ctx.beginPath(); ctx.roundRect(x, y - SIZE, w, h, 12); ctx.fill();
      }
      speckle(ctx, r, 6000, 0.1, 3);
      return { c, metres: 1.2, bump: true };
    }
    case "tile": {
      fill(215);
      const n = 4, s = SIZE / n;
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) { ctx.fillStyle = shade(200 + Math.floor(r() * 30)); ctx.fillRect(i * s + 3, k * s + 3, s - 6, s - 6); }
      speckle(ctx, r, 2500, 0.05, 2);
      return { c, metres: 1.2, bump: true };
    }
    case "metal_sheet": {
      fill(190);
      const ribs = 8, w = SIZE / ribs;
      for (let i = 0; i < ribs; i++) {
        const g = ctx.createLinearGradient(i * w, 0, (i + 1) * w, 0);
        g.addColorStop(0, shade(150)); g.addColorStop(0.15, shade(235)); g.addColorStop(0.3, shade(185)); g.addColorStop(1, shade(195));
        ctx.fillStyle = g; ctx.fillRect(i * w, 0, w, SIZE);
      }
      return { c, metres: 1.6, bump: true };
    }
    case "stone_coated":
    case "shingle": {
      fill(110);
      const rows = kind === "shingle" ? 10 : 8, h = SIZE / rows, cols = kind === "shingle" ? 6 : 5, w = SIZE / cols;
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? w / 2 : 0;
        for (let col = -1; col <= cols; col++) {
          const g = ctx.createLinearGradient(0, row * h, 0, (row + 1) * h);
          const v = 150 + Math.floor(r() * 50);
          g.addColorStop(0, shade(v + 30)); g.addColorStop(1, shade(v - 40));
          ctx.fillStyle = g;
          ctx.beginPath();
          if (kind === "stone_coated") { ctx.roundRect(col * w + off + 2, row * h, w - 4, h - 2, [0, 0, 18, 18]); }
          else ctx.rect(col * w + off + 1, row * h, w - 2, h - 2);
          ctx.fill();
        }
      }
      speckle(ctx, r, kind === "stone_coated" ? 16000 : 6000, 0.12, 2);
      return { c, metres: kind === "shingle" ? 1.6 : 1.4, bump: true };
    }
    case "paving": {
      fill(120);
      const bw = SIZE / 4, bh = SIZE / 8;
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
        const off = row % 2 ? bw / 2 : 0;
        ctx.fillStyle = shade(160 + Math.floor(r() * 50));
        ctx.beginPath(); ctx.roundRect(col * bw + off + 3, row * bh + 3, bw - 6, bh - 6, 6); ctx.fill();
      }
      speckle(ctx, r, 6000, 0.08, 2);
      return { c, metres: 0.8, bump: true };
    }
    case "gravel": {
      fill(150);
      for (let i = 0; i < 9000; i++) { ctx.fillStyle = shade(100 + Math.floor(r() * 130)); ctx.beginPath(); ctx.arc(r() * SIZE, r() * SIZE, 1.5 + r() * 3.5, 0, Math.PI * 2); ctx.fill(); }
      return { c, metres: 1, bump: true };
    }
    case "grass": {
      fill(205);
      for (let i = 0; i < 26000; i++) {
        ctx.strokeStyle = shade(160 + Math.floor(r() * 95)); ctx.lineWidth = 1;
        const x = r() * SIZE, y = r() * SIZE; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 3, y - 3 - r() * 6); ctx.stroke();
      }
      return { c, metres: 2, bump: false };
    }
    case "marble": {
      fill(235);
      for (let v = 0; v < 7; v++) {
        ctx.strokeStyle = `rgba(110,110,110,${0.15 + r() * 0.2})`; ctx.lineWidth = 1 + r() * 2.5;
        ctx.beginPath(); let x = r() * SIZE, y = 0; ctx.moveTo(x, y);
        while (y < SIZE) { x += (r() - 0.5) * 60; y += 20 + r() * 30; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      return { c, metres: 1.5, bump: false };
    }
    default: {
      fill(230); speckle(ctx, r, 2000, 0.03, 2);
      return { c, metres: 2, bump: false };
    }
  }
}

/** Texture set for a surface kind; repeat is per metre (UVs are in metres). */
export function surfaceTextures(kind: TextureKind) {
  if (typeof document === "undefined") return null;
  let t = cache.get(kind);
  if (!t) {
    const { c, metres, bump } = draw(kind);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1 / metres, 1 / metres);
    map.anisotropy = 4;
    let bumpTex: THREE.Texture | null = null;
    if (bump) {
      bumpTex = new THREE.CanvasTexture(c);
      bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
      bumpTex.repeat.set(1 / metres, 1 / metres);
    }
    t = { map, bump: bumpTex, metres };
    cache.set(kind, t);
  }
  return t;
}

/** A textured, tinted standard material. Cached per (kind, colour, options). */
const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function surfaceMaterial(kind: TextureKind, color: string, opts: { roughness?: number; metalness?: number; side?: THREE.Side; bumpScale?: number } = {}) {
  const key = `${kind}|${color}|${JSON.stringify(opts)}`;
  let m = matCache.get(key);
  if (!m) {
    const tex = surfaceTextures(kind);
    m = new THREE.MeshStandardMaterial({
      color, map: tex?.map ?? null, bumpMap: tex?.bump ?? null, bumpScale: opts.bumpScale ?? 0.6,
      roughness: opts.roughness ?? (kind === "metal_sheet" ? 0.45 : kind === "marble" ? 0.2 : 0.85),
      metalness: opts.metalness ?? (kind === "metal_sheet" ? 0.35 : 0),
      side: opts.side ?? THREE.FrontSide,
    });
    matCache.set(key, m);
  }
  return m;
}

const plainCache = new Map<string, THREE.MeshStandardMaterial>();
export function plainMaterial(color: string, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = plainCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }); plainCache.set(key, m); }
  return m;
}

/**
 * Perforated screen (mashrabiya-style lattice): opaque bars with square-diamond openings,
 * drawn as an alpha map so light and view pass through the holes. One tile = 0.4 m.
 */
const latticeCache = new Map<string, THREE.MeshStandardMaterial>();
export function latticeMaterial(color: string) {
  let mat = latticeCache.get(color);
  if (mat) return mat;
  let alpha: THREE.Texture | null = null;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#000";
    // Four diamond openings per tile with a small square at each centre.
    for (const [cx, cy] of [[64, 64], [192, 64], [64, 192], [192, 192]]) {
      ctx.beginPath(); ctx.moveTo(cx, cy - 50); ctx.lineTo(cx + 50, cy); ctx.lineTo(cx, cy + 50); ctx.lineTo(cx - 50, cy); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(cx - 9, cy - 9, 18, 18); ctx.fillStyle = "#000";
    }
    alpha = new THREE.CanvasTexture(c);
    alpha.wrapS = alpha.wrapT = THREE.RepeatWrapping;
    alpha.repeat.set(1 / 0.4, 1 / 0.4);
  }
  mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide });
  latticeCache.set(color, mat);
  return mat;
}
