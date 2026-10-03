import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, Info, CheckCircle2, FlaskConical } from "lucide-react";

export const cx = clsx;

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none";
const buttonVariant: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong",
  secondary: "border border-line-strong bg-surface-2 text-text hover:bg-surface-3 hover:border-faint",
  ghost: "text-muted hover:text-text hover:bg-surface-2",
  danger: "border border-danger/40 text-danger hover:bg-danger-soft",
};
const buttonSize: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cx(buttonBase, buttonVariant[variant], buttonSize[size], className);
}

export function Button({ variant = "secondary", size = "md", className, ...props }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({ variant = "secondary", size = "md", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-xl border border-line bg-surface", className)} {...props} />;
}

export function CardHeader({ title, subtitle, action, className }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "accent" | "warn" | "danger" | "ok" | "info";
const toneClass: Record<Tone, string> = {
  neutral: "border-line-strong text-muted bg-surface-2",
  accent: "border-accent/30 text-accent-strong bg-accent-soft",
  warn: "border-warn/30 text-warn bg-warn-soft",
  danger: "border-danger/30 text-danger bg-danger-soft",
  ok: "border-ok/30 text-ok bg-ok-soft",
  info: "border-info/30 text-info bg-info/10",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11.5px] font-medium leading-5", toneClass[tone], className)}>
      {children}
    </span>
  );
}

export function SampleDataBadge({ label = "Sample data", title }: { label?: string; title?: string }) {
  return (
    <Badge tone="warn" className="cursor-help">
      <span title={title ?? "Based on sample regional data — not verified market pricing."} className="inline-flex items-center gap-1">
        <FlaskConical className="size-3" aria-hidden /> {label}
      </span>
    </Badge>
  );
}

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="text-[12px] font-medium uppercase tracking-wide text-faint">{label}</div>
      <div className="mt-1 font-display text-[17px] font-semibold leading-snug text-text tabular [overflow-wrap:anywhere]">{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-muted">{sub}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children, className }: { tone?: "info" | "warn" | "danger" | "ok"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "info" ? Info : AlertTriangle;
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={cx("flex gap-3 rounded-lg border px-4 py-3 text-[13px]", toneClass[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-text/90">
        {title && <div className="font-medium text-text">{title}</div>}
        {children && <div className={cx(title && "mt-0.5", "text-muted")}>{children}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, htmlFor, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-text">{label}</label>
      {children}
      {hint && !error && <p className="text-[12px] text-faint">{hint}</p>}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

const inputBase = "h-10 w-full rounded-lg border border-line-strong bg-bg px-3 text-sm text-text placeholder:text-faint transition-colors hover:border-faint focus:border-accent focus:outline-none";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(inputBase, className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputBase, "h-auto min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(inputBase, "appearance-none pr-8 bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%239ba4a9%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_0.75rem_center]", className)} {...props} />;
}

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <div className="font-medium text-text">{title}</div>
      {body && <p className="mt-1 max-w-md text-[13px] text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[12px] font-medium uppercase tracking-wider text-faint">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-text sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Buildwise mark: a plan-view house footprint in a square. */
export function Logo({ className, withWord = true }: { className?: string; withWord?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect x="1" y="1" width="26" height="26" rx="7" fill="var(--accent)" />
        <path d="M8 20V12.5L14 8l6 4.5V20h-4.2v-4.4h-3.6V20z" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {withWord && <span className="font-display text-[17px] font-bold tracking-tight text-text">Buildwise</span>}
    </span>
  );
}
