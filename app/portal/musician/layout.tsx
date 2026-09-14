import { prisma } from "@/lib/db";
import { requireMusicianUser } from "@/lib/rbac";
import { PortalShell } from "@/components/portal/Shell";
import { musicianName } from "@/lib/services/portal";

export const dynamic = "force-dynamic";

export default async function MusicianPortalLayout({ children }: { children: React.ReactNode }) {
  const u = await requireMusicianUser();
  const [musician, openOffers, finished] = await Promise.all([
    prisma.musician.findUniqueOrThrow({ where: { id: u.musicianId }, select: { firstName: true, lastName: true, stageName: true, city: true, state: true, status: true } }),
    prisma.match.count({ where: { musicianId: u.musicianId, selected: true, exceptionStatus: null, status: { in: ["OFFERED", "PARTIALLY_ACCEPTED"] }, musicianResponse: null } }),
    prisma.match.findMany({ where: { musicianId: u.musicianId, selected: true, OR: [{ status: "COMPLETED" }, { exceptionStatus: "NO_SHOW" }] }, select: { feedback: { select: { kind: true, submittedAt: true } } } }),
  ]);
  const toRate = finished.filter((m) => !m.feedback.some((f) => f.kind === "MUSICIAN" && f.submittedAt)).length;
  return (
    <PortalShell
      kicker="Musician portal"
      title={musicianName(musician)}
      subtitle={`${musician.city}, ${musician.state} · roster status: ${musician.status.toLowerCase()} · signed in as ${u.name}`}
      userName={u.name}
      nav={[
        { href: "/portal/musician", label: "Home", badge: openOffers + toRate },
        { href: "/portal/musician/calendar", label: "Calendar" },
        { href: "/portal/musician/venues", label: "Where you play" },
        { href: "/portal/musician/reviews", label: "Ratings" },
        { href: "/portal/musician/profile", label: "Profile" },
      ]}
    >
      {children}
    </PortalShell>
  );
}
