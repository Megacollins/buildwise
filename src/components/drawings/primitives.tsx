/** Drafting primitives for SVG drawings. All coordinates are in model millimetres (SVG y = −model y). */
import type { ReactNode } from "react";

export const INK = "#1d2124";
export const INK_SOFT = "#4a5257";
export const INK_FAINT = "#8b9398";
export const ACCENT = "#1f8f82";

export const LW = { heavy: 45, medium: 22, light: 12, hair: 7 };

/** Dimension line between two points along x (horiz) or y (vert), offset from the object. */
export function DimLine({ x1, y1, x2, y2, label, offset = 0, textSize = 170, vertical = false }: {
  x1: number; y1: number; x2: number; y2: number; label: string; offset?: number; textSize?: number; vertical?: boolean;
}) {
  const tick = 120;
  if (!vertical) {
    const y = y1 + offset;
    return (
      <g stroke={INK_SOFT} strokeWidth={LW.hair} fill="none">
        <line x1={x1} y1={y1} x2={x1} y2={y + Math.sign(offset || 1) * 120} />
        <line x1={x2} y1={y2} x2={x2} y2={y + Math.sign(offset || 1) * 120} />
        <line x1={x1 - 150} y1={y} x2={x2 + 150} y2={y} />
        <line x1={x1 - tick / 2} y1={y + tick / 2} x2={x1 + tick / 2} y2={y - tick / 2} strokeWidth={LW.light} />
        <line x1={x2 - tick / 2} y1={y + tick / 2} x2={x2 + tick / 2} y2={y - tick / 2} strokeWidth={LW.light} />
        <text x={(x1 + x2) / 2} y={y - 60} fontSize={textSize} textAnchor="middle" fill={INK} stroke="none" fontFamily="var(--font-jetbrains), monospace">{label}</text>
      </g>
    );
  }
  const x = x1 + offset;
  return (
    <g stroke={INK_SOFT} strokeWidth={LW.hair} fill="none">
      <line x1={x1} y1={y1} x2={x + Math.sign(offset || 1) * 120} y2={y1} />
      <line x1={x2} y1={y2} x2={x + Math.sign(offset || 1) * 120} y2={y2} />
      <line x1={x} y1={y1 - 150} x2={x} y2={y2 + 150} />
      <line x1={x - tick / 2} y1={y1 + tick / 2} x2={x + tick / 2} y2={y1 - tick / 2} strokeWidth={LW.light} />
      <line x1={x - tick / 2} y1={y2 + tick / 2} x2={x + tick / 2} y2={y2 - tick / 2} strokeWidth={LW.light} />
      <text x={x - 60} y={(y1 + y2) / 2} fontSize={textSize} textAnchor="middle" fill={INK} stroke="none"
        transform={`rotate(-90 ${x - 60} ${(y1 + y2) / 2})`} fontFamily="var(--font-jetbrains), monospace">{label}</text>
    </g>
  );
}

/** North arrow. `angle` = clockwise degrees from drawing-up to north. */
export function NorthArrow({ x, y, size = 700, angle = 0 }: { x: number; y: number; size?: number; angle?: number }) {
  const r = size / 2;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} aria-label="North arrow">
      <circle r={r} fill="none" stroke={INK} strokeWidth={LW.light} />
      <path d={`M0 ${-r * 0.85} L${r * 0.32} ${r * 0.55} L0 ${r * 0.3} Z`} fill={INK} />
      <path d={`M0 ${-r * 0.85} L${-r * 0.32} ${r * 0.55} L0 ${r * 0.3} Z`} fill="none" stroke={INK} strokeWidth={LW.light} />
      <text y={-r - 120} fontSize={size * 0.32} textAnchor="middle" fill={INK} fontWeight={700} transform={`rotate(${-angle} 0 ${-r - 170})`}>N</text>
    </g>
  );
}

/** Graphic scale bar in metres (true to drawing units). */
export function ScaleBar({ x, y, metres = 5 }: { x: number; y: number; metres?: number }) {
  const seg = 1000;
  return (
    <g transform={`translate(${x} ${y})`} aria-label={`Scale bar, ${metres} metres`}>
      {Array.from({ length: metres }, (_, i) => (
        <rect key={i} x={i * seg} y={0} width={seg} height={120} fill={i % 2 ? "none" : INK} stroke={INK} strokeWidth={LW.hair} />
      ))}
      {[0, Math.floor(metres / 2), metres].map((m) => (
        <text key={m} x={m * seg} y={330} fontSize={150} textAnchor="middle" fill={INK} fontFamily="var(--font-jetbrains), monospace">{m}</text>
      ))}
      <text x={metres * seg + 200} y={100} fontSize={150} fill={INK}>m</text>
    </g>
  );
}

/** Level marker (triangle datum) used on elevations/sections. */
export function LevelMark({ x, y, label, value, align = "left" }: { x: number; y: number; label: string; value: string; align?: "left" | "right" }) {
  const dir = align === "left" ? -1 : 1;
  return (
    <g>
      <line x1={x} y1={y} x2={x + dir * 1500} y2={y} stroke={INK_SOFT} strokeWidth={LW.hair} strokeDasharray="120 60" />
      <path d={`M${x + dir * 1500} ${y} l${-110} ${-170} h220 z`} fill={INK} />
      <text x={x + dir * 1500 + dir * 250} y={y - 40} fontSize={170} textAnchor={align === "left" ? "end" : "start"} fill={INK} fontFamily="var(--font-jetbrains), monospace">{value}</text>
      <text x={x + dir * 1500 + dir * 250} y={y + 190} fontSize={140} textAnchor={align === "left" ? "end" : "start"} fill={INK_SOFT}>{label}</text>
    </g>
  );
}

export function Hatch({ id, spacing = 250, color = INK_FAINT }: { id: string; spacing?: number; color?: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width={spacing} height={spacing} patternTransform="rotate(45)">
      <line x1={0} y1={0} x2={0} y2={spacing} stroke={color} strokeWidth={LW.hair} />
    </pattern>
  );
}

export function DrawingSvg({ viewBox, title, children, className }: { viewBox: [number, number, number, number]; title: string; children: ReactNode; className?: string }) {
  return (
    <svg viewBox={viewBox.join(" ")} className={className ?? "h-full w-full"} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet"
      style={{ fontFamily: "var(--font-inter), sans-serif" }}>
      <title>{title}</title>
      {children}
    </svg>
  );
}
