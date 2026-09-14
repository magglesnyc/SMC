import { prisma } from "@/lib/db";
import { requireFacilityUser } from "@/lib/rbac";
import { PortalShell } from "@/components/portal/Shell";

export const dynamic = "force-dynamic";

export default async function FacilityPortalLayout({ children }: { children: React.ReactNode }) {
  const u = await requireFacilityUser();
  const [facility, finished] = await Promise.all([
    prisma.facility.findUniqueOrThrow({ where: { id: u.facilityId }, select: { name: true, city: true, state: true, facilityType: true } }),
    prisma.match.findMany({ where: { facilityId: u.facilityId, selected: true, OR: [{ status: "COMPLETED" }, { exceptionStatus: "NO_SHOW" }] }, select: { feedback: { select: { kind: true, submittedAt: true } } } }),
  ]);
  const toRate = finished.filter((m) => !m.feedback.some((f) => f.kind === "CLIENT" && f.submittedAt)).length;
  return (
    <PortalShell
      kicker="Community portal"
      title={facility.name}
      subtitle={`${facility.facilityType.replace(/-/g, " ")} · ${facility.city}, ${facility.state} · signed in as ${u.name}`}
      userName={u.name}
      nav={[
        { href: "/portal/facility", label: "Home", badge: toRate },
        { href: "/portal/facility/calendar", label: "Calendar" },
        { href: "/portal/facility/performers", label: "Find performers" },
        { href: `/request?facility=${encodeURIComponent(u.facilityId)}`, label: "Request a musician" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
