import Link from "next/link";
import { requireUser } from "@/lib/rbac";
import { pendingActions } from "@/lib/services/metrics";
import { signOutAction } from "./actions";
import { LogoMark } from "@/components/brand";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/requests", label: "Pipeline" },
  { href: "/admin/bookings", label: "Upcoming events" },
  { href: "/admin/musicians", label: "Musicians" },
  { href: "/admin/facilities", label: "Facilities" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/alerts", label: "Exceptions", badge: "openAlerts" as const },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/notifications", label: "Email log" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/settings", label: "Settings", adminOnly: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pending = await pendingActions();
  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-64 shrink-0 flex-col bg-ink text-ivory md:flex">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <LogoMark size={40} />
          <div>
            <div className="font-display text-base font-semibold leading-tight text-ivory">Senior Music Connection</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-300">Admin console</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 px-3 py-3 text-sm">
          {nav
            .filter((n) => !n.adminOnly || user.role === "ADMIN")
            .map((n) => (
              <Link key={n.href} href={n.href} className="flex items-center justify-between rounded-lg px-3 py-2 text-ivory/80 transition hover:bg-white/10 hover:text-ivory">
                {n.label}
                {n.badge && pending[n.badge] > 0 ? <span className="rounded-full bg-gold-500 px-2 text-xs font-bold text-ink">{pending[n.badge]}</span> : null}
              </Link>
            ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4 text-xs text-ivory/60">
          <div className="font-semibold text-ivory">{user.name}</div>
          <div>{user.role === "ADMIN" ? "Administrator" : "Staff / scheduler"}</div>
          <form action={signOutAction} className="mt-2">
            <button className="underline decoration-gold-500 underline-offset-4 hover:text-ivory">Sign out</button>
          </form>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 overflow-x-auto bg-ink px-4 py-3 text-sm text-ivory md:hidden">
          {nav.filter((n) => !n.adminOnly || user.role === "ADMIN").map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap text-ivory/80">
              {n.label}
            </Link>
          ))}
        </header>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
