import Link from "next/link";
import { MusicMotif, NoteDivider, Wordmark } from "@/components/brand";

const steps = [
  { n: "1", title: "Tell us about your event", text: "Date, room, audience, budget. Five minutes on a simple form." },
  { n: "2", title: "We match by hand", text: "Our rules-based engine shortlists qualified, available musicians. A person approves every match." },
  { n: "3", title: "Everyone confirms", text: "Musician and community confirm with one secure click. Reminders follow automatically." },
  { n: "4", title: "The music happens", text: "Then we ask both sides how it went, so the next match is even better." },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Wordmark />
        <nav className="hidden items-center gap-6 text-sm font-semibold text-ink/80 sm:flex">
          <Link href="/request" className="hover:text-brand-700">Request a musician</Link>
          <Link href="/apply" className="hover:text-brand-700">Apply to perform</Link>
          <Link href="/admin" className="rounded-full border border-brand-200 px-4 py-1.5 text-brand-700 hover:bg-brand-50">Staff sign in</Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="relative mx-auto max-w-6xl px-6 pb-16 pt-10 sm:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-gold-700">Senior communities across the United States</p>
              <h1 className="font-display mt-4 text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
                The songs they know,
                <br />
                <span className="italic text-brand-700">played for them</span>, live.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink/75">
                Senior Music Connection brings professional musicians and entertainers into senior living communities, care homes, and day programs. Every booking is matched to your residents, your room, and your budget, and confirmed by a real person.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/request" className="inline-flex items-center gap-2 rounded-full bg-brand-700 px-6 py-3 text-base font-semibold text-ivory shadow-warm transition hover:bg-brand-800">
                  Request a musician <span aria-hidden>→</span>
                </Link>
                <Link href="/apply" className="inline-flex items-center gap-2 rounded-full border border-gold-500 bg-paper px-6 py-3 text-base font-semibold text-brand-800 transition hover:bg-gold-100">
                  I&apos;m a musician
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="surface rounded-3xl p-6">
                <MusicMotif />
                <p className="font-display mt-2 text-center text-lg italic text-brand-800">&ldquo;Where words fail, music speaks.&rdquo;</p>
                <p className="mt-1 text-center text-xs uppercase tracking-[0.2em] text-gold-700">Hans Christian Andersen</p>
              </div>
            </div>
          </div>
        </section>

        <section className="staff-lines border-y border-gold-300/40 bg-paper/70">
          <div className="mx-auto max-w-6xl px-6 py-14">
            <h2 className="font-display text-center text-3xl font-semibold text-ink">How a booking works</h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s) => (
                <div key={s.n} className="surface rounded-2xl p-6">
                  <div className="font-display flex h-11 w-11 items-center justify-center rounded-full bg-brand-700 text-lg font-semibold text-gold-300">{s.n}</div>
                  <h3 className="font-display mt-4 text-xl font-semibold text-ink">{s.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink/70">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid gap-8 lg:grid-cols-2">
            <Link href="/request" className="surface group rounded-3xl p-8 transition hover:-translate-y-0.5 hover:border-gold-500">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold-700">For communities</p>
              <h2 className="font-display mt-3 text-3xl font-semibold text-ink group-hover:text-brand-700">Request a musician</h2>
              <p className="mt-3 leading-relaxed text-ink/75">Sing-alongs, big-band afternoons, gentle bedside music, holiday programs. Tell us what your residents love and we will propose the right performer within your budget.</p>
              <span className="mt-5 inline-block font-semibold text-brand-700">Start a request →</span>
            </Link>
            <Link href="/apply" className="surface group rounded-3xl p-8 transition hover:-translate-y-0.5 hover:border-gold-500">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-gold-700">For musicians</p>
              <h2 className="font-display mt-3 text-3xl font-semibold text-ink group-hover:text-brand-700">Apply to perform</h2>
              <p className="mt-3 leading-relaxed text-ink/75">Join a roster of professionals who bring joy to appreciative audiences. Set your rates, travel radius, and availability, and receive offers by email.</p>
              <span className="mt-5 inline-block font-semibold text-brand-700">Join the roster →</span>
            </Link>
          </div>
          <NoteDivider className="mt-16" />
          <p className="text-center text-sm text-ink/60">
            SMC staff: <Link href="/admin" className="font-semibold text-brand-700 underline decoration-gold-500 underline-offset-4">sign in to the admin console</Link>.{process.env.DEMO_MODE === "true" ? <> Exploring? <Link href="/demo" className="font-semibold text-brand-700 underline decoration-gold-500 underline-offset-4">Open the demo hub</Link>.</> : null}
          </p>
        </section>
      </main>

      <footer className="border-t border-gold-300/40 bg-paper/60 py-8 text-center text-sm text-ink/60">
        <div className="mx-auto max-w-6xl px-6">Senior Music Connection · We only collect what we need to book and deliver your event.</div>
      </footer>
    </div>
  );
}
