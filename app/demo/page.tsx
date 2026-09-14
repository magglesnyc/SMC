import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { LogoMark, NoteDivider, Wordmark } from "@/components/brand";
import { fmtDateTime } from "@/lib/utils";
import { DEMO_ACCOUNTS, DEMO_PORTAL_ACCOUNTS } from "./accounts";
import { demoSignIn } from "./actions";
import { calendarUrlFor } from "@/lib/calendar";

export const metadata = { title: "Demo hub" };
export const dynamic = "force-dynamic";

const LINK_RE = /https?:\/\/\S+\/(respond\/[A-Za-z0-9_-]+|feedback\/(?:facility|musician)\?ref=[A-Za-z0-9_-]+)/;

async function inbox(kind: "musician" | "facility") {
  // Seeded musicians use @example.com, facility contacts @example.org.
  const rows = await prisma.notificationLog.findMany({
    where: { recipient: { endsWith: kind === "musician" ? "@example.com" : "@example.org" }, status: "SENT" },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { match: { include: { tokens: { where: { usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }, eventRequest: { select: { reference: true } } } } },
  });
  return rows.map((r) => {
    const text = (r.payload as { text?: string } | null)?.text ?? "";
    const link = text.match(LINK_RE)?.[0] ?? null;
    const live = Boolean(link) && (r.match?.tokens.length ?? 0) > 0;
    return { id: r.id, to: r.recipient, subject: r.subject, at: r.createdAt, link, live, reference: r.match?.eventRequest.reference, template: r.templateKey };
  });
}

export default async function DemoPage(props: PageProps<"/demo">) {
  if (process.env.DEMO_MODE !== "true") notFound();
  const sp = await props.searchParams;
  const [busyMusician, busyFacility] = await Promise.all([
    prisma.musician.findFirst({ where: { matches: { some: { selected: true, status: { in: ["CONFIRMED", "OFFERED", "PARTIALLY_ACCEPTED"] }, eventRequest: { startAt: { gte: new Date() } } } } }, orderBy: { completedEvents: "desc" }, select: { id: true, firstName: true, lastName: true, stageName: true } }),
    prisma.facility.findFirst({ where: { matches: { some: { selected: true, status: { in: ["CONFIRMED", "OFFERED", "PARTIALLY_ACCEPTED"] }, eventRequest: { startAt: { gte: new Date() } } } } }, orderBy: { eventRequests: { _count: "desc" } }, select: { id: true, name: true } }),
  ]);
  const [musicianCal, facilityCal] = await Promise.all([busyMusician ? calendarUrlFor("MUSICIAN", busyMusician.id) : null, busyFacility ? calendarUrlFor("FACILITY", busyFacility.id) : null]);
  const [musicianInbox, facilityInbox, counts, portalUsers] = await Promise.all([
    inbox("musician"),
    inbox("facility"),
    Promise.all([prisma.musician.count(), prisma.facility.count(), prisma.eventRequest.count({ where: { status: { not: "CLOSED" } } })]),
    prisma.user.findMany({ where: { role: { in: ["MUSICIAN", "FACILITY"] } }, select: { email: true, name: true, musician: { select: { firstName: true, lastName: true, stageName: true, city: true, state: true } }, facility: { select: { name: true, facilityType: true, city: true, state: true } } } }),
  ]);
  const portalFor = (email: string) => portalUsers.find((p) => p.email === email);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gold-300/40 bg-paper/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Wordmark compact />
          <span className="rounded-full bg-gold-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-gold-700">Demo hub</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">Walk through every role</p>
        <h1 className="font-display mt-3 text-5xl font-semibold tracking-tight text-ink">See it the way each person will</h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink/75">
          Staff sign in to the console. Community contacts and musicians have their own portals, and also receive branded emails with secure, single-use links so nobody has to sign in to confirm or rate. The inboxes below show exactly what lands in their mail, with working links.
        </p>
        <p className="mt-2 text-sm text-ink/60">Demo data: {counts[0]} musicians · {counts[1]} communities across five metros · {counts[2]} open requests. Reset any time with <code>npm run db:seed</code>.</p>
        {sp.error ? <p className="mt-4 rounded-md bg-red-50 px-4 py-2 text-sm text-red-800">Sign-in failed. Run the seed to create the demo accounts.</p> : null}

        <h2 className="font-display mt-12 text-3xl font-semibold text-ink">Staff roles</h2>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {DEMO_ACCOUNTS.map((a) => (
            <div key={a.key} className="surface flex flex-col rounded-3xl p-7">
              <div className="flex items-center gap-3">
                <LogoMark size={40} />
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-gold-700">{a.role}</div>
                  <div className="font-display text-xl font-semibold text-ink">{a.name}</div>
                </div>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-ink/75">{a.blurb}</p>
              <ul className="mt-4 space-y-1 text-sm text-ink/70">
                {a.tour.map((t) => (
                  <li key={t}>♪ {t}</li>
                ))}
              </ul>
              <div className="mt-5 rounded-xl bg-gold-100/50 px-3 py-2 font-mono text-xs text-ink/80">
                {a.email}
                <br />
                {a.password}
              </div>
              <form action={demoSignIn} className="mt-4">
                <input type="hidden" name="role" value={a.key} />
                <button className="w-full rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-ivory shadow-warm hover:bg-brand-800">Sign in as {a.name.split(" ")[0]}</button>
              </form>
            </div>
          ))}
        </div>

        <NoteDivider className="mt-14" />

        <h2 className="font-display text-3xl font-semibold text-ink">Community and musician portals</h2>
        <p className="mt-2 max-w-2xl text-ink/75">Each community contact and each roster musician can sign in to their own page: what is booked, what needs a reply, ratings in both directions. The emailed links below keep working for people who never sign in.</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {DEMO_PORTAL_ACCOUNTS.map((a) => {
            const p = portalFor(a.email);
            const who = p?.facility ? `${p.facility.name} · ${p.facility.facilityType.replace(/-/g, " ")}, ${p.facility.city}, ${p.facility.state}` : p?.musician ? `${p.musician.stageName ?? `${p.musician.firstName} ${p.musician.lastName}`} · ${p.musician.city}, ${p.musician.state}` : "Run the seed to create this account";
            return (
              <div key={a.key} className="surface flex flex-col rounded-3xl p-7">
                <div className="flex items-center gap-3">
                  <LogoMark size={40} />
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-gold-700">{a.role}</div>
                    <div className="font-display text-xl font-semibold text-ink">{p?.name ?? "Demo account"}</div>
                    <div className="text-xs text-ink/60">{who}</div>
                  </div>
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-ink/75">{a.blurb}</p>
                <ul className="mt-4 space-y-1 text-sm text-ink/70">
                  {a.tour.map((t) => (
                    <li key={t}>♪ {t}</li>
                  ))}
                </ul>
                <div className="mt-5 rounded-xl bg-gold-100/50 px-3 py-2 font-mono text-xs text-ink/80">
                  {a.email}
                  <br />
                  {a.password}
                </div>
                <form action={demoSignIn} className="mt-4">
                  <input type="hidden" name="role" value={a.key} />
                  <button className="w-full rounded-full bg-brand-700 px-5 py-2.5 text-sm font-semibold text-ivory shadow-warm hover:bg-brand-800">Sign in as {a.key === "facility" ? "the community" : "the musician"}</button>
                </form>
              </div>
            );
          })}
        </div>

        <h2 className="font-display mt-12 text-3xl font-semibold text-ink">Emailed links (no sign-in needed)</h2>
        <p className="mt-2 max-w-2xl text-ink/75">Every email carries a personal link that works once, expires, and dies if the offer changes. Click a live link to respond as that person, then sign in as the scheduler to watch the booking update.</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Inbox title="A musician's inbox" hint="What a performer on the roster receives" items={musicianInbox} />
          <Inbox title="A community contact's inbox" hint="What an activity director receives" items={facilityInbox} />
        </div>

        <h2 className="font-display mt-12 text-3xl font-semibold text-ink">Personal calendars</h2>
        <p className="mt-2 max-w-2xl text-ink/75">Every musician and every community gets a private calendar link in their confirmation emails: day, week, month and year views, plus an iCal feed they can add to Google, Apple or Outlook. Staff see everyone on the console calendar.</p>
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {busyMusician && musicianCal ? (
            <a href={musicianCal} className="surface rounded-3xl p-6 transition hover:border-gold-500">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-gold-700">A musician&apos;s calendar</div>
              <div className="font-display mt-2 text-xl font-semibold text-ink">{busyMusician.stageName ?? `${busyMusician.firstName} ${busyMusician.lastName}`}</div>
              <p className="mt-2 text-sm text-ink/70">All of their performances, in their own time zone.</p>
              <span className="mt-3 inline-block font-semibold text-brand-700">Open calendar →</span>
            </a>
          ) : null}
          {busyFacility && facilityCal ? (
            <a href={facilityCal} className="surface rounded-3xl p-6 transition hover:border-gold-500">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-gold-700">A community&apos;s calendar</div>
              <div className="font-display mt-2 text-xl font-semibold text-ink">{busyFacility.name}</div>
              <p className="mt-2 text-sm text-ink/70">Every performer scheduled at the community.</p>
              <span className="mt-3 inline-block font-semibold text-brand-700">Open calendar →</span>
            </a>
          ) : null}
          <Link href="/admin/calendar" className="surface rounded-3xl p-6 transition hover:border-gold-500">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-gold-700">The staff calendar</div>
            <div className="font-display mt-2 text-xl font-semibold text-ink">Everyone, everywhere</div>
            <p className="mt-2 text-sm text-ink/70">Filter by musician or community, switch time zones, click through to any booking. Sign in as a staff role first.</p>
            <span className="mt-3 inline-block font-semibold text-brand-700">Open staff calendar →</span>
          </Link>
        </div>

        <div className="surface mt-10 grid gap-6 rounded-3xl p-7 sm:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-gold-700">Start as a musician</div>
            <p className="mt-2 text-sm text-ink/75">Fill in the public application. A confirmation email appears in the inbox above; the application shows up in the console for the administrator to approve.</p>
            <Link href="/apply" className="mt-3 inline-block font-semibold text-brand-700 underline decoration-gold-500 underline-offset-4">Open the application form →</Link>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-gold-700">Start as a community</div>
            <p className="mt-2 text-sm text-ink/75">Request an event. Pick an existing community to see it matched automatically, or a new one to see the review queue.</p>
            <Link href="/request" className="mt-3 inline-block font-semibold text-brand-700 underline decoration-gold-500 underline-offset-4">Open the request form →</Link>
          </div>
        </div>
      </main>
      <footer className="border-t border-gold-300/40 bg-paper/60 py-6 text-center text-xs text-ink/60">Demo hub is enabled by DEMO_MODE and must be off in production.</footer>
    </div>
  );
}

