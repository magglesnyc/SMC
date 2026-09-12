import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Card, Empty, LinkButton, PageHeader, StatusBadge, Table, TD, TH, THead, TR, Badge } from "@/components/ui";
import { fmtMoney, decimalToNumber, titleCase } from "@/lib/utils";

export default async function FacilitiesPage(props: PageProps<"/admin/facilities">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const facilities = await prisma.facility.findMany({
    where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] } : undefined,
    include: { _count: { select: { eventRequests: true, matches: { where: { status: "COMPLETED" } } } } },
    orderBy: { name: "asc" },
  });
  return (
    <div>
      <PageHeader title="Facilities" description="Client and venue records" actions={user.role === "ADMIN" ? <LinkButton href="/api/admin/export/facilities">Export CSV</LinkButton> : null} />
      <form className="mb-4"><input name="q" defaultValue={q} placeholder="Search name or city" className="h-8 rounded-md border border-stone-300 px-2 text-sm" /></form>
      <Card>
        {facilities.length === 0 ? <div className="p-5"><Empty>No facilities.</Empty></div> : (
          <Table>
            <THead><tr><TH>Name</TH><TH>Type</TH><TH>City</TH><TH>Contact</TH><TH>Budget</TH><TH className="text-right">Requests</TH><TH className="text-right">Completed</TH></tr></THead>
            <tbody>
              {facilities.map((f) => (
                <TR key={f.id}>
                  <TD><Link href={`/admin/facilities/${f.id}`} className="font-medium text-brand-700 hover:underline">{f.name}</Link> <StatusBadge status={f.status} />{f.possibleDuplicate ? <Badge tone="warning" className="ml-1">dup?</Badge> : null}{f.lat == null ? <Badge tone="warning" className="ml-1">no geo</Badge> : null}</TD>
                  <TD>{titleCase(f.facilityType)}</TD>
                  <TD>{f.city}</TD>
                  <TD className="text-xs">{f.primaryContactName}<br />{f.primaryContactEmail}</TD>
                  <TD>{fmtMoney(decimalToNumber(f.budgetMin))}–{fmtMoney(decimalToNumber(f.budgetMax))}</TD>
                  <TD className="text-right">{f._count.eventRequests}</TD>
                  <TD className="text-right">{f._count.matches}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
