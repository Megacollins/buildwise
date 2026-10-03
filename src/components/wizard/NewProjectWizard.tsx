"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, MapPin, Minus, Plus, Sparkles, Upload, AlertTriangle } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { generateConceptsAction, createProjectAction, type WizardInput } from "@/app/actions/projects";
import { parseRequirements } from "@/domain/assistant/parse-requirements";
import { STYLES, type Requirements } from "@/domain/generator/requirements";
import { toMm, formatLength, formatArea, type LengthUnit } from "@/domain/units";
import type { BuildingModel } from "@/domain/model/types";
import { FloorPlan } from "@/components/drawings/FloorPlan";
import { formatMoneyRange, formatMoney } from "@/i18n/format";
import { Badge, Button, Field, Input, Notice, SampleDataBadge, Select, Textarea, cx } from "@/components/ui";

export interface WizardRegion {
  id: string; country: string; subdivision: string; city: string; currency: string;
  measurementSystem: "metric" | "imperial"; climate: string; setbacks: { front: number; rear: number; left: number; right: number };
  /** Local conventions suggested in the brief (the user can change them) */
  suggests: { majlis: boolean; staffRooms: number; carport: boolean; why: string[] };
}

type Concept = {
  key: "A" | "B" | "C"; name: string; strategy: string; highlights: string[]; fit: string[]; model: BuildingModel;
  total: [number, number]; expected: number; gfa: number; rooms: number; floors: number; warnings: string[]; dataStatus: string;
  feasible: boolean; checks: { errors: number; warnings: number; total: number };
};

const STEPS = ["location", "plot", "home", "style", "budget", "concepts"] as const;

