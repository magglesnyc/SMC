import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { Card, Empty, LinkButton, PageHeader, StatusBadge, Table, TD, TH, THead, TR, Badge } from "@/components/ui";
import { fmtMoney, decimalToNumber, titleCase } from "@/lib/utils";
import type { MusicianStatus } from "@/generated/prisma/enums";

const STATUSES: MusicianStatus[] = ["SUBMITTED", "REVIEW", "APPROVED", "ACTIVE", "INACTIVE", "SUSPENDED"];

export default async function MusiciansPage(props: PageProps<"/admin/musicians">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const status = typeof sp.status === "string" && STATUSES.includes(sp.status as MusicianStatus) ? (sp.status as MusicianStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q : "";
  const musicians = await prisma.musician.findMany({
    where: { ...(status ? { status } : {}), ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { stageName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: [{ status: "asc" }, { lastName: "asc" }],
    take: 300,
  });
  return (
    <div>
      <PageHeader title="Musicians" description="Roster and application queue" actions={user.role === "ADMIN" ? <LinkButton href="/api/admin/export/musicians">Export CSV</LinkButton> : null} />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/admin/musicians" className={`rounded-full px-3 py-1 ${!status ? "bg-stone-800 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200"}`}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/musicians?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-stone-800 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200"}`}>{titleCase(s)}</Link>)}
        <form className="ml-auto"><input name="q" defaultValue={q} placeholder="Search" className="h-8 rounded-md border border-stone-300 px-2 text-sm" /></form>
      </div>
      <Card>
        {musicians.length === 0 ? <div className="p-5"><Empty>No musicians match.</Empty></div> : (
          <Table>
            <THead><tr><TH>Name</TH><TH>Status</TH><TH>Services</TH><TH>Home base</TH><TH>Rate</TH><TH>Radius</TH><TH>Credentials</TH><TH>History</TH></tr></THead>
            <tbody>
              {musicians.map((m) => (
                <TR key={m.id}>
                  <TD><Link href={`/admin/musicians/${m.id}`} className="font-medium text-brand-700 hover:underline">{m.stageName ?? `${m.firstName} ${m.lastName}`}</Link>{m.stageName ? <div className="text-xs text-stone-500">{m.firstName} {m.lastName}</div> : null}{m.possibleDuplicate ? <Badge tone="warning" className="ml-1">dup?</Badge> : null}</TD>
                  <TD><StatusBadge status={m.status} />{m.adminRestriction ? <div className="text-xs text-red-700">restricted</div> : null}</TD>
                  <TD className="text-xs">{m.entertainmentTypes.map((t) => titleCase(t)).join(", ")}</TD>
                  <TD>{m.city}{m.lat == null ? <span className="ml-1 text-xs text-amber-700">(no geo)</span> : null}</TD>
                  <TD>{fmtMoney(decimalToNumber(m.standardRate))}{m.rateStructure === "PER_HOUR" ? "/hr" : ""}</TD>
                  <TD>{m.maxTravelMiles} mi</TD>
                  <TD className="text-xs"><StatusBadge status={m.backgroundCheckStatus} /> {m.insuranceExpiresAt ? (m.insuranceExpiresAt < new Date() ? <Badge tone="danger">ins. expired</Badge> : <Badge tone="success">insured</Badge>) : <Badge tone="warning">no ins.</Badge>}</TD>
                  <TD className="text-xs">{m.completedEvents} done · {m.avgRating ? `${m.avgRating.toFixed(1)}★` : "unrated"}{m.noShows ? ` · ${m.noShows} no-show` : ""}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