function Inbox({ title, hint, items }: { title: string; hint: string; items: Awaited<ReturnType<typeof inbox>> }) {
  return (
    <div className="surface rounded-3xl p-6">
      <h3 className="font-display text-2xl font-semibold text-ink">{title}</h3>
      <p className="text-sm text-ink/60">{hint}</p>
      <ul className="mt-4 divide-y divide-gold-300/30">
        {items.length === 0 ? <li className="py-4 text-sm text-ink/60">Inbox empty — run the seed.</li> : null}
        {items.map((m) => (
          <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0">
              <div className="truncate font-semibold text-ink">{m.subject}</div>
              <div className="text-xs text-ink/60">
                to {m.to} · {fmtDateTime(m.at)}
                {m.reference ? ` · ${m.reference}` : ""}
              </div>
            </div>
            {m.link ? (
              m.live ? (
                <a href={m.link} className="shrink-0 rounded-full bg-brand-700 px-4 py-1.5 text-xs font-semibold text-ivory hover:bg-brand-800">Open link</a>
              ) : (
                <a href={m.link} className="shrink-0 rounded-full border border-stone-300 px-4 py-1.5 text-xs font-semibold text-stone-500" title="Used, expired or withdrawn — shows the friendly inactive page">Link used</a>
              )
            ) : (
              <span className="shrink-0 text-xs text-ink/50">informational</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
