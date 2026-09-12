# Senior Music Connection — Administrator Guide

The system **recommends, a human approves**. Nothing is ever booked automatically. Every recommendation is reviewed by SMC staff before any offer goes to a musician or facility.

## Roles

| Role | Can |
| --- | --- |
| Administrator | Everything: approve/suspend musicians, approve matches, override, hold, re-match, edit scoring weights and thresholds, edit email templates, set restrictions, see private notes, export CSV. |
| Staff / Scheduler | Work the pipeline: review requests, run matching, approve matches (with override reasons), send/withdraw offers, record responses, resolve exceptions, close feedback. No access to Settings, private notes or exports. |

Demo logins (after `npm run db:seed`, with `DEMO_MODE=true` the `/demo` hub signs you in with one click): administrator `admin@smc.test` / `demo-admin`, scheduler `scheduler@smc.test` / `demo-scheduler`, staff `staff@smc.test` / `demo-staff`. Musicians and community contacts never sign in; the demo hub shows their inboxes with live links.

## The ten-stage workflow, and where you do it

| # | Stage | Where |
| --- | --- | --- |
| 1 | Musician applies (public form `/apply`) | Musicians → status **Submitted**. Duplicate hits are flagged. |
| 2 | Qualify the musician | Musicians → open → review services, credentials, geography, rate → **Start review → Approve (admin) → Activate**. Only Approved/Active musicians are ever matched. |
| 3 | Facility requests an event (public form `/request`) | Pipeline → **Submitted**. If the facility could not be linked, an *Unmatched facility* exception appears and the request page shows **Link facility**. |
| 4 | Request becomes ready | Automatic. All match-critical fields present → **Ready to Match**. Missing fields → **Needs Information** and the facility is emailed for the missing items. Use *Edit request* to fill gaps, then *Re-validate readiness*. |
| 5 | Candidates generated | Automatic when a request becomes Ready (via Inngest, or inline). You can also click **Run matching** on the request page. |
| 6 | You approve a match | Request page → candidate list. **Approve recommendation** for the #1 candidate, or expand any other eligible candidate and give an **override reason** (required, logged, reported). **Request new candidate set** re-runs, optionally with an expanded radius or relaxed preferences — those relaxations are your explicit choice and are recorded with the run. **Hold event** pauses everything. |
| 7 | Both parties respond | Approval sends each party a personal, single-use, expiring link. Responses appear on the request page. You can also **Record a response received by phone/email**. |
| 8 | Event confirmed | Only when both have accepted. Reminders and feedback are scheduled automatically. |
| 9 | Event occurs | Upcoming events shows the calendar. Reminders go out 72h and 24h before. |
| 10 | Feedback | Both forms are sent ~2h after the event ends, with the event pre-attached. Ratings ≤ 3 or any flagged issue raise a **Low rating / Feedback issue** exception and email the program manager. |

## Reading a candidate card

* **Score (0–100)** = Σ (sub-score × weight). Hover a criterion to see the arithmetic.
* **Why** lists the plain-English reasons per criterion (“Available with 60+ min buffer”, “12 miles / 22 min”, “Rate $25 under budget”, “4.8 avg rating over 22 reviews”).
* **Warnings** never exclude anyone; they are things to check (“Rate is 8% over budget”, “Travel time 52 minutes”, “Insurance expires 12 days after the event”).
* **Excluded** (collapsed) lists everyone who failed a mandatory filter and which one. The header summarises: “12 of 40 excluded: 7 unavailable, 3 outside travel radius, 2 missing credential”.

### Mandatory filters (never relaxed automatically)

1. Status Approved/Active  2. Available for the date/time including travel and setup  3. Offers the requested service/qualification  4. Within travel radius  5. Required credentials/insurance/background check/program requirements  6. No conflicting booking or administrative restriction (facility blocks count here).

### Scoring criteria and default weights

Availability 25 · Service fit 20 · Distance 15 · Audience/facility fit 15 · Budget 10 · Quality & reliability 10 · Relationship & rotation 5. Change them in **Settings**; they must sum to 100. Every run stores the weights it used.

## Exceptions (the queue at Exceptions)

| Situation | What happens | What you do |
| --- | --- | --- |
| No eligible musician | Critical alert with the exclusion breakdown | *Request new candidate set* with an expanded radius, or fix data (geocode, credentials), or hold. |
| Musician declines | Match marked Declined, deselected; facility link revoked; alert | Approve the next-ranked candidate or re-match. |
| Facility declines | Same, mirrored | Choose another candidate or close the request. |
| Change requested | Confirmation paused, other link revoked, requester emailed an acknowledgement | *Edit request*, then **Reissue confirmations** — both parties respond again to fresh links. |
| Conflicting responses (one accepts, one declines/changes) | Confirmed is blocked; critical alert | Resolve by phone, then reissue or pick another candidate. |
| Late cancellation | Booking marked Cancelled; if the event is still ahead and the musician cancelled, the request reopens as Ready to Match for a replacement; musician reliability updated | Run matching again and approve a replacement. |
| No-show | Recorded against the musician; critical alert | Follow up with the facility; consider a restriction. |
| Offer unanswered 24h | Staff nudge email; expired links raise an alert | Reissue confirmations or choose another candidate. |
| Automation failure | Alert with the error | Fix the cause, then re-run (Upcoming events → *Run reminders & feedback jobs now*). |

## Secure links

Links are random tokens stored (hashed) in the database, tied to one event, one recipient role and one purpose, expiring after 72 hours (offers) or 30 days (feedback). They die after use, on expiry, or when an offer is withdrawn/updated. A reused link shows a friendly “no longer active” page. Redemption is a single atomic database update, so a double click or duplicate request can never record two responses.

## Background jobs

Reminders, completion, feedback sends and nudges run every 10 minutes through Inngest (`/api/inngest`), or on demand: the **Run reminders & feedback jobs now** button, `npm run jobs:run`, or `POST /api/jobs/run` with `Authorization: Bearer $JOBS_SECRET` from an external cron. Every send has an idempotency key so re-running never duplicates emails.

## Email

Without `RESEND_API_KEY` the app logs every email to the **Email log** page with a preview (including the secure link) instead of sending. Set the key and `EMAIL_FROM` to go live. Subject lines and opening paragraphs are editable in Settings; the branded layout and event details are rendered by code.

## Data & privacy

Store only what is needed to book and deliver an event. Audience tags are programming considerations (group size, mobility support, memory-care programming), not resident health data. Do not add resident-level health or disability information without a separate privacy review.

## Backups and restore

Use the hosted Postgres provider's automated daily backups with 30-day point-in-time recovery. The audit log is append-only (database trigger) and is never deleted, including by `db:seed`. **Test a restore before launch**: restore the latest backup to a scratch database, point `DATABASE_URL` at it, run `npm run backtest` and open the admin dashboard; the totals must reconcile with production.

## Tuning the engine

1. `npm run backtest` — reports, for every historical booking, where the booked musician ranked under the current weights.
2. Change weights/thresholds in Settings (or pass a JSON file to the script for a what-if).
3. Re-run the backtest; watch the override rate on Reports over the following weeks. Overrides with reasons are the feedback loop.