export function NewProjectWizard({ regions }: { regions: WizardRegion[] }) {
  const { t, bcp47, system } = useI18n();
  const [step, setStep] = useState(0);
  const countries = [...new Set(regions.map((r) => r.country))];
  const [country, setCountry] = useState(countries[0]);
  const [regionId, setRegionId] = useState(regions.find((r) => r.country === countries[0])!.id);
  const region = regions.find((r) => r.id === regionId)!;
  const [address, setAddress] = useState("");
  const [unit, setUnit] = useState<LengthUnit>(region.measurementSystem === "imperial" ? "ft" : "m");
  const [plotW, setPlotW] = useState(region.measurementSystem === "imperial" ? "50" : "15");
  const [plotD, setPlotD] = useState(region.measurementSystem === "imperial" ? "100" : "30");
  const [streetFaces, setStreetFaces] = useState<"S" | "N" | "E" | "W">("S");
  const [req, setReq] = useState<Requirements>({
    bedrooms: 3, bathrooms: 2, floors: 2, parking: 1, garage: false, office: false, laundry: true, storage: false,
    guestRoomDownstairs: false, familyLounge: false, separateDining: true, balcony: false, outdoorSpace: true, pool: false,
    majlis: region.suggests.majlis, staffRooms: region.suggests.staffRooms, carport: region.suggests.carport, style: "modern", notes: "",
  });
  /** Switching city resets the locally-conventional rooms to that place's suggestions. */
  const chooseRegion = (id: string) => {
    const r = regions.find((x) => x.id === id)!;
    setRegionId(id);
    setReq((q) => ({ ...q, majlis: r.suggests.majlis, staffRooms: r.suggests.staffRooms, carport: r.suggests.carport }));
  };
  const [understood, setUnderstood] = useState<string[] | null>(null);
  const [budget, setBudget] = useState({ target: "", min: "", max: "" });
  const [concepts, setConcepts] = useState<Concept[] | null>(null);
  const [chosen, setChosen] = useState<Concept["key"] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const plotWmm = toMm(Number(plotW) || 0, unit);
  const plotDmm = toMm(Number(plotD) || 0, unit);
  const plotValid = plotWmm >= 6000 && plotDmm >= 6000 && plotWmm <= 200000 && plotDmm <= 200000;
  const northAngle = { S: 0, N: 180, E: 90, W: 270 }[streetFaces];
  const num = (s: string) => (s.trim() ? Number(s.replace(/[, ]/g, "")) : null);

  const input = (): WizardInput => ({
    name: name.trim() || `${t(`style.${req.style}` as never)} ${req.bedrooms}-bedroom home`,
    regionId, addressLine: address.trim() || null,
    plot: { width: plotWmm, depth: plotDmm, northAngleDeg: northAngle },
    requirements: req,
    budget: { target: num(budget.target), min: num(budget.min), max: num(budget.max) },
  });

  const generate = () => {
    setError(null);
    start(async () => {
      const res = await generateConceptsAction(input());
      if (!res.ok) { setError(res.error); return; }
      setConcepts(res.concepts as Concept[]);
      setChosen(null);
      setStep(5);
    });
  };
  const create = () => {
    if (!chosen) return;
    setError(null);
    start(async () => {
      const res = await createProjectAction({ ...input(), conceptKey: chosen });
      if (res && !res.ok) setError(res.error);
    });
  };

  const canNext = [true, plotValid, true, true, !budget.target || (num(budget.target) ?? 0) > 0, true][step];

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
      <ol className="flex gap-2 overflow-x-auto lg:block lg:space-y-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="shrink-0">
            <button onClick={() => i < step && setStep(i)} disabled={i > step} aria-current={i === step ? "step" : undefined}
              className={cx("flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px]", i === step ? "bg-surface-3 text-text" : i < step ? "text-muted hover:text-text" : "text-faint")}>
              <span className={cx("flex size-6 items-center justify-center rounded-full text-[11.5px] font-semibold",
                i < step ? "bg-accent text-accent-ink" : i === step ? "border border-accent text-accent-strong" : "border border-line-strong")}>
                {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              {t(`wizard.step.${s}` as never)}
            </button>
          </li>
        ))}
      </ol>

      <div className="min-w-0 animate-fade-up" key={step}>
        {step === 0 && (
          <Section title={t("wizard.location.q")} help={t("wizard.location.help")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("field.country")} htmlFor="country">
                <Select id="country" value={country} onChange={(e) => { setCountry(e.target.value); const r = regions.find((x) => x.country === e.target.value)!; chooseRegion(r.id); setUnit(r.measurementSystem === "imperial" ? "ft" : "m"); }}>
                  {countries.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label={t("field.city")} htmlFor="city">
                <Select id="city" value={regionId} onChange={(e) => chooseRegion(e.target.value)}>
                  {regions.filter((r) => r.country === country).map((r) => <option key={r.id} value={r.id}>{r.city}, {r.subdivision}</option>)}
                </Select>
              </Field>
              <Field label={t("field.address")} htmlFor="addr" className="sm:col-span-2" hint="Used for your records only. Map-based site selection is coming.">
                <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="Street, area or plot reference" />
              </Field>
            </div>
            <div className="mt-5 flex gap-3 rounded-xl border border-line bg-surface p-4 text-[13px]">
              <MapPin className="mt-0.5 size-4 shrink-0 text-accent-strong" aria-hidden />
              <div>
                <div className="font-medium text-text">{region.city} · {region.currency}</div>
                <div className="text-muted">{region.climate}</div>
                <div className="mt-1.5 text-[12px] text-faint">Supported launch regions use sample datasets. Don’t see your city? More regions are being added — you can still explore with the closest region.</div>
              </div>
            </div>
          </Section>
        )}

        {step === 1 && (
          <Section title={t("wizard.plot.q")} help={t("wizard.plot.help")}>
            <div className="grid gap-6 md:grid-cols-[1fr_280px]">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t("field.plotWidth")} htmlFor="pw"><Input id="pw" inputMode="decimal" value={plotW} onChange={(e) => setPlotW(e.target.value)} aria-invalid={!plotValid} /></Field>
                <Field label={t("field.plotDepth")} htmlFor="pd"><Input id="pd" inputMode="decimal" value={plotD} onChange={(e) => setPlotD(e.target.value)} aria-invalid={!plotValid} /></Field>
                <Field label={t("field.unit")} htmlFor="unit">
                  <Select id="unit" value={unit} onChange={(e) => setUnit(e.target.value as LengthUnit)}>
                    <option value="m">metres</option><option value="ft">feet</option><option value="yd">yards</option>
                  </Select>
                </Field>
                <Field label="Which way does the street side face?" htmlFor="orient" className="sm:col-span-3" hint="Used for the north arrow, sun path and daylight in 3D.">
                  <Select id="orient" value={streetFaces} onChange={(e) => setStreetFaces(e.target.value as typeof streetFaces)}>
                    <option value="S">South</option><option value="N">North</option><option value="E">East</option><option value="W">West</option>
                  </Select>
                </Field>
                <div className="flex flex-wrap gap-2 sm:col-span-3">
                  <Badge><input type="checkbox" disabled className="me-1" aria-label="Irregular plot" />Irregular plot · coming soon</Badge>
                  <Badge><Upload className="size-3" aria-hidden /> Survey / site plan upload · coming soon</Badge>
                </div>
                {!plotValid && <Notice tone="warn" className="sm:col-span-3">Plots between 6 m and 200 m on each side are supported.</Notice>}
              </div>
              <PlotPreview w={plotWmm} d={plotDmm} sb={region.setbacks} valid={plotValid} />
            </div>
          </Section>
        )}

        {step === 2 && (
          <Section title={t("wizard.home.q")}>
            <Field label={t("wizard.home.describe")} htmlFor="desc">
              <Textarea id="desc" value={req.notes} onChange={(e) => setReq({ ...req, notes: e.target.value })} placeholder={t("wizard.home.describePlaceholder")} maxLength={2000} />
            </Field>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Button size="sm" disabled={!req.notes.trim()} onClick={() => { const p = parseRequirements(req.notes); setReq((r) => ({ ...r, ...p.fields })); setUnderstood(p.understood); }}>
                <Sparkles className="size-3.5" aria-hidden /> {t("wizard.home.apply")}
              </Button>
              {understood && (
                <span className="text-[12.5px] text-muted">{understood.length ? <>Understood: <span className="text-text">{understood.join(", ")}</span>. Check below.</> : "Couldn’t pick out specific requirements — set them below. (English descriptions only for now.)"}</span>
              )}
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Counter label={t("field.bedrooms")} value={req.bedrooms} min={1} max={8} set={(v) => setReq({ ...req, bedrooms: v })} />
              <Counter label={t("field.bathrooms")} value={req.bathrooms} min={1} max={8} set={(v) => setReq({ ...req, bathrooms: v })} />
              <Counter label={t("field.floors")} value={req.floors} min={1} max={3} set={(v) => setReq({ ...req, floors: v })} />
              <Counter label={t("field.parking")} value={req.parking} min={0} max={4} set={(v) => setReq({ ...req, parking: v })} />
              <Counter label={t("field.staffRooms")} value={req.staffRooms} min={0} max={2} set={(v) => setReq({ ...req, staffRooms: v })} />
            </div>
            <fieldset className="mt-6">
              <legend className="mb-2 text-[13px] font-medium">Spaces</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ["separateDining", "field.dining"], ["laundry", "field.laundry"], ["office", "field.office"], ["storage", "field.storage"],
                  ["garage", "field.garage"], ["guestRoomDownstairs", "field.guestDown"], ["familyLounge", "field.family"],
                  ["balcony", "field.balcony"], ["outdoorSpace", "field.outdoor"], ["pool", "field.pool"],
                  ["majlis", "field.majlis"], ["carport", "field.carport"],
                ] as const).map(([k, label]) => (
                  <label key={k} className={cx("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-[13.5px]", req[k] ? "border-accent/50 bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}>
                    <input type="checkbox" checked={req[k] as boolean} onChange={(e) => setReq({ ...req, [k]: e.target.checked })} className="size-4 accent-[var(--accent)]"
                      disabled={((k === "familyLounge" || k === "guestRoomDownstairs") && req.floors === 1) || (k === "carport" && (req.garage || req.parking === 0))} />
                    {t(label)}
                    {(k === "balcony" || k === "outdoorSpace") && <span className="ms-auto text-[11px] text-faint">noted</span>}
                  </label>
                ))}
              </div>
            </fieldset>
            {region.suggests.why.length > 0 && (
              <p className="mt-3 text-[12.5px] text-muted">
                Suggested for {region.city}: {region.suggests.why.join(" ")} Change these if they don&rsquo;t suit you.
              </p>
            )}
          </Section>
        )}

        {step === 3 && (
          <Section title={t("wizard.style.q")} help="Style guides roof form, glazing and finishes. You can change everything later.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {STYLES.map((s) => (
                <button key={s} onClick={() => setReq({ ...req, style: s })} aria-pressed={req.style === s}
                  className={cx("rounded-xl border p-4 text-start transition-colors", req.style === s ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong")}>
                  <StyleGlyph style={s} />
                  <div className="mt-3 text-[13.5px] font-medium text-text">{t(`style.${s}` as never)}</div>
                </button>
              ))}
            </div>
          </Section>
        )}

        {step === 4 && (
          <Section title={t("wizard.budget.q")} help={t("wizard.budget.help")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`${t("field.budgetTarget")} (${region.currency})`} htmlFor="bt" className="sm:col-span-3">
                <Input id="bt" inputMode="numeric" value={budget.target} onChange={(e) => setBudget({ ...budget, target: e.target.value })} placeholder="e.g. 150000" />
              </Field>
              <Field label={`${t("field.budgetMin")} (optional)`} htmlFor="bmin"><Input id="bmin" inputMode="numeric" value={budget.min} onChange={(e) => setBudget({ ...budget, min: e.target.value })} /></Field>
              <Field label={`${t("field.budgetMax")} (optional)`} htmlFor="bmax"><Input id="bmax" inputMode="numeric" value={budget.max} onChange={(e) => setBudget({ ...budget, max: e.target.value })} /></Field>
            </div>
            {num(budget.target) ? <p className="mt-3 text-[13px] text-muted">Target: <span className="text-text tabular">{formatMoney(num(budget.target)!, region.currency, bcp47)}</span> — construction cost only (excludes land, permits and fees).</p> : null}
          </Section>
        )}

        {step === 5 && concepts && (
          <Section title={t("wizard.concepts.q")} help={t("wizard.concepts.help")}>
            <div className="grid gap-4 xl:grid-cols-3">
              {concepts.map((c) => (
                <button key={c.key} onClick={() => c.feasible && setChosen(c.key)} aria-pressed={chosen === c.key} aria-disabled={!c.feasible}
                  className={cx("flex flex-col overflow-hidden rounded-xl border text-start transition-colors", !c.feasible ? "cursor-not-allowed border-danger/30 opacity-80" : chosen === c.key ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong")}>
                  <div className="aspect-[4/3] w-full bg-paper"><FloorPlan model={c.model} levelId="L0" system={system} showDimensions={false} showTags={false} /></div>
                  <div className="flex flex-1 flex-col bg-surface p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-display text-[15px] font-semibold">Concept {c.key} · {c.name}</div>
                      {chosen === c.key && <Check className="size-4 text-accent-strong" aria-label="Chosen" />}
                    </div>
                    <p className="text-[12.5px] text-muted">{c.strategy}</p>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-[12.5px]">
                      <div><dt className="text-faint">Area</dt><dd className="tabular">{formatArea(c.gfa, system, 0)}</dd></div>
                      <div><dt className="text-faint">Rooms</dt><dd>{c.rooms}</dd></div>
                      <div><dt className="text-faint">Floors</dt><dd>{c.floors}</dd></div>
                    </dl>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="font-display text-[15px] font-semibold tabular">{formatMoneyRange(c.total, region.currency, bcp47)}</span>
                      {c.dataStatus === "sample" && <SampleDataBadge />}
                    </div>
                    <div className="mt-2">
                      {c.feasible
                        ? <Badge tone="ok">Model check: {c.checks.total - c.checks.warnings} of {c.checks.total} passed{c.checks.warnings ? ` · ${c.checks.warnings} to review` : ""}</Badge>
                        : <Badge tone="danger">Not feasible on this plot</Badge>}
                    </div>
                    <ul className="mt-3 space-y-1 text-[12.5px] text-muted">{c.fit.map((f) => (
                      <li key={f} className="flex gap-2">
                        {c.feasible ? <Check className="mt-0.5 size-3.5 shrink-0 text-accent-strong" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-hidden />}{f}
                      </li>
                    ))}</ul>
                    {c.warnings.length > 0 && <p className="mt-2 flex gap-1.5 text-[12px] text-warn"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />{c.warnings.length} design note{c.warnings.length > 1 ? "s" : ""} to review</p>}
                  </div>
                </button>
              ))}
            </div>
            {concepts.every((c) => !c.feasible) && (
              <Notice tone="warn" className="mt-4" title="None of the concepts fit this brief on this plot">
                Go back and try another floor, fewer rooms, or check the plot size. We won’t offer a plan that can’t work.
              </Notice>
            )}
            <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label={t("field.projectName")} htmlFor="pname">
                <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} placeholder={`${t(`style.${req.style}` as never)} ${req.bedrooms}-bedroom home`} maxLength={100} />
              </Field>
              <Button variant="primary" size="lg" disabled={!chosen || pending} onClick={create}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}{t("wizard.choose")}
              </Button>
            </div>
            <p className="mt-3 text-[12px] text-faint">Concepts are generated by Buildwise’s rule-based layout engine from your brief, plot and region. They are starting points for exploration — not construction documents.</p>
          </Section>
        )}

        {error && <Notice tone="danger" className="mt-4">{error}</Notice>}

        <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || pending}><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />{t("wizard.back")}</Button>
          {step < 4 && <Button variant="primary" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>{t("wizard.next")}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></Button>}
          {step === 4 && <Button variant="primary" onClick={generate} disabled={!canNext || pending}>{pending ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Generating…</> : <>{t("wizard.generate")}<ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></>}</Button>}
          {step === 5 && <Button variant="secondary" onClick={generate} disabled={pending}>Regenerate</Button>}
        </div>
      </div>
    </div>
  );
}

