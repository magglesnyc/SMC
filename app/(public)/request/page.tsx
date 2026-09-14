import { prisma } from "@/lib/db";
import { EventRequestForm } from "@/components/forms/EventRequestForm";

export const metadata = { title: "Request a musician" };
export const dynamic = "force-dynamic";

export default async function RequestPage(props: PageProps<"/request">) {
  const sp = await props.searchParams;
  // Only names and cities are exposed publicly, to let returning facilities self-identify.
  const facilities = await prisma.facility.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" } });
  // The community portal links here with its own facility pre-selected and, optionally, a performer it wants.
  const defaultFacilityId = typeof sp.facility === "string" ? sp.facility : undefined;
  const musician = typeof sp.musician === "string" ? sp.musician.slice(0, 120) : undefined;
  return (
    <div>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">Request a musician</h1>
      <p className="mt-3 text-lg leading-relaxed text-ink/75">Tell us about your event. We match every request by hand against our roster and send you a proposed musician to confirm.</p>
      {musician ? <p className="mt-3 rounded-xl bg-gold-100/60 px-4 py-2 text-sm text-ink/80">You asked for <span className="font-semibold">{musician}</span>. We will offer them first if they are available and a good fit, and propose alternatives otherwise.</p> : null}
      <div className="mt-8">
        <EventRequestForm facilities={facilities} defaultFacilityId={defaultFacilityId} defaultNotes={musician ? `Requested performer: ${musician}` : undefined} />
      </div>
    </div>
  );
}
