import { Button, Section, Text } from "@react-email/components";
import { BrandedEmail, button, muted, p } from "./layout";

export interface EventSummary {
  reference: string;
  facilityName: string;
  when: string; // formatted in facility-local time
  durationMinutes: number;
  location: string;
  service: string;
  contactName: string;
  contactEmail?: string;
  rate?: string;
  musicianName?: string;
}

export function EventDetails({ e, showRate }: { e: EventSummary; showRate?: boolean }) {
  return (
    <Section style={{ backgroundColor: "#fbf3f5", border: "1px solid #e8c7cf", borderRadius: 10, padding: 16, margin: "12px 0 20px" }}>
      <Text style={muted}>Event reference: {e.reference}</Text>
      <Text style={p}>
        <strong>When:</strong> {e.when} ({e.durationMinutes} minutes)
      </Text>
      <Text style={p}>
        <strong>Where:</strong> {e.facilityName}, {e.location}
      </Text>
      <Text style={p}>
        <strong>Program:</strong> {e.service}
      </Text>
      {e.musicianName ? (
        <Text style={p}>
          <strong>Musician:</strong> {e.musicianName}
        </Text>
      ) : null}
      {showRate && e.rate ? (
        <Text style={p}>
          <strong>Rate:</strong> {e.rate}
        </Text>
      ) : null}
      <Text style={p}>
        <strong>Contact:</strong> {e.contactName}
        {e.contactEmail ? ` (${e.contactEmail})` : ""}
      </Text>
    </Section>
  );
}

// ───────────── Offers (secure response links) ─────────────

export function MusicianOfferEmail({ e, intro, url, expires }: { e: EventSummary; intro: string; url: string; expires: string }) {
  return (
    <BrandedEmail preview={`Booking offer: ${e.facilityName} on ${e.when}`} title="You have a booking offer">
      <Text style={p}>{intro}</Text>
      <EventDetails e={e} showRate />
      <Text style={p}>Please respond using the secure link below. You can accept, decline, or request a change.</Text>
      <Button href={url} style={button}>
        Respond to this offer
      </Button>
      <Text style={muted}>This personal link expires {expires} and can be used once. Please do not forward it.</Text>
      <Text style={muted}>Terms: standard SMC performance terms apply; payment is arranged directly with the facility unless otherwise agreed.</Text>
    </BrandedEmail>
  );
}

export function FacilityOfferEmail({ e, intro, url, expires }: { e: EventSummary; intro: string; url: string; expires: string }) {
  return (
    <BrandedEmail preview={`Please confirm: ${e.musicianName} for ${e.when}`} title="Please confirm your musician">
      <Text style={p}>{intro}</Text>
      <EventDetails e={e} showRate />
      <Text style={p}>Please confirm using the secure link below. You can accept, decline, or request a change.</Text>
      <Button href={url} style={button}>
        Confirm this booking
      </Button>
      <Text style={muted}>This personal link expires {expires} and can be used once. Please do not forward it.</Text>
    </BrandedEmail>
  );
}

// ───────────── Confirmation & reminders ─────────────

export function ConfirmedEmail({ e, intro, audience, calendarUrl }: { e: EventSummary; intro: string; audience: "musician" | "facility"; calendarUrl?: string }) {
  return (
    <BrandedEmail preview={`Confirmed: ${e.when}`} title="Your event is confirmed">
      <Text style={p}>{intro}</Text>
      <EventDetails e={e} showRate={audience === "musician"} />
      <Text style={p}>We will send a reminder before the event. If anything changes, reply to this email as soon as possible.</Text>
      {calendarUrl ? <CalendarBlock url={calendarUrl} audience={audience} /> : null}
    </BrandedEmail>
  );
}

export function ReminderEmail({ e, intro, audience, loadIn, calendarUrl }: { e: EventSummary; intro: string; audience: "musician" | "facility"; loadIn?: string | null; calendarUrl?: string }) {
  return (
    <BrandedEmail preview={`Reminder: ${e.when}`} title="Upcoming event reminder">
      <Text style={p}>{intro}</Text>
      <EventDetails e={e} />
      {audience === "musician" && loadIn ? <Text style={p}><strong>Load-in / access:</strong> {loadIn}</Text> : null}
      <Text style={p}>If you can no longer make it, reply to this email immediately so we can arrange a replacement.</Text>
      {calendarUrl ? <CalendarBlock url={calendarUrl} audience={audience} /> : null}
    </BrandedEmail>
  );
}

