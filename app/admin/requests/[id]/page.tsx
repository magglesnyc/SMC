import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { getMatchingConfig } from "@/lib/services/matching";
import { summarizeExclusions, type FilterCode } from "@/lib/matching";
import { Alert, Badge, Card, CardBody, CardHeader, DL, PageHeader, StatusBadge } from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/admin/ActionForm";
import { CandidateList } from "@/components/admin/CandidateList";
import { fmtDateTime, fmtMoney, titleCase, decimalToNumber } from "@/lib/utils";
import { cancelBookingAction, closeRequestAction, completeAction, createFacilityFromIntakeAction, holdRequestAction, manualResponseAction, noShowAction, reissueAction, releaseRequestAction, rematchAction, revalidateRequestAction, runMatchingAction, updateRequestAction, withdrawOfferAction } from "../../actions";
import { formatInTimeZone } from "date-fns-tz";

export default async function RequestDetailPage(props: PageProps<"/admin/requests/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const r = await prisma.eventRequest.findUnique({
    where: { id },
    include: {
      facility: true,
      owner: true,
      matchRuns: { orderBy: { createdAt: "desc" }, include: { matches: { include: { musician: true } }, triggeredBy: true } },
      alerts: { where: { resolvedAt: null } },
      feedback: true,
      matches: { where: { selected: true }, include: { musician: true, tokens: true } },
    },
  });
  if (!r) notFound();
  const auditLogs = await prisma.auditLog.findMany({ where: { eventRequestId: id }, orderBy: { createdAt: "desc" }, take: 40 });
  const cfg = await getMatchingConfig();
  const latestRun = r.matchRuns[0];
  const selected = r.matches.find((m) => ["APPROVED", "OFFERED", "PARTIALLY_ACCEPTED", "CONFIRMED", "COMPLETED"].includes(m.status)) ?? r.matches[0];
  const liveOffer = selected && ["APPROVED", "OFFERED", "PARTIALLY_ACCEPTED"].includes(selected.status) && !selected.exceptionStatus;
  const intake = (r.intakeFacility ?? {}) as Record<string, string>;
  const facilities = r.facilityId ? [] : await prisma.facility.findMany({ select: { id: true, name: true, city: true }, orderBy: { name: "asc" } });
  const canMatch = r.status === "READY_TO_MATCH" && !r.heldAt;
  const canApprove = r.status === "AWAITING_APPROVAL" && !r.heldAt && !liveOffer && !(selected?.status === "CONFIRMED");
  const localStart = formatInTimeZone(r.startAt, r.timezone, "yyyy-MM-dd'T'HH:mm");
  const hr = r.hardRequirements as Record<string, unknown>;

  return (
    <div>
      <PageHeader
        title={r.reference}
        description={<span className="space-x-2"><StatusBadge status={r.status} />{r.heldAt ? <Badge tone="warning">On hold: {r.holdReason}</Badge> : null}{selected ? <span>· Booking <StatusBadge status={selected.exceptionStatus ?? selected.status} /></span> : null}</span>}
        actions={<Link href="/admin/requests" className="text-sm text-stone-600 underline">← Pipeline</Link>}
      />

      {r.alerts.length ? (
        <div className="mb-4 space-y-2">
          {r.alerts.map((a) => (
            <Alert key={a.id} tone={a.severity === "CRITICAL" ? "danger" : a.severity === "WARNING" ? "warning" : "info"} title={a.title}>{a.message}</Alert>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Selected booking */}
          {selected ? (
            <Card>
              <CardHeader title={`Selected: ${selected.musician.stageName ?? `${selected.musician.firstName} ${selected.musician.lastName}`}`} description={`Rank #${selected.rank} · score ${selected.score?.toFixed(1)}${selected.isOverride ? ` · override: ${selected.overrideReason}` : ""}`} />
              <CardBody>
                <DL items={[
                  ["Musician response", <span key="m"><StatusBadge status={selected.musicianResponse ?? "PENDING"} /> {selected.musicianRespondedAt ? <span className="text-xs text-stone-500">{fmtDateTime(selected.musicianRespondedAt, r.timezone)}</span> : null}{selected.musicianResponseNote ? <div className="text-xs text-stone-600">“{selected.musicianResponseNote}”</div> : null}</span>],
                  ["Facility response", <span key="f"><StatusBadge status={selected.facilityResponse ?? "PENDING"} /> {selected.facilityRespondedAt ? <span className="text-xs text-stone-500">{fmtDateTime(selected.facilityRespondedAt, r.timezone)}</span> : null}{selected.facilityResponseNote ? <div className="text-xs text-stone-600">“{selected.facilityResponseNote}”</div> : null}</span>],
                  ["Offered", fmtDateTime(selected.offeredAt, r.timezone)],
                  ["Confirmed", fmtDateTime(selected.confirmedAt, r.timezone)],
                  ["Approved by", selected.approvedById ? `${fmtDateTime(selected.approvedAt, r.timezone)}` : "—"],
                  ["Active links", `${selected.tokens.filter((t) => !t.usedAt && !t.revokedAt && t.expiresAt > new Date()).length} live · ${selected.tokens.filter((t) => t.usedAt).length} used · ${selected.tokens.filter((t) => t.revokedAt).length} revoked`],
                ]} />
                <div className="mt-4 flex flex-wrap gap-2">
                  {liveOffer ? (
                    <>
                      <Disclosure title="Record a response received by phone/email">
                        <ActionForm action={manualResponseAction} hidden={{ matchId: selected.id, eventRequestId: r.id }} submitLabel="Record response" variant="secondary">
                          <div className="flex flex-wrap gap-2">
                            <select name="role" className="h-8 rounded-md border border-stone-300 text-sm"><option value="MUSICIAN">Musician</option><option value="FACILITY">Facility</option></select>
                            <select name="action" className="h-8 rounded-md border border-stone-300 text-sm"><option value="ACCEPT">Accepted</option><option value="DECLINE">Declined</option><option value="REQUEST_CHANGES">Requested changes</option></select>
                            <input name="note" placeholder="Note" className="h-8 flex-1 rounded-md border border-stone-300 px-2 text-sm" />
                          </div>
                        </ActionForm>
                      </Disclosure>
                      <ActionForm action={withdrawOfferAction} hidden={{ matchId: selected.id, eventRequestId: r.id }} submitLabel="Withdraw offer" variant="outline" confirm="Withdraw this offer? Both links will stop working." inline>
                        <input name="reason" placeholder="Reason" className="h-8 rounded-md border border-stone-300 px-2 text-sm" />
                      </ActionForm>
                    </>
                  ) : null}
                  {selected.exceptionStatus === "CHANGE_REQUESTED" || selected.exceptionStatus === "CONFLICT" ? (
                    <ActionForm action={reissueAction} hidden={{ matchId: selected.id, eventRequestId: r.id }} submitLabel="Reissue confirmations to both parties" inline />
                  ) : null}
                  {selected.status === "CONFIRMED" && !selected.exceptionStatus ? (
                    <>
                      <Disclosure title="Cancel booking">
                        <ActionForm action={cancelBookingAction} hidden={{ matchId: selected.id, eventRequestId: r.id }} submitLabel="Cancel booking" variant="danger" confirm="Cancel this confirmed booking?">
                          <div className="flex flex-wrap gap-2">
                            <select name="by" className="h-8 rounded-md border border-stone-300 text-sm"><option value="MUSICIAN">Cancelled by musician</option><option value="FACILITY">Cancelled by facility</option><option value="SMC">Cancelled by SMC</option></select>
                            <input name="reason" required placeholder="Reason (kept in event history)" className="h-8 flex-1 rounded-md border border-stone-300 px-2 text-sm" />
                          </div>
                        </ActionForm>
                      </Disclosure>
                      {r.startAt < new Date() ? (
                        <>
                          <ActionForm action={completeAction} hidden={{ matchId: selected.id, eventRequestId: r.id }} submitLabel="Mark completed" inline />
                          <ActionForm action={noShowAction} hidden={{ matchId: selected.id, eventRequestId: r.id }} submitLabel="Record no-show" variant="danger" confirm="Record a no-show? This affects the musician's reliability score." inline>
                            <input name="note" placeholder="Details" className="h-8 rounded-md border border-stone-300 px-2 text-sm" />
                          </ActionForm>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </CardBody>
            </Card>
          ) : null}

          {/* Candidates */}
          <Card>
            <CardHeader
              title={latestRun ? `Candidates — run ${fmtDateTime(latestRun.createdAt, r.timezone)}` : "Candidates"}
              description={latestRun ? `${summarizeExclusions(latestRun.totalMusicians, latestRun.exclusionSummary as Partial<Record<FilterCode, number>>)}${Object.keys((latestRun.relaxations as object) ?? {}).length ? ` · relaxations: ${JSON.stringify(latestRun.relaxations)}` : ""} · ${latestRun.durationMs} ms` : "The engine has not run for this request yet."}
              actions={
                <>
                  {canMatch ? <ActionForm action={runMatchingAction} hidden={{ eventRequestId: r.id }} submitLabel="Run matching" inline /> : null}
                  {latestRun && r.status !== "CLOSED" ? (
                    <Disclosure title="Request new candidate set">
                      <ActionForm action={rematchAction} hidden={{ eventRequestId: r.id }} submitLabel="Re-run matching" variant="secondary">
                        <p className="text-xs text-stone-500">Mandatory filters are never relaxed automatically. Any relaxation you choose here is logged with the run.</p>
                        <label className="flex items-center gap-2 text-sm">Expand travel radius ×<input name="radiusMultiplier" type="number" step="0.25" min="1" max="3" placeholder="1.0" className="h-8 w-20 rounded-md border border-stone-300 px-2 text-sm" /></label>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ignoreFacilityPreferences" />Ignore facility preferred-musician boosts</label>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ignoreBudget" />Ignore budget ceiling when scoring</label>
                      </ActionForm>
                    </Disclosure>
                  ) : null}
                </>
              }
            />
            <CardBody>
              {latestRun ? <CandidateList candidates={latestRun.matches} weights={cfg.weights} eventRequestId={r.id} canApprove={canApprove} /> : <p className="text-sm text-stone-500">{r.status === "NEEDS_INFORMATION" ? `Cannot match: missing ${r.missingFields.join(", ")}.` : r.heldAt ? "On hold." : "Run matching to generate a ranked candidate list."}</p>}
              {r.matchRuns.length > 1 ? <p className="mt-3 text-xs text-stone-500">{r.matchRuns.length - 1} earlier run{r.matchRuns.length > 2 ? "s" : ""} kept for audit (weights snapshot stored with each run).</p> : null}
            </CardBody>
          </Card>

          {/* History */}
          <Card>
            <CardHeader title="Event history" description="Every decision, response, status change and email for this event" />
            <CardBody className="p-0">
              <ul className="divide-y divide-stone-100 text-sm">
                {auditLogs.map((a) => (
                  <li key={a.id} className="flex gap-3 px-5 py-2">
                    <span className="w-40 shrink-0 text-xs text-stone-500">{fmtDateTime(a.createdAt, r.timezone)}</span>
                    <span className="w-40 shrink-0 font-mono text-xs text-stone-700">{a.action}</span>
                    <span className="text-stone-700">{a.actorLabel}{a.after ? <span className="ml-2 text-xs text-stone-500">{JSON.stringify(a.after).slice(0, 160)}</span> : null}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        {/* Right column: details & controls */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Event" />
            <CardBody>
              <DL items={[
                ["Facility", r.facility ? <Link key="f" href={`/admin/facilities/${r.facility.id}`} className="text-brand-700 hover:underline">{r.facility.name}</Link> : <span key="u" className="text-amber-700">Unlinked: {intake.facilityName}</span>],
                ["When", fmtDateTime(r.startAt, r.timezone)],
                ["Duration", `${r.durationMinutes} min + ${r.setupBufferMinutes} min setup`],
                ["Program", titleCase(r.serviceType)],
                ["Tags", r.programTags.join(", ") || "—"],
                ["Attendance", r.expectedAttendance ?? "—"],
                ["Budget ceiling", fmtMoney(decimalToNumber(r.budgetCeiling))],
                ["Location", [r.locationAddressLine1, r.locationCity, r.locationState].filter(Boolean).join(", ")],
                ["Coordinates", r.lat != null ? `${r.lat.toFixed(4)}, ${r.lng?.toFixed(4)}` : <span key="c" className="text-amber-700">not geocoded</span>],
                ["Hard requirements", <span key="h" className="text-xs">{Object.entries(hr).filter(([, v]) => (Array.isArray(v) ? v.length : v)).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ") || "none"}</span>],
                ["Audience", r.audienceDescription ?? "—"],
                ["Notes", r.notes ?? "—"],
                ["Owner", r.owner?.name ?? "unassigned"],
                ["Submitted", fmtDateTime(r.submittedAt, r.timezone)],
                ["Ready", fmtDateTime(r.readyAt, r.timezone)],
                ["Recommended", fmtDateTime(r.recommendedAt, r.timezone)],
              ]} />
            </CardBody>
          </Card>

          {!r.facilityId ? (
            <Card>
              <CardHeader title="Link facility" description="This request came from a facility not in the system." />
              <CardBody className="space-y-3">
                <div className="text-sm text-stone-700">{intake.facilityName} · {intake.contactName} ({intake.contactEmail}) · {intake.addressLine1}, {intake.city}</div>
                <ActionForm action={createFacilityFromIntakeAction} hidden={{ eventRequestId: r.id }} submitLabel="Create facility from these details & link" />
                <ActionForm action={updateRequestAction} hidden={{ eventRequestId: r.id }} submitLabel="Link to existing" variant="outline">
                  <select name="facilityId" className="h-8 w-full rounded-md border border-stone-300 text-sm">
                    <option value="">Choose an existing facility…</option>
                    {facilities.map((f) => <option key={f.id} value={f.id}>{f.name} · {f.city}</option>)}
                  </select>
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {r.status !== "CLOSED" || selected?.status === "CONFIRMED" ? (
            <Card>
              <CardHeader title="Edit request" description="Changes re-validate match-critical fields. After a change to a live offer, withdraw or reissue confirmations." />
              <CardBody>
                <ActionForm action={updateRequestAction} hidden={{ eventRequestId: r.id }} submitLabel="Save changes" variant="secondary">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <label className="col-span-2">Start (facility local)<input type="datetime-local" name="startAt" defaultValue={localStart} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                    <label>Duration<input type="number" name="durationMinutes" defaultValue={r.durationMinutes} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                    <label>Setup<input type="number" name="setupBufferMinutes" defaultValue={r.setupBufferMinutes} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                    <label>Budget<input type="number" name="budgetCeiling" defaultValue={decimalToNumber(r.budgetCeiling) ?? ""} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                    <label>Attendance<input type="number" name="expectedAttendance" defaultValue={r.expectedAttendance ?? ""} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                    <label>Lat<input type="number" step="any" name="lat" defaultValue={r.lat ?? ""} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                    <label>Lng<input type="number" step="any" name="lng" defaultValue={r.lng ?? ""} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                    <label className="col-span-2">Service<select name="serviceType" defaultValue={r.serviceType} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2"><option value="LIVE_ENTERTAINMENT">Live entertainment</option><option value="INTERACTIVE_SESSION">Interactive session</option><option value="MUSIC_THERAPY">Music therapy</option><option value="SPECIALTY">Specialty</option></select></label>
                    <label className="col-span-2">Program tags<input name="programTags" defaultValue={r.programTags.join(", ")} className="mt-1 h-8 w-full rounded-md border border-stone-300 px-2" /></label>
                    <label className="col-span-2">Hard requirements (JSON)<textarea name="hardRequirements" rows={3} defaultValue={JSON.stringify(r.hardRequirements)} className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1 font-mono text-xs" /></label>
                    <label className="col-span-2">Notes<textarea name="notes" rows={2} defaultValue={r.notes ?? ""} className="mt-1 w-full rounded-md border border-stone-300 px-2 py-1" /></label>
                  </div>
                </ActionForm>
                {(r.status === "NEEDS_INFORMATION" || r.status === "SUBMITTED") && r.facilityId ? <div className="mt-3"><ActionForm action={revalidateRequestAction} hidden={{ eventRequestId: r.id }} submitLabel="Re-validate readiness" variant="outline" inline /></div> : null}
              </CardBody>
            </Card>
          ) : null}

          {r.status !== "CLOSED" ? (
            <Card>
              <CardHeader title="Hold / close" />
              <CardBody className="space-y-3">
                {r.heldAt ? (
                  <ActionForm action={releaseRequestAction} hidden={{ eventRequestId: r.id }} submitLabel="Release hold" variant="outline" inline />
                ) : (
                  <ActionForm action={holdRequestAction} hidden={{ eventRequestId: r.id }} submitLabel="Hold event" variant="outline" inline>
                    <input name="reason" required placeholder="Reason for hold" className="h-8 rounded-md border border-stone-300 px-2 text-sm" />
                  </ActionForm>
                )}
                <ActionForm action={closeRequestAction} hidden={{ eventRequestId: r.id }} submitLabel="Close request" variant="danger" confirm="Close this request? Any live offer must be withdrawn first." inline>
                  <input name="reason" required placeholder="Reason" className="h-8 rounded-md border border-stone-300 px-2 text-sm" />
                </ActionForm>
              </CardBody>
            </Card>
          ) : null}

          {r.feedback.length ? (
            <Card>
              <CardHeader title="Feedback" />
              <CardBody>
                <ul className="space-y-2 text-sm">
                  {r.feedback.map((f) => (
                    <li key={f.id} className="flex items-center justify-between"><span>{titleCase(f.kind)} <StatusBadge status={f.status} /></span><span className="text-stone-700">{f.rating ? `${f.rating}/5` : "—"}</span></li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
          {user.role === "ADMIN" && r.facility?.privateNotes ? <Card><CardHeader title="Facility private notes" /><CardBody className="text-sm text-stone-700">{r.facility.privateNotes}</CardBody></Card> : null}
        </div>
      </div>
    </div>
  );
}
