# Monday.com sync

Senior Music Connection runs its bookings on Monday.com today. Until staff are confident enough to switch, the app
mirrors the Monday boards so both stay in step: Monday → app is live (this document), app → Monday and webhooks are
the next step. Turning the sync off is one variable: blank `MONDAY_API_TOKEN`.

## Setup

| Variable | Purpose |
|---|---|
| `MONDAY_API_TOKEN` | Personal API token of the Monday user the sync runs as. Blank disables the sync. |
| `MONDAY_BOARD_<KEY>` | Optional board-id overrides so a duplicated test board can be used instead of the live one. |
| `MONDAY_LEGACY_WORKSPACE_ID` | Optional: export every board in the retired workspace, not just the known ids. |

**The token belongs to a person.** Monday API tokens and any webhooks created with them stop working the moment that
user is deactivated, and Monday does not report it: the sync would simply go quiet. Before removing whoever set the
sync up, create a dedicated `smcsync@…` user, add it to every board in `lib/monday/boards.ts`, generate its token,
replace `MONDAY_API_TOKEN` locally and on Railway, and re-run the webhook setup. Loop prevention deliberately does not
depend on which user made a change (see below), so swapping users is purely a config change.

## Commands

```
npm run monday:pull -- --dry-run                 # preview: reads every board, writes nothing
npm run monday:pull                              # incremental pull (items unchanged since last pull are skipped)
npm run monday:pull -- --full                    # re-read every item regardless of the watermark
npm run monday:pull -- --boards=entertainers,clients
npm run monday:export-legacy                     # full JSON + CSV export of the retired workspace → exports/
```

## What maps to what

| Monday board | App record | Direction |
|---|---|---|
| Partner Entertainer List | `Musician` | two-way (pull live; push next) |
| Client List | `Facility` | two-way |
| Gig Tracker (+ its source Facility Booking Request Form row) | `EventRequest` + the selected `Match` | two-way |
| Facility Booking Request Form rows with no gig yet | `EventRequest` (SUBMITTED) | Monday → app |
| Facility / Entertainer Feedback Forms | `Feedback` (CLIENT / MUSICIAN) | Monday → app |
| Entertainer Applications | `Musician` (SUBMITTED / REVIEW / APPROVED) | Monday → app |
| Client / Entertainer Service Agreements | nothing; `EventRequest.agreementStatus` mirrors the Gig Tracker label | read-only |

Every linked pair is a `MondayLink` row (board id, item id, entity type, entity id, item `updated_at` at last pull).
One event can be linked to two items (its gig and its request-form row); one request-form row can back several
events (multi-date bookings are one Gig Tracker row per date). `MondaySyncLog` is the audit trail of what each pull
did; `MondaySyncCursor` records the last pull per board.

### Gig Tracker lifecycle

Monday expresses a gig's state by which **group** it sits in, not a status column:

| Group | `EventRequest.status` | selected `Match` |
|---|---|---|
| To Be Booked | READY_TO_MATCH (NEEDS_INFORMATION if the facility could not be linked) | none |
| Booked | CLOSED "Booking confirmed" | CONFIRMED |
| Completed Bookings / Past Bookings | CLOSED | COMPLETED once the end time has passed |
| Cancellations (or `Cancel Event? = Yes`) | CLOSED "Cancelled in Monday …" | CONFIRMED + exception CANCELLED, reason from *Who Cancelled* / *Reason* |

Monday holds no candidate list, so the booked entertainer becomes a one-candidate `MatchRun` with `isOverride` and
`overrideReason = "Booked in Monday"`. If the entertainer changes on the gig, the previous row is deselected with
`REMATCH_REQUIRED`.

### Linking rules

- **Facility for a gig:** the gig's *Client List* relation → the request's relation → a facility whose primary
  contact email matches → a confident name/address duplicate match. Otherwise the request's address and contact go
  into `intakeFacility` and the event is NEEDS_INFORMATION with `missingFields = ["linked facility"]`.
- **Entertainer for a gig:** the gig's *Partner Entertainer List* relation → a musician with the *[Required]
  Entertainer Email*. No entertainer ⇒ no booking row (the event stays unmatched).
- **Musician / facility on first sight:** if the app already has a confident duplicate (same email or phone; same
  address) the Monday item is linked to it rather than creating a second record.
- **Feedback** is keyed on the `event_id` the forms already stamp (the Gig Tracker item id).

### Field ownership during the transition

Monday owns everything it has a column for; a pull overwrites those fields. App-only fields (weekly availability,
blackouts, insurance and background check, matching stats, private notes already written in the app) are never
touched. Free-text Monday values are kept verbatim *and* parsed into their structured equivalents:

| Monday text | Kept in | Parsed into |
|---|---|---|
| Time of Performance ("2 PM - 3 PM", "6:30 to 7:30 pm", "TBD") | `timeText` | `startAt` + `durationMinutes` (default 2 pm, 60 min when unparseable) |
| Expected pay ("$200 per hour", "$500 and up") | `rateNotes` | `standardRate`, `rateStructure` (only when a number is present) |
| How far will you drive ("30 minutes", "OPEN", "50+ miles") | `travelNotes` | `maxTravelMiles` |
| Genre description | `genreNotes` | `genres` keyword tags |
| Approximate attendance ("30+", "1-10") | — | `expectedAttendance` (upper bound) |

Parsers live in `lib/monday/parse.ts` with tests in `tests/monday.parse.test.ts`.

## Records from Monday do not trigger app emails

`EventRequest.source = "MONDAY"` marks every mirrored event. `runDueJobs` skips those for reminders, offer nudges and
feedback sends (staff send agreements, reminders and feedback forms from Monday by hand). The app still marks them
completed after the event so musician stats and history stay right.

## Loop prevention (for the push side)

Every value the app writes to Monday is recorded in `MondayEcho` (item id, column id, hash of the value). When the
webhook for that change arrives it is recognised as our own echo and dropped. This is keyed on the value, not on the
Monday user who made the change, so the sync works whether it runs as a staff member's token or a dedicated user.

## Retired workspace

The old "Senior Music Connection" workspace (Gig Tracker 5834314429, old application and agreement boards) is not
synced. `npm run monday:export-legacy` writes a complete JSON + CSV export under `exports/monday-legacy/<date>/`
(git-ignored: it contains contact details). Importing that history into the app and archiving the boards in Monday
is a separate step; archive, never delete.

## Known data gaps surfaced by the first pull

- A handful of Gig Tracker rows have no date on the gig or its request (placeholders); they are reported and skipped.
- Dropdown labels are inconsistent ("Independant Living" / "Independent Living", "Cincinnati, Dayton"); the parsers
  normalise them but Monday keeps the originals.
- Some Client List email cells hold several addresses; the first becomes the primary contact, the rest go into the
  facility's private notes.
