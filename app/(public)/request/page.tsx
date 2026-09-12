import { prisma } from "@/lib/db";
import { EventRequestForm } from "@/components/forms/EventRequestForm";

export const metadata = { title: "Request a musician" };
export const dynamic = "force-dynamic";

export default async function RequestPage() {
  // Only names and cities are exposed publicly, to let returning facilities self-identify.
  const facilities = await prisma.facility.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" } });
  return (
    <div>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">Request a musician</h1>
      <p className="mt-3 text-lg leading-relaxed text-ink/75">Tell us about your event. We match every request by hand against our roster and send you a proposed musician to confirm.</p>
      <div className="mt-8">
        <EventRequestForm facilities={facilities} />
      </div>
    </div>
  );
}
