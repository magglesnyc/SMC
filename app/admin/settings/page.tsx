import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { getMatchingConfig } from "@/lib/services/matching";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/admin/ActionForm";
import { saveTemplateAction, saveWeightsAction } from "../actions";
import { CRITERIA, CRITERION_LABELS, DEFAULT_THRESHOLDS, type Thresholds } from "@/lib/matching";
import { fmtDateTime } from "@/lib/utils";

const THRESHOLD_HELP: Record<keyof Thresholds, string> = {
  comfortableBufferMinutes: "Slack (min) on each side of the needed window that earns full availability marks",
  nearMinutes: "Travel minutes at or under which distance scores 100",
  farMinutes: "Travel minutes at or over which distance scores 0",
  longTravelWarningMinutes: "Travel minutes above which a warning is shown",
  budgetComfortRatio: "Rate ÷ budget at or under which budget scores 100 (e.g. 0.8)",
  budgetHardOverRatio: "Rate ÷ budget at or over which budget scores 0 (e.g. 1.25)",
  lowRatingWarning: "Average rating under which a warning is shown",
  rotationWindowDays: "Days used to count recent bookings for rotation",
  rotationSaturationCount: "Recent bookings at which the rotation penalty is maximal",
  insuranceExpiryWarningDays: "Warn if insurance expires within this many days after the event",
  bookingGapMinutes: "Minimum gap between two bookings beyond travel time",
};

const TEMPLATE_KEYS = [
  ["offer.musician", "Offer to musician"],
  ["offer.facility", "Confirmation request to facility"],
  ["confirmed.musician", "Confirmed (musician)"],
  ["confirmed.facility", "Confirmed (facility)"],
  ["reminder.musician", "Reminder (musician)"],
  ["reminder.facility", "Reminder (facility)"],
  ["feedback.client", "Feedback request (facility)"],
  ["feedback.musician", "Feedback request (musician)"],
  ["request.received", "Request received"],
  ["request.needs_information", "Needs information"],
  ["musician.received", "Application received"],
  ["change.acknowledged", "Change request acknowledged"],
] as const;

export default async function SettingsPage() {
  await requireAdmin();
  const cfg = await getMatchingConfig();
  const templates = await prisma.notificationTemplate.findMany();
  const tmap = Object.fromEntries(templates.map((t) => [t.key, t]));
  return (
    <div>
      <PageHeader title="Settings" description="Administrators only. Changes are audited and take effect on the next match run; every run stores a snapshot of the weights it used." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Scoring weights" description={`Must sum to 100. Last updated ${cfg.updatedAt ? fmtDateTime(cfg.updatedAt) : "never (defaults)"}.`} />
          <CardBody>
            <ActionForm action={saveWeightsAction} submitLabel="Save configuration">
              <table className="w-full text-sm">
                <tbody>
                  {CRITERIA.map((c) => (
                    <tr key={c} className="border-b border-stone-100">
                      <td className="py-2 pr-3">{CRITERION_LABELS[c]}</td>
                      <td className="py-2 text-right"><input name={`w_${c}`} type="number" min="0" max="100" step="1" defaultValue={cfg.weights[c]} className="h-8 w-20 rounded-md border border-stone-300 px-2 text-right" /> <span className="text-stone-500">%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h3 className="mt-6 text-sm font-semibold text-stone-800">Thresholds</h3>
              <table className="w-full text-sm">
                <tbody>
                  {(Object.keys(DEFAULT_THRESHOLDS) as (keyof Thresholds)[]).map((k) => (
                    <tr key={k} className="border-b border-stone-100">
                      <td className="py-2 pr-3"><div className="font-medium">{k}</div><div className="text-xs text-stone-500">{THRESHOLD_HELP[k]}</div></td>
                      <td className="py-2 text-right"><input name={`t_${k}`} type="number" step="any" defaultValue={cfg.thresholds[k]} className="h-8 w-24 rounded-md border border-stone-300 px-2 text-right" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-stone-500">Tip: run <code>npm run backtest</code> before and after a change to see how the booked musician&apos;s rank moves across historical events.</p>
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Email templates" description="Subject line and opening paragraph per template. Event details, links and branding are rendered by the code." />
          <CardBody className="space-y-4">
            {TEMPLATE_KEYS.map(([key, label]) => (
              <ActionForm key={key} action={saveTemplateAction} hidden={{ key }} submitLabel="Save" variant="outline" size="sm">
                <div className="text-sm font-medium text-stone-800">{label} <span className="font-mono text-xs text-stone-400">{key}</span></div>
                <input name="subject" defaultValue={tmap[key]?.subject ?? ""} placeholder="Subject (blank = default)" className="h-8 w-full rounded-md border border-stone-300 px-2 text-sm" />
                <textarea name="intro" rows={2} defaultValue={tmap[key]?.intro ?? ""} placeholder="Opening paragraph (blank = default)" className="w-full rounded-md border border-stone-300 px-2 py-1 text-sm" />
              </ActionForm>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
