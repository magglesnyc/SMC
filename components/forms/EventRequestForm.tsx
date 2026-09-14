"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { eventRequestSchema, type EventRequestInput } from "@/lib/validation/schemas";

type FormValues = z.input<typeof eventRequestSchema>;
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from "@/lib/matching/types";
import { AUDIENCE_TAGS, FACILITY_TYPES, GENRES, PROGRAM_TAGS, THERAPEUTIC_QUALIFICATIONS } from "@/lib/validation/constants";
import { Button } from "@/components/ui";
import { CheckboxGroup, ErrorText, L, Section, StateOptions, TimezoneOptions, inputClass, selectClass, textareaClass, useStateTimezone, useSubmissionId, useSubmit } from "./shared";
import { titleCase } from "@/lib/utils";

export function EventRequestForm({ facilities, defaultFacilityId, defaultNotes }: { facilities: { id: string; name: string; city: string }[]; defaultFacilityId?: string; defaultNotes?: string }) {
  const submissionId = useSubmissionId();
  const form = useForm<FormValues, unknown, EventRequestInput>({
    resolver: zodResolver(eventRequestSchema),
    defaultValues: {
      submissionId,
      facilityId: defaultFacilityId && facilities.some((f) => f.id === defaultFacilityId) ? defaultFacilityId : undefined,
      notes: defaultNotes,
      state: "",
      facilityType: "assisted-living",
      durationMinutes: 60,
      setupBufferMinutes: 30,
      timezone: "America/New_York",
      serviceType: "LIVE_ENTERTAINMENT",
      programTags: [],
      preferredGenres: [],
      audienceTags: [],
      hardRequirements: { therapeuticQualifications: [], certifications: [], backgroundCheckRequired: true, insuranceRequired: true, audienceTags: [], programRequirements: [] },
    },
  });
  const { register, handleSubmit, watch, setValue, formState: { errors, dirtyFields } } = form;
  useStateTimezone(watch, setValue, Boolean(dirtyFields.timezone));
  const { state, submit } = useSubmit<EventRequestInput>("/api/public/requests", (v) => v);
  const facilityId = watch("facilityId");

  if (state.status === "done") {
    const d = state.data ?? {};
    const missing = (d.missingFields as string[] | undefined) ?? [];
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <h2 className="text-lg font-semibold">Request received — reference {String(d.reference)}</h2>
        <p className="mt-2 text-sm">We have emailed you a confirmation. A scheduler will review the request and send a proposed musician for your approval.</p>
        {missing.length ? <p className="mt-2 text-sm">We will follow up by email for: {missing.join(", ")}.</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6" noValidate>
      <Section title="Your community" description="If you have worked with us before, choose your community so we can reuse your venue details.">
        {facilities.length ? (
          <div>
            <L>Existing community (optional)</L>
            <select className={selectClass} {...register("facilityId")}>
              <option value="">— New or not listed —</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.city}</option>)}
            </select>
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><L>Community / facility name</L><input className={inputClass} {...register("facilityName")} /><ErrorText errors={errors} name="facilityName" /></div>
          <div><L>Facility type</L><select className={selectClass} {...register("facilityType")}>{FACILITY_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></div>
          <div><L>Your name</L><input className={inputClass} {...register("contactName")} /><ErrorText errors={errors} name="contactName" /></div>
          <div><L>Your role</L><input className={inputClass} placeholder="Activity director" {...register("contactRole")} /></div>
          <div><L>Email</L><input className={inputClass} type="email" {...register("contactEmail")} /><ErrorText errors={errors} name="contactEmail" /></div>
          <div><L>Phone (optional)</L><input className={inputClass} type="tel" {...register("contactPhone")} /><ErrorText errors={errors} name="contactPhone" /></div>
          <div className="sm:col-span-2"><L>Street address {facilityId ? "(event location, if different)" : ""}</L><input className={inputClass} {...register("addressLine1")} /><ErrorText errors={errors} name="addressLine1" /></div>
          <div><L>City</L><input className={inputClass} {...register("city")} /><ErrorText errors={errors} name="city" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><L>State</L><select className={selectClass} {...register("state")}><StateOptions /></select><ErrorText errors={errors} name="state" /></div>
            <div><L>ZIP</L><input className={inputClass} {...register("postalCode")} /><ErrorText errors={errors} name="postalCode" /></div>
          </div>
        </div>
      </Section>

      <Section title="The event">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><L>Date</L><input className={inputClass} type="date" {...register("date")} /><ErrorText errors={errors} name="date" /></div>
          <div><L>Start time</L><input className={inputClass} type="time" {...register("startTime")} /><ErrorText errors={errors} name="startTime" /></div>
          <div><L>Duration (minutes)</L><input className={inputClass} type="number" step="15" {...register("durationMinutes")} /><ErrorText errors={errors} name="durationMinutes" /></div>
          <div className="sm:col-span-3"><L>Time zone</L><select className={selectClass} {...register("timezone")}><TimezoneOptions /></select><p className="mt-1 text-xs text-stone-500">Set from your state; change it if your community is in a different zone.</p><ErrorText errors={errors} name="timezone" /></div>
          <div><L>Setup buffer (minutes)</L><input className={inputClass} type="number" step="15" {...register("setupBufferMinutes")} /></div>
          <div><L>Expected attendance</L><input className={inputClass} type="number" {...register("expectedAttendance")} /><ErrorText errors={errors} name="expectedAttendance" /></div>
          <div><L>Budget ceiling (USD)</L><input className={inputClass} type="number" step="5" {...register("budgetCeiling")} /><ErrorText errors={errors} name="budgetCeiling" /></div>
        </div>
        <div>
          <L>Program type</L>
          <select className={selectClass} {...register("serviceType")}>{SERVICE_TYPES.map((t) => <option key={t} value={t}>{SERVICE_TYPE_LABELS[t]}</option>)}</select>
        </div>
        <div><L>Program style (optional)</L><CheckboxGroup name="programTags" options={PROGRAM_TAGS} register={register} /></div>
        <div><L>Preferred genres (optional)</L><CheckboxGroup name="preferredGenres" options={GENRES} register={register} /></div>
        <div><L>Describe the audience</L><textarea className={textareaClass} rows={3} placeholder="e.g. 25 residents in the main lounge, most seated; a few residents enjoy singing along." {...register("audienceDescription")} /></div>
        <div><L>Audience considerations</L><CheckboxGroup name="audienceTags" options={AUDIENCE_TAGS} register={register} /><p className="mt-1 text-xs text-stone-500">Programming considerations only — please do not include resident health information.</p></div>
      </Section>

      <Section title="Requirements" description="Hard requirements exclude musicians who do not meet them.">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" {...register("hardRequirements.backgroundCheckRequired")} className="h-4 w-4 rounded border-stone-300" />Cleared background check required</label>
          <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" {...register("hardRequirements.insuranceRequired")} className="h-4 w-4 rounded border-stone-300" />Liability insurance required</label>
        </div>
        <div><L>Required experience (e.g. memory care)</L><CheckboxGroup name="hardRequirements.audienceTags" options={AUDIENCE_TAGS} register={register} /></div>
        <div><L>Required therapeutic qualification</L><CheckboxGroup name="hardRequirements.therapeuticQualifications" options={THERAPEUTIC_QUALIFICATIONS} register={register} columns={2} /></div>
        <div><L>Anything else we should know?</L><textarea className={textareaClass} rows={3} {...register("notes")} /></div>
      </Section>

      {state.status === "error" ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.message}</div> : null}
      <Button type="submit" size="lg" disabled={state.status === "submitting"}>{state.status === "submitting" ? "Submitting…" : "Submit request"}</Button>
    </form>
  );
}
