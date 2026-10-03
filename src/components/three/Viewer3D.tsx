"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, ContactShadows, Sky, Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, N8AO, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { Sun, Moon, RotateCw, Layers, Camera, Sparkles } from "lucide-react";
import type { BuildingModel } from "@/domain/model/types";
import type { MaterialLooks } from "@/domain/materials/colors";
import { buildingHeight } from "@/domain/model/geometry";
import { BuildingScene, type SceneOptions, type VisualMode } from "./BuildingScene";
import { cameraPose, type CameraPose, type CameraPreset } from "./cameras";
import { cx } from "@/components/ui";

const PRESET_LABELS: Record<CameraPreset, string> = {
  whole: "Whole property", front: "Front", rear: "Rear", left: "Left side", right: "Right side", top: "Top",
  entrance: "Entrance", plan: "Floor plan cutaway", living: "Living room", bedroom: "Bedroom",
};

export function Viewer3D({
  model, colors, initialView = "whole", initialMode = "finished", compact = false, autoRotate: autoRotateInit = false, className,
}: {
  model: BuildingModel;
  colors: MaterialLooks;
  initialView?: CameraPreset;
  initialMode?: VisualMode;
  compact?: boolean;
  autoRotate?: boolean;
  className?: string;
}) {
  const [preset, setPreset] = useState<CameraPreset>(initialView);
  const [mode, setMode] = useState<VisualMode>(initialMode);
  const [level, setLevel] = useState<number | null>(null);
  const [hour, setHour] = useState(15);
  const [autoRotate, setAutoRotate] = useState(autoRotateInit);
  // Ambient occlusion and large shadow maps cost GPU time; previews and thumbnails stay light.
  const [hq, setHq] = useState(!compact);
  const night = hour < 6.5 || hour > 18.5;

  const pose = useMemo(() => cameraPose(model, preset, level), [model, preset, level]);
  const cutLevel = preset === "plan" ? (level ?? 0) : pose.interior ? null : level;

  const modes: { key: VisualMode; label: string }[] = [
    { key: "blueprint", label: "Blueprint" }, { key: "structure", label: "Structure" },
    { key: "finished", label: "Finished" }, { key: "furnished", label: "Furnished" },
  ];
  const choose = (p: CameraPreset) => {
    setPreset(p);
    setAutoRotate(false);
    // Rooms read best furnished; switch once when entering an interior from an empty shell.
    if ((p === "living" || p === "bedroom") && mode !== "furnished") setMode("furnished");
  };

  return (
    <div className={cx("relative flex h-full min-h-[320px] w-full flex-col overflow-hidden rounded-xl border border-line bg-[#0e1215]", className)}>
      {!compact && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <Camera className="size-3.5" aria-hidden />
            <span className="sr-only">Camera view</span>
            <select value={preset} onChange={(e) => choose(e.target.value as CameraPreset)}
              className="h-7 rounded-md border border-line bg-bg px-2 text-[12.5px] text-text">
              <optgroup label="Exterior">
                {(["whole", "front", "rear", "left", "right", "top", "entrance"] as CameraPreset[]).map((p) => <option key={p} value={p}>{PRESET_LABELS[p]}</option>)}
              </optgroup>
              <optgroup label="Interior">
                {(["living", "bedroom", "plan"] as CameraPreset[]).map((p) => <option key={p} value={p}>{PRESET_LABELS[p]}</option>)}
              </optgroup>
            </select>
          </label>
          <div role="radiogroup" aria-label="Visual stage" className="flex rounded-lg border border-line bg-bg p-0.5">
            {modes.map((md) => (
              <button key={md.key} role="radio" aria-checked={mode === md.key} onClick={() => setMode(md.key)}
                className={cx("rounded-md px-2.5 py-1 text-[12.5px] font-medium", mode === md.key ? "bg-accent-soft text-accent-strong" : "text-muted hover:text-text")}>
                {md.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
            <Layers className="size-3.5" aria-hidden />
            <span className="sr-only">Level</span>
            <select value={cutLevel ?? "all"} onChange={(e) => setLevel(e.target.value === "all" ? null : Number(e.target.value))}
              disabled={pose.interior}
              className="h-7 rounded-md border border-line bg-bg px-2 text-[12.5px] text-text disabled:opacity-50">
              {preset !== "plan" && <option value="all">Whole house</option>}
              {model.levels.map((l) => <option key={l.id} value={l.index}>{l.name}</option>)}
            </select>
          </label>
          <label className="ml-auto flex items-center gap-2 text-[12.5px] text-muted">
            {night ? <Moon className="size-3.5" aria-hidden /> : <Sun className="size-3.5" aria-hidden />}
            <span className="tabular w-10">{String(Math.floor(hour)).padStart(2, "0")}:{hour % 1 ? "30" : "00"}</span>
            <input type="range" min={5} max={22} step={0.5} value={hour} onChange={(e) => setHour(Number(e.target.value))}
              aria-label="Time of day" className="w-24 accent-[var(--accent)]" />
          </label>
          <button onClick={() => setHq((q) => !q)} aria-pressed={hq} title="Ambient occlusion and sharper shadows (uses more GPU)"
            className={cx("flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12.5px]", hq ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-line text-muted hover:text-text")}>
            <Sparkles className="size-3.5" aria-hidden /> HQ
          </button>
          <button onClick={() => setAutoRotate((a) => !a)} aria-pressed={autoRotate} title="Explore 360°" disabled={pose.interior}
            className={cx("flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12.5px] disabled:opacity-50", autoRotate ? "border-accent/40 bg-accent-soft text-accent-strong" : "border-line text-muted hover:text-text")}>
            <RotateCw className="size-3.5" aria-hidden /> 360°
          </button>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <Canvas shadows="soft" dpr={[1, 1.75]} camera={{ fov: 45, near: 0.05, far: 600, position: pose.position }}
          gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}>
          <Suspense fallback={null}>
            <SceneContents model={model} pose={pose} options={{ mode, cutLevel, night, looks: colors, clearSide: pose.clearSide }} hour={hour} autoRotate={autoRotate && !pose.interior} hq={hq} />
          </Suspense>
        </Canvas>
        {pose.interior && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/55 px-3 py-1.5 text-[12px] text-white/85">
            Drag to look around · W A S D / arrow keys to walk · walls are not solid in this preview
          </div>
        )}
        {mode === "blueprint" && (
          <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/55 px-2.5 py-1 text-[11.5px] text-white/80">Blueprint · wall massing</div>
        )}
        {!compact && (
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/45 px-2.5 py-1 text-[11px] text-white/75">
            Concept visualisation · furniture indicative
          </div>
        )}
      </div>
    </div>
  );
}

function SceneContents({ model, pose, options, hour, autoRotate, hq }: {
  model: BuildingModel; pose: CameraPose; options: SceneOptions; hour: number; autoRotate: boolean; hq: boolean;
}) {
  const controls = useRef<OrbitControlsImpl>(null);
  // While the camera flies between presets the distance limits are lifted, so nothing clamps it mid-flight.
  const [flying, setFlying] = useState(false);
  const plot = model.site.plot;
  const pcx = plot.width / 2000, pcz = -plot.depth / 2000;
  const plotSpan = Math.max(plot.width, plot.depth) / 1000;
  const H = buildingHeight(model) / 1000;
  const blueprint = options.mode === "blueprint";

  // Sun path: east (morning) → overhead → west, adjusted by site north.
  const sun = useMemo(() => {
    const dayT = (hour - 6) / 13; // 0 at sunrise, 1 at sunset
    const azimuth = Math.PI * Math.min(1, Math.max(0, dayT)) + (model.site.northAngleDeg * Math.PI) / 180;
    const elevation = Math.max(-0.2, Math.sin(Math.min(1, Math.max(0, dayT)) * Math.PI) * 1.1 + 0.03 - (dayT < 0 || dayT > 1 ? 0.25 : 0));
    const r = 70;
    const dir = new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation));
    // Daylight strength and warmth follow the sun's height: warm and low at golden hour, white at noon.
    const day = THREE.MathUtils.smoothstep(elevation, -0.02, 0.35);
    const warm = 1 - THREE.MathUtils.smoothstep(elevation, 0.05, 0.6);
    const color = new THREE.Color("#fff6e8").lerp(new THREE.Color("#ffb873"), warm);
    return { dir, position: new THREE.Vector3(pcx + dir.x * r, dir.y * r, pcz + dir.z * r), day, warm, color };
  }, [hour, pcx, pcz, model.site.northAngleDeg]);
  const night = options.night;
  const skyColor = night ? "#0a0f1a" : new THREE.Color("#cfd9df").lerp(new THREE.Color("#e9c9a4"), sun.warm * 0.8).getStyle();
  const shadowExtent = plotSpan * 0.75 + 6;

  return (
    <>
      <color attach="background" args={[blueprint ? "#0b1822" : skyColor]} />
      {!blueprint && !night && <Sky distance={450} sunPosition={[sun.dir.x, sun.dir.y, sun.dir.z]} turbidity={2.5} rayleigh={1.6 + sun.warm * 1.5} mieCoefficient={0.003} mieDirectionalG={0.8} />}
      <fog attach="fog" args={[blueprint ? "#0b1822" : skyColor, 80, 300]} />

      {/* Image-based lighting built locally (no network): soft sky dome + a warm patch toward the sun.
          Gives glass and metal something real to reflect, and fills shadows with sky colour. */}
      {!blueprint && (
        <Environment resolution={128} frames={1} environmentIntensity={night ? 0.08 : 0.35 + sun.day * 0.5}>
          <Lightformer form="ring" intensity={1.2} color={night ? "#33405a" : "#dfe9f2"} scale={40} position={[0, 30, 0]} rotation-x={Math.PI / 2} />
          <Lightformer form="rect" intensity={0.6} color="#8a8a7a" scale={[60, 6, 1]} position={[0, -4, 0]} rotation-x={-Math.PI / 2} />
          {!night && <Lightformer form="rect" intensity={2.2 * sun.day} color={sun.color} scale={[14, 8, 1]} position={[sun.dir.x * 30, Math.max(3, sun.dir.y * 30), sun.dir.z * 30]} target={[0, 0, 0]} />}
        </Environment>
      )}
      <hemisphereLight args={[night ? "#223049" : "#dfe8ee", night ? "#0b0d10" : "#6b6a5f", night ? 0.18 : 0.35 + sun.day * 0.35]} />
      {!night && sun.day > 0.01 && (
        <directionalLight position={sun.position} intensity={0.4 + sun.day * 2.6} color={sun.color} castShadow
          shadow-mapSize={hq ? [4096, 4096] : [2048, 2048]} shadow-camera-left={-shadowExtent} shadow-camera-right={shadowExtent}
          shadow-camera-top={shadowExtent} shadow-camera-bottom={-shadowExtent} shadow-camera-far={200} shadow-bias={-0.0003} shadow-normalBias={0.02}
          shadow-radius={4} target-position={[pcx, 0, pcz]} />
      )}
      {night && <directionalLight position={[pcx - 30, 40, pcz + 20]} intensity={0.12} color="#9fb3d9" />}

      <BuildingScene model={model} options={options} />
      {!blueprint && !hq && <ContactShadows position={[pcx, 0.001, pcz]} scale={plotSpan * 1.5} opacity={0.3} blur={2.4} far={H + 2} />}
      {hq && !blueprint && (
        <EffectComposer multisampling={4} enableNormalPass={false}>
          <N8AO aoRadius={pose.interior ? 0.6 : 1.4} distanceFalloff={1} intensity={pose.interior ? 1.6 : 2.2} halfRes quality="medium" />
          {/* The composer renders in linear HDR; tone-map here or the sky and highlights clip to white. */}
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      )}

      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08}
        autoRotate={autoRotate} autoRotateSpeed={0.6}
        enableZoom={!pose.interior} enablePan={!pose.interior}
        minDistance={flying ? 0.01 : pose.interior ? 0.05 : 2} maxDistance={flying ? 1000 : pose.interior ? 1.5 : 220}
        maxPolarAngle={pose.interior ? Math.PI * 0.85 : Math.PI / 2 - 0.02}
        rotateSpeed={pose.interior ? -0.35 : 0.8} />
      <CameraRig pose={pose} onFlying={setFlying} />
      {pose.interior && <WalkKeys controls={controls} />}
    </>
  );
}

/**
 * Moves camera and orbit target to the active preset with an eased transition.
 * Any user drag cancels the move. Distance limits apply only once the camera has arrived,
 * so OrbitControls never clamps it mid-flight.
 */
function CameraRig({ pose, onFlying }: { pose: CameraPose; onFlying: (flying: boolean) => void }) {
  const camera = useThree((s) => s.camera);
  const c = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const anim = useRef<{ t: number; fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3 } | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (!c) return;
    const toPos = new THREE.Vector3(...pose.position), toTarget = new THREE.Vector3(...pose.target);
    if (first.current) {
      first.current = false;
      camera.position.copy(toPos);
      c.target.copy(toTarget);
      c.update();
      return;
    }
    onFlying(true);
    anim.current = { t: 0, fromPos: camera.position.clone(), fromTarget: c.target.clone(), toPos, toTarget };
    const cancel = () => { if (anim.current) { anim.current = null; onFlying(false); } };
    c.addEventListener("start", cancel);
    return () => c.removeEventListener("start", cancel);
  }, [pose, camera, c, onFlying]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (!a || !c) return;
    a.t = Math.min(1, a.t + dt / 1.1);
    const e = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2; // ease-in-out cubic
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    c.target.lerpVectors(a.fromTarget, a.toTarget, e);
    c.update();
    if (a.t >= 1) { anim.current = null; onFlying(false); }
  });
  return null;
}

/** Keyboard walking for interior views: moves camera and orbit target together. */
function WalkKeys({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const keys = useRef(new Set<string>());
  const { camera } = useThree();
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, select, textarea")) return;
      keys.current.add(e.key.toLowerCase());
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c || keys.current.size === 0) return;
    const fwd = new THREE.Vector3().subVectors(c.target, camera.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const move = new THREE.Vector3();
    const k = keys.current;
    if (k.has("w") || k.has("arrowup")) move.add(fwd);
    if (k.has("s") || k.has("arrowdown")) move.sub(fwd);
    if (k.has("d") || k.has("arrowright")) move.add(right);
    if (k.has("a") || k.has("arrowleft")) move.sub(right);
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(dt * 1.6);
    camera.position.add(move);
    c.target.add(move);
    c.update();
  });
  return null;
}
