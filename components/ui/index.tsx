import * as React from "react";
import Link from "next/link";
import { cn, titleCase } from "@/lib/utils";

// Minimal shadcn-style primitives on Tailwind. Swap for shadcn/ui components later if desired.

type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand-700 text-ivory hover:bg-brand-800 border-transparent shadow-warm",
  secondary: "bg-ink text-ivory hover:bg-brand-800 border-transparent",
  outline: "bg-paper text-brand-800 hover:bg-gold-100 border-gold-500/70",
  danger: "bg-red-600 text-white hover:bg-red-700 border-transparent",
  ghost: "bg-transparent text-stone-700 hover:bg-stone-100 border-transparent",
};
const sizes = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm", lg: "h-11 px-6 text-base" } as const;

export function Button({ className, variant = "primary", size = "md", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof sizes }) {
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-full border font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", buttonVariants[variant], sizes[size], className)}
      {...props}
    />
  );
}

export function LinkButton({ className, variant = "outline", size = "md", href, children }: { className?: string; variant?: ButtonVariant; size?: keyof typeof sizes; href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn("inline-flex items-center justify-center gap-1.5 rounded-full border font-semibold transition-colors", buttonVariants[variant], sizes[size], className)}>
      {children}
    </Link>
  );
}

const badgeTones = {
  neutral: "bg-stone-100 text-stone-700 ring-stone-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-800 ring-red-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-200",
  gold: "bg-gold-100 text-gold-700 ring-gold-300",
} as const;
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "neutral", className, children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", badgeTones[tone], className)}>{children}</span>;
}

const statusTone: Record<string, BadgeTone> = {
  SUBMITTED: "info",
  REVIEW: "info",
  APPROVED: "brand",
  ACTIVE: "success",
  INACTIVE: "neutral",
  SUSPENDED: "danger",
  NEEDS_INFORMATION: "warning",
  READY_TO_MATCH: "info",
  MATCHING: "info",
  AWAITING_APPROVAL: "brand",
  CLOSED: "neutral",
  RECOMMENDED: "neutral",
  OFFERED: "info",
  PARTIALLY_ACCEPTED: "brand",
  CONFIRMED: "success",
  COMPLETED: "success",
  DECLINED: "danger",
  CHANGE_REQUESTED: "warning",
  REMATCH_REQUIRED: "warning",
  CANCELLED: "danger",
  NO_SHOW: "danger",
  CONFLICT: "danger",
  SCHEDULED: "neutral",
  SENT: "info",
  FOLLOW_UP_REQUIRED: "warning",
  FAILED: "danger",
  SKIPPED: "neutral",
  INFO: "info",
  WARNING: "warning",
  CRITICAL: "danger",
  ACCEPTED: "success",
  PENDING_REVIEW: "warning",
  CLEARED: "success",
  NONE: "neutral",
  PENDING: "warning",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-stone-400">—</span>;
  return <Badge tone={statusTone[status] ?? "neutral"}>{titleCase(status)}</Badge>;
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("surface rounded-2xl", className)}>{children}</div>;
}
export function CardHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gold-300/30 px-5 py-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-stone-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50", className)} {...props} />;
}
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100", className)} {...props} />;
}
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("h-9 w-full rounded-md border border-stone-300 bg-white px-2.5 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100", className)} {...props}>
      {children}
    </select>
  );
}
export function Label({ className, children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn("mb-1 block text-sm font-medium text-stone-700", className)} {...props}>
      {children}
    </label>
  );
}
export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
      {hint && !error ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
export function Checkbox({ label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-stone-700", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" {...props} />
      {label}
    </label>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-gold-300/40 bg-gold-100/40 text-xs uppercase tracking-wide text-brand-800">{children}</thead>;
}
export function TH({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2 font-medium", className)}>{children}</th>;
}
export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("border-b border-stone-100 last:border-0 hover:bg-stone-50/60", className)}>{children}</tr>;
}
export function TD({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-top", className)}>{children}</td>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: BadgeTone }) {
  return (
    <div className="surface rounded-2xl p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.15em] text-gold-700">{label}</div>
      <div className={cn("font-display mt-1 text-3xl font-semibold text-ink", tone === "danger" && "text-red-700", tone === "warning" && "text-amber-700", tone === "success" && "text-emerald-700")}>{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-stone-500">{hint}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-gold-300 px-4 py-8 text-center text-sm text-ink/60">{children}</div>;
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "success" | "warning" | "danger"; title?: string; children?: React.ReactNode }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
  };
  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm", tones[tone])}>
      {title ? <div className="font-semibold">{title}</div> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 text-sm text-stone-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function DL({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex flex-col">
          <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{k}</dt>
          <dd className="text-stone-900">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
