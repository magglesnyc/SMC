"use client";

import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { musicianApplicationSchema, type MusicianApplicationInput } from "@/lib/validation/schemas";

type FormValues = z.input<typeof musicianApplicationSchema>;
import { SERVICE_TYPES, SERVICE_TYPE_LABELS } from "@/lib/matching/types";
import { AUDIENCE_TAGS, CERTIFICATIONS, FACILITY_TYPES, GENRES, INSTRUMENTS, THERAPEUTIC_QUALIFICATIONS, WEEKDAYS } from "@/lib/validation/constants";
import { Button } from "@/components/ui";
import { CheckboxGroup, ErrorText, L, Section, StateOptions, TimezoneOptions, inputClass, selectClass, useStateTimezone, useSubmissionId, useSubmit } from "./shared";

export function MusicianApplicationForm() {
  const submissionId = useSubmissionId();
  const form = useForm<FormValues, unknown, MusicianApplicationInput>({
    resolver: zodResolver(musicianApplicationSchema),
    defaultValues: {
      submissionId,
      state: "",
      timezone: "America/New_York",
      entertainmentTypes: [],
      genres: [],
      instruments: [],
      therapeuticQualifications: [],
      audienceExperience: [],
      facilityTypeExperience: [],
      certifications: [],
      offersInteractive: false,
      backgroundCheckStatus: "NONE",
      rateStructure: "PER_EVENT",
      minBookingMinutes: 60,
      maxTravelMiles: 30,
      travelFeeApplies: false,
      weeklyAvailability: [{ day: 2, start: "10:00", end: "16:00" }],
      blackouts: [],
    },
  });
  const { register, handleSubmit, control, watch, setValue, formState: { errors, dirtyFields } } = form;
  useStateTimezone(watch, setValue, Boolean(dirtyFields.timezone));
  const windows = useFieldArray({ control, name: "weeklyAvailability" });
  const { state, submit } = useSubmit<MusicianApplicationInput>("/api/public/musicians", (v) => v);

  if (state.status === "done") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <h2 className="text-lg font-semibold">Thank you — your application is in.</h2>
        <p className="mt-2 text-sm">Our team reviews every application by hand. We have emailed you a confirmation and will follow up once your profile is reviewed.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-6" noValidate>
      <Section title="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><L>First name</L><input className={inputClass} {...register("firstName")} /><ErrorText errors={errors} name="firstName" /></div>
          <div><L>Last name</L><input className={inputClass} {...register("lastName")} /><ErrorText errors={errors} name="lastName" /></div>
          <div className="sm:col-span-2"><L>Stage or performing name (optional)</L><input className={inputClass} {...register("stageName")} /></div>
          <div><L>Email</L><input className={inputClass} type="email" {...register("email")} /><ErrorText errors={errors} name="email" /></div>
          <div><L>Phone</L><input className={inputClass} type="tel" {...register("phone")} /><ErrorText errors={errors} name="phone" /></div>
          <div className="sm:col-span-2"><L>Home base street address</L><input className={inputClass} {...register("addressLine1")} /><ErrorText errors={errors} name="addressLine1" /></div>
          <div><L>City</L><input className={inputClass} {...register("city")} /><ErrorText errors={errors} name="city" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><L>State</L><select className={selectClass} {...register("state")}><StateOptions /></select><ErrorText errors={errors} name="state" /></div>
            <div><L>ZIP</L><input className={inputClass} {...register("postalCode")} /><ErrorText errors={errors} name="postalCode" /></div>
          </div>
        </div>
      </Section>

      <Section title="Services you offer" description="Select everything that applies. This drives which requests you are considered for.">
        <div>
          <L>Entertainment type(s)</L>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {SERVICE_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" value={t} {...register("entertainmentTypes")} className="h-4 w-4 rounded border-stone-300" />{SERVICE_TYPE_LABELS[t]}</label>
            ))}
          </div>
          <ErrorText errors={errors} name="entertainmentTypes" />
        </div>
        <div><L>Genres</L><CheckboxGroup name="genres" options={GENRES} register={register} /></div>
        <div><L>Instruments</L><CheckboxGroup name="instruments" options={INSTRUMENTS} register={register} /></div>
        <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" {...register("offersInteractive")} className="h-4 w-4 rounded border-stone-300" />I offer interactive or participatory sessions (sing-alongs, requests, movement)</label>
        <div><L>Therapeutic or specialty qualifications</L><CheckboxGroup name="therapeuticQualifications" options={THERAPEUTIC_QUALIFICATIONS} register={register} columns={2} /></div>
        <div><L>Audience experience</L><CheckboxGroup name="audienceExperience" options={AUDIENCE_TAGS} register={register} /></div>
        <div><L>Venue types you have played</L><CheckboxGroup name="facilityTypeExperience" options={FACILITY_TYPES} register={register} /></div>
      </Section>

      <Section title="Credentials" description="Most communities require liability insurance and a cleared background check.">
        <div><L>Certifications</L><CheckboxGroup name="certifications" options={CERTIFICATIONS} register={register} columns={2} /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><L>Insurance carrier</L><input className={inputClass} {...register("insuranceCarrier")} /></div>
          <div><L>Policy number</L><input className={inputClass} {...register("insurancePolicyNumber")} /></div>
          <div><L>Insurance expires</L><input className={inputClass} type="date" {...register("insuranceExpiresAt")} /><ErrorText errors={errors} name="insuranceExpiresAt" /></div>
        </div>
        <div>
          <L>Background check</L>
          <select className={selectClass} {...register("backgroundCheckStatus")}>
            <option value="NONE">Not yet completed</option>
            <option value="PENDING">In progress</option>
            <option value="CLEARED">Cleared (we will ask for documentation)</option>
          </select>
        </div>
      </Section>

      <Section title="Rates and travel">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><L>Standard rate (USD)</L><input className={inputClass} type="number" step="1" min="1" {...register("standardRate")} /><ErrorText errors={errors} name="standardRate" /></div>
          <div><L>Rate structure</L><select className={selectClass} {...register("rateStructure")}><option value="PER_EVENT">Per event</option><option value="PER_HOUR">Per hour</option></select></div>
          <div><L>Minimum booking (minutes)</L><input className={inputClass} type="number" step="15" {...register("minBookingMinutes")} /></div>
          <div><L>Maximum travel radius (miles)</L><input className={inputClass} type="number" {...register("maxTravelMiles")} /><ErrorText errors={errors} name="maxTravelMiles" /></div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-stone-700 sm:col-span-2"><input type="checkbox" {...register("travelFeeApplies")} className="h-4 w-4 rounded border-stone-300" />I charge a travel fee for longer distances</label>
        </div>
      </Section>

      <Section title="Weekly availability" description="When are you generally available to perform (including travel time)? You can add blackout dates later with our team.">
        <div><L>Your time zone</L><select className={selectClass} {...register("timezone")}><TimezoneOptions /></select><p className="mt-1 text-xs text-stone-500">Availability windows are in your local time.</p><ErrorText errors={errors} name="timezone" /></div>
        <div className="space-y-2">
          {windows.fields.map((f, i) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2">
              <select className={`${selectClass} w-28`} {...register(`weeklyAvailability.${i}.day`, { valueAsNumber: true })}>
                {WEEKDAYS.map((d, di) => <option key={d} value={di}>{d}</option>)}
              </select>
              <input className={`${inputClass} w-32`} type="time" {...register(`weeklyAvailability.${i}.start`)} />
              <span className="text-sm text-stone-500">to</span>
              <input className={`${inputClass} w-32`} type="time" {...register(`weeklyAvailability.${i}.end`)} />
              <Button type="button" variant="ghost" size="sm" onClick={() => windows.remove(i)}>Remove</Button>
            </div>
          ))}
          <ErrorText errors={errors} name="weeklyAvailability" />
          <Button type="button" variant="outline" size="sm" onClick={() => windows.append({ day: 3, start: "10:00", end: "16:00" })}>Add a window</Button>
        </div>
      </Section>

      {state.status === "error" ? <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.message}</div> : null}
      <Button type="submit" size="lg" disabled={state.status === "submitting"}>{state.status === "submitting" ? "Submitting…" : "Submit application"}</Button>
    </form>
  );
}
