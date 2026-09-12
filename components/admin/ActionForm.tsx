"use client";

import { useActionState, useState } from "react";
import type { ActionResult } from "@/app/admin/actions";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/**
 * Small wrapper around a server action: renders hidden fields + optional inputs, shows the
 * result inline, and supports a confirm prompt for destructive actions.
 */
export function ActionForm({
  action,
  hidden = {},
  children,
  submitLabel,
  variant = "primary",
  size = "sm",
  confirm,
  className,
  inline,
}: {
  action: Action;
  hidden?: Record<string, string | number | null | undefined>;
  children?: React.ReactNode;
  submitLabel: string;
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  confirm?: string;
  className?: string;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(action, null);
  const shown = pending ? null : state;
  return (
    <form
      action={formAction}
      className={cn(inline ? "inline-flex flex-wrap items-center gap-2" : "space-y-2", className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([k, v]) => (v == null ? null : <input key={k} type="hidden" name={k} value={String(v)} />))}
      {children}
      <Button type="submit" variant={variant} size={size} disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </Button>
      {shown ? (
        <span className={cn("text-xs", shown.ok ? "text-emerald-700" : "text-red-700")} role="status">
          {shown.ok ? (shown.message ?? "Done") : shown.error}
        </span>
      ) : null}
    </form>
  );
}

/** Collapsible panel for secondary actions. */
export function Disclosure({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-stone-200">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-stone-800 hover:bg-stone-50">
        {title}
        <span className="text-stone-400">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="border-t border-stone-100 px-3 py-3">{children}</div> : null}
    </div>
  );
}