function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      {help && <p className="mt-1.5 max-w-2xl text-[14px] text-muted">{help}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Counter({ label, value, min, max, set }: { label: string; value: number; min: number; max: number; set: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-line bg-surface px-3 py-2.5">
      <span className="text-[13.5px]">{label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => set(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`} className="flex size-7 items-center justify-center rounded-md border border-line-strong text-muted hover:text-text disabled:opacity-40"><Minus className="size-3.5" /></button>
        <span className="w-5 text-center font-medium tabular" aria-live="polite">{value}</span>
        <button onClick={() => set(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`} className="flex size-7 items-center justify-center rounded-md border border-line-strong text-muted hover:text-text disabled:opacity-40"><Plus className="size-3.5" /></button>
      </div>
    </div>
  );
}

function PlotPreview({ w, d, sb, valid }: { w: number; d: number; sb: WizardRegion["setbacks"]; valid: boolean }) {
  const { system } = useI18n();
  const size = useMemo(() => {
    const s = 220 / Math.max(w, d, 1);
    return { W: w * s, D: d * s, s };
  }, [w, d]);
  if (!valid) return <div className="flex h-60 items-center justify-center rounded-xl border border-dashed border-line-strong text-[13px] text-faint">Plot preview</div>;
  return (
    <figure className="rounded-xl border border-line bg-surface p-4">
      <svg viewBox={`-30 -20 ${size.W + 60} ${size.D + 60}`} className="mx-auto h-60 w-full" role="img" aria-label="Plot preview">
        <rect x={0} y={0} width={size.W} height={size.D} fill="var(--surface-3)" stroke="var(--muted)" strokeDasharray="6 3" />
        <rect x={sb.left * size.s} y={sb.rear * size.s} width={(w - sb.left - sb.right) * size.s} height={(d - sb.front - sb.rear) * size.s} fill="var(--accent-soft)" stroke="var(--accent)" />
        <text x={size.W / 2} y={size.D + 16} fontSize={10} textAnchor="middle" fill="var(--muted)">STREET · {formatLength(w, system)}</text>
        <text x={-8} y={size.D / 2} fontSize={10} textAnchor="middle" fill="var(--muted)" transform={`rotate(-90 -8 ${size.D / 2})`}>{formatLength(d, system)}</text>
      </svg>
      <figcaption className="mt-2 text-center text-[12px] text-muted">Plot {formatArea((w * d) / 1e6, system, 0)} · shaded = indicative buildable area</figcaption>
    </figure>
  );
}

function StyleGlyph({ style }: { style: string }) {
  const roof = { modern: "M6 14h28", contemporary: "M6 14h28", minimalist: "M6 14h28", industrial: "M6 14h28", scandinavian: "M4 16 20 4l16 12", traditional: "M3 15 20 6l17 9", mediterranean: "M3 15 20 8l17 7", tropical: "M1 16 20 6l19 10", luxury: "M6 14h28M10 10h20", regional: "M3 15 20 6l17 9", custom: "M6 14h28" }[style] ?? "M6 14h28";
  return (
    <svg viewBox="0 0 40 34" className="h-9 w-11 text-accent-strong" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path d={roof} /><rect x={7} y={style === "scandinavian" ? 14 : 14} width={26} height={17} />
      <rect x={12} y={19} width={6} height={5} /><rect x={22} y={19} width={5} height={12} />
    </svg>
  );
}