function CalendarBlock({ url, audience }: { url: string; audience: "musician" | "facility" }) {
  return (
    <Section style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e8c7cf" }}>
      <Text style={p}>
        <strong>Your calendar.</strong> {audience === "musician" ? "All of your Senior Music Connection performances" : "All performers scheduled at your community"}, by day, week, month or year. Add it to Google, Apple or Outlook from the page.
      </Text>
      <Button href={url} style={{ ...button, backgroundColor: "#c9a24d", color: "#2a1f1d" }}>
        Open my calendar
      </Button>
      <Text style={muted}>This is your private calendar link. Please do not forward it.</Text>
    </Section>
  );
}

// ───────────── Feedback ─────────────

export function FeedbackRequestEmail({ e, intro, url, audience }: { e: EventSummary; intro: string; url: string; audience: "musician" | "facility" }) {
  return (
    <BrandedEmail preview={`How did it go? ${e.reference}`} title={audience === "facility" ? "How was the performance?" : "How was the venue?"}>
      <Text style={p}>{intro}</Text>
      <EventDetails e={e} />
      <Button href={url} style={button}>
        Share your feedback
      </Button>
      <Text style={muted}>This link is tied to this event, so you will not need to tell us which performance you are rating.</Text>
    </BrandedEmail>
  );
}

// ───────────── Intake acknowledgements & requests for information ─────────────

export function MusicianReceivedEmail({ name, intro }: { name: string; intro: string }) {
  return (
    <BrandedEmail preview="We received your application" title={`Thank you, ${name}`}>
      <Text style={p}>{intro}</Text>
      <Text style={p}>Our team reviews every application by hand. We will be in touch once your profile has been reviewed.</Text>
    </BrandedEmail>
  );
}

export function RequestReceivedEmail({ e, intro }: { e: EventSummary; intro: string }) {
  return (
    <BrandedEmail preview={`Request received: ${e.reference}`} title="We received your event request">
      <Text style={p}>{intro}</Text>
      <EventDetails e={e} />
      <Text style={p}>A scheduler will review your request and send a proposed musician for your approval.</Text>
    </BrandedEmail>
  );
}

export function NeedsInformationEmail({ e, intro, missing }: { e: EventSummary; intro: string; missing: string[] }) {
  return (
    <BrandedEmail preview={`We need a few details: ${e.reference}`} title="We need a few more details">
      <Text style={p}>{intro}</Text>
      <EventDetails e={e} />
      <Text style={p}>To find the right musician we still need:</Text>
      {missing.map((m) => (
        <Text key={m} style={{ ...p, margin: "0 0 4px 16px" }}>
          • {m}
        </Text>
      ))}
      <Text style={p}>Simply reply to this email with the missing information and we will update your request.</Text>
    </BrandedEmail>
  );
}

export function ChangeAcknowledgedEmail({ e, intro, change }: { e: EventSummary; intro: string; change: string }) {
  return (
    <BrandedEmail preview={`Change request received: ${e.reference}`} title="We received your change request">
      <Text style={p}>{intro}</Text>
      <EventDetails e={e} />
      <Text style={p}>
        <strong>Requested change:</strong> {change}
      </Text>
      <Text style={p}>Confirmation is paused while our team reviews this. We will reissue confirmations once the details are updated.</Text>
    </BrandedEmail>
  );
}

// ───────────── Staff notifications ─────────────

export function StaffNotifyEmail({ title, lines, url }: { title: string; lines: string[]; url?: string }) {
  return (
    <BrandedEmail preview={title} title={title}>
      {lines.map((l, i) => (
        <Text key={i} style={p}>
          {l}
        </Text>
      ))}
      {url ? (
        <Button href={url} style={button}>
          Open in admin
        </Button>
      ) : null}
    </BrandedEmail>
  );
}
