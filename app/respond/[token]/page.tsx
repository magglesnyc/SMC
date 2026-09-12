import { peekToken } from "@/lib/tokens";
import { eventSummary } from "@/lib/services/eventRequests";
import { effectiveRate } from "@/lib/matching";
import { decimalToNumber, fmtMoney } from "@/lib/utils";
import { ResponseForm } from "../ResponseForm";
import { Wordmark } from "@/components/brand";

export const metadata = { title: "Respond to your booking" };
export const dynamic = "force-dynamic";

export default async function RespondPage(props: PageProps<"/respond/[token]">) {
  const { token } = await props.params;
  const { state, token: row } = await peekToken(token);

  if (state !== "active" || !row || row.purpose !== "OFFER_RESPONSE") {
    const message =
      state === "used"
        ? "You have already responded using this link. If you need to change your response, reply to the email."
        : state === "expired"
          ? "This link has expired. Reply to the email and our team will send a new one."
          : state === "revoked"
            ? "This offer has been withdrawn or updated. If a new link was sent, please use that one."
            : "We could not find this link.";
    return (
      <Shell>
        <div className="surface rounded-2xl p-8 text-center">
          <h1 className="font-display text-2xl font-semibold text-ink">This link is no longer active</h1>
          <p className="mt-2 text-sm text-stone-600">{message}</p>
        </div>
      </Shell>
    );
  }

  const m = row.match;
  const role = row.recipientRole;
  const rate = effectiveRate({ standardRate: decimalToNumber(m.musician.standardRate) ?? 0, rateStructure: m.musician.rateStructure } as Parameters<typeof effectiveRate>[0], m.eventRequest.durationMinutes);
  const e = eventSummary(m.eventRequest, { musicianName: m.musician.stageName ?? `${m.musician.firstName} ${m.musician.lastName}`, rate: `${fmtMoney(rate)}${m.musician.travelFeeApplies ? " + travel fee" : ""}` });
  const stillOpen = ["OFFERED", "PARTIALLY_ACCEPTED"].includes(m.status) && m.selected;

  return (
    <Shell>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">{role === "MUSICIAN" ? "Booking offer" : "Confirm your musician"}</h1>
      <p className="mt-1 text-sm text-stone-600">{role === "MUSICIAN" ? `Hi ${m.musician.firstName}, please review the details and respond below.` : `Hi ${m.facility.primaryContactName}, please review the proposed booking and respond below.`}</p>
      <div className="surface mt-6 rounded-2xl p-6 text-base">
        <div className="text-xs uppercase tracking-wide text-stone-500">Event {e.reference}</div>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Row k="When" v={`${e.when} (${e.durationMinutes} minutes)`} />
          <Row k="Where" v={`${e.facilityName}, ${e.location}`} />
          <Row k="Program" v={e.service} />
          <Row k="Musician" v={e.musicianName ?? ""} />
          <Row k="Rate" v={e.rate ?? ""} />
          <Row k="Contact" v={`${e.contactName}${e.contactEmail ? ` · ${e.contactEmail}` : ""}`} />
          {m.eventRequest.setupBufferMinutes ? <Row k="Setup" v={`Please arrive ${m.eventRequest.setupBufferMinutes} minutes before start`} /> : null}
        </dl>
        <p className="mt-4 text-xs text-stone-500">Terms: standard Senior Music Connection performance terms apply. Cancellations with less than 48 hours notice are recorded against reliability history.</p>
      </div>
      <div className="mt-6">
        {stillOpen ? (
          <ResponseForm token={token} role={role} />
        ) : (
          <div className="rounded-lg border border-stone-200 bg-white p-6 text-center text-sm text-stone-600">This offer is no longer open for responses.</div>
        )}
      </div>
    </Shell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">{k}</dt>
      <dd className="text-stone-900">{v}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gold-300/40 bg-paper/80">
        <div className="mx-auto max-w-2xl px-6 py-4"><Wordmark compact /></div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
