"use client";

import { useState } from "react";
import type { FieldErrors, UseFormRegister, FieldValues, Path } from "react-hook-form";
import { titleCase } from "@/lib/utils";

/** Client-generated idempotency key: a retried submit re-uses it and the server returns the same record. */
export function useSubmissionId() {
  const [id] = useState(() => globalThis.crypto.randomUUID());
  return id;
}

export function CheckboxGroup<T extends FieldValues>({ name, options, register, columns = 3 }: { name: Path<T>; options: readonly string[]; register: UseFormRegister<T>; columns?: number }) {
  return (
    <div className={`grid gap-x-4 gap-y-1.5 text-sm text-stone-700`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <label key={o} className="flex items-center gap-2">
          <input type="checkbox" value={o} {...register(name)} className="h-4 w-4 rounded border-stone-300 text-brand-700 focus:ring-brand-500" />
          {titleCase(o)}
        </label>
      ))}
    </div>
  );
}

export function ErrorText({ errors, name }: { errors: FieldErrors; name: string }) {
  const err = name.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), errors) as { message?: string } | undefined;
  if (!err?.message) return null;
  return <p className="mt-1 text-xs text-red-600">{String(err.message)}</p>;
}

export function useSubmit<T>(url: string, buildBody: (values: T) => unknown) {
  const [state, setState] = useState<{ status: "idle" | "submitting" | "done" | "error"; message?: string; data?: Record<string, unknown> }>({ status: "idle" });
  async function submit(values: T) {
    setState({ status: "submitting" });
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildBody(values)) });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const issues = data.issues as Record<string, string[]> | undefined;
        const detail = issues ? Object.entries(issues).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ") : "";
        setState({ status: "error", message: `${String(data.error ?? "Something went wrong")}${detail ? ` — ${detail}` : ""}` });
        return;
      }
      setState({ status: "done", data });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "Network error" });
    }
  }
  return { state, submit };
}

export const inputClass = "h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-base text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
export const textareaClass = "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";
export const selectClass = "h-11 w-full rounded-lg border border-stone-300 bg-white px-2.5 text-base text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100";

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="surface rounded-2xl p-6 sm:p-7">
      <h2 className="font-display text-2xl font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-1 text-sm text-stone-500">{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function L({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-stone-700">
      {children}
    </label>
  );
}

import { STATE_TIMEZONE, US_STATES, US_TIMEZONES } from "@/lib/validation/constants";
import { useEffect } from "react";
import type { UseFormWatch, UseFormSetValue } from "react-hook-form";

export function StateOptions() {
  return (
    <>
      <option value="">Choose…</option>
      {US_STATES.map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </>
  );
}

export function TimezoneOptions() {
  return (
    <>
      {US_TIMEZONES.map(([id, label]) => (
        <option key={id} value={id}>
          {label} ({id.replace("America/", "").replace("Pacific/", "").replace(/_/g, " ")})
        </option>
      ))}
    </>
  );
}

/** Keep the time zone in step with the chosen state until the user picks a zone explicitly. */
export function useStateTimezone<T extends FieldValues>(watch: UseFormWatch<T>, setValue: UseFormSetValue<T>, touched: boolean) {
  const state = watch("state" as Path<T>) as unknown as string;
  useEffect(() => {
    if (!touched && state && STATE_TIMEZONE[state]) setValue("timezone" as Path<T>, STATE_TIMEZONE[state] as never);
  }, [state, touched, setValue]);
}
