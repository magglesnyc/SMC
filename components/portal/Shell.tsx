import Link from "next/link";
import { LogoMark } from "@/components/brand";
import { portalSignOut } from "@/app/portal/actions";

export interface PortalNavItem {
  href: string;
  label: string;
  badge?: number;
}

/** Warm, simple frame for the self-service portals: big type, few choices, one sign-out. */
export function PortalShell({ kicker, title, subtitle, nav, userName, children }: { kicker: string; title: string; subtitle?: string; nav: PortalNavItem[]; userName: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-gold-300/40 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href={nav[0]?.href ?? "/"} className="flex items-center gap-3">
            <LogoMark size={40} />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.25em] text-gold-700">{kicker}</div>
              <div className="font-display text-lg font-semibold leading-tight text-ink">{title}</div>
            </div>
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm font-semibold">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-ink/75 transition hover:bg-gold-100 hover:text-brand-800">
                {n.label}
                {n.badge ? <span className="rounded-full bg-brand-700 px-1.5 text-[11px] font-bold text-ivory">{n.badge}</span> : null}
              </Link>
            ))}
            <form action={portalSignOut}>
              <button className="ml-2 rounded-full border border-gold-500/60 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-gold-100" title={userName}>
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      {subtitle ? (
        <div className="staff-lines border-b border-gold-300/40 bg-paper/60">
          <div className="mx-auto max-w-6xl px-6 py-3 text-sm text-ink/70">{subtitle}</div>
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
      <footer className="border-t border-gold-300/40 bg-paper/60 py-6 text-center text-xs text-ink/60">Senior Music Connection · Questions? Reply to any email from us and a real person will answer.</footer>
    </div>
  );
}

export function Section({ title, description, actions, children }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-1 text-sm text-ink/65">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function StarRow({ value, size = "sm" }: { value: number | null | undefined; size?: "sm" | "lg" }) {
  if (!value) return <span className="text-xs text-stone-400">Not rated</span>;
  return (
    <span className={size === "lg" ? "text-xl text-gold-700" : "text-sm text-gold-700"} aria-label={`${value} out of 5`}>
      {"★".repeat(Math.round(value))}
      <span className="text-stone-300">{"★".repeat(5 - Math.round(value))}</span>
    </span>
  );
}
