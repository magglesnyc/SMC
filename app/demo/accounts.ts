/** Demo personas. Passwords are seeded by prisma/seed.ts; change them before any real deployment. */
export const DEMO_ACCOUNTS = [
  {
    key: "admin",
    role: "Administrator",
    name: "Alex Admin",
    email: "admin@smc.test",
    password: "demo-admin",
    landing: "/admin",
    blurb: "Full access. Approves musicians, reviews and approves matches, overrides with a reason, tunes scoring weights and email templates, sees private notes, exports data.",
    tour: ["Dashboard → what needs a human right now", "Pipeline → open a request awaiting approval and read the reasoned candidate list", "Settings → change a weight and see it validated to 100%", "Reports → override rate and target metrics"],
  },
  {
    key: "scheduler",
    role: "Scheduler",
    name: "Sam Scheduler",
    email: "scheduler@smc.test",
    password: "demo-scheduler",
    landing: "/admin/requests",
    blurb: "Operational access. Works the pipeline, runs matching, approves or overrides, sends and withdraws offers, records phone responses, resolves exceptions. No access to weights, templates, private notes or exports.",
    tour: ["Pipeline → run matching on the Ready to Match request", "Approve the top recommendation → offers go out", "Exceptions → resolve a decline by approving the next candidate", "Try Settings → politely refused"],
  },
  {
    key: "staff",
    role: "Staff",
    name: "Jordan Staff",
    email: "staff@smc.test",
    password: "demo-staff",
    landing: "/admin/feedback",
    blurb: "A second operational account, useful for showing two people working the same pipeline and the audit trail recording who did what.",
    tour: ["Feedback → close a follow-up", "Audit log → see both staff names on the same event"],
  },
] as const;

/**
 * Portal personas. The seed binds each to the busiest seeded community / musician, so the name
 * shown on the demo hub comes from the database rather than from here.
 */
export const DEMO_PORTAL_ACCOUNTS = [
  {
    key: "facility",
    role: "Community (assisted living)",
    email: "director@community.test",
    password: "demo-community",
    landing: "/portal/facility",
    blurb: "The activity director's own page. Sees who is booked and when, confirms proposed performers, rates each performance, browses and requests performers who travel to the community, and keeps a preferred list.",
    tour: ["Home → confirm a proposed performer, rate a recent performance", "Find performers → filter by genre, open a profile, mark preferred", "Calendar → month view and iCal subscription", "Request a musician → the form with the community pre-filled"],
  },
  {
    key: "musician",
    role: "Musician",
    email: "performer@community.test",
    password: "demo-musician",
    landing: "/portal/musician",
    blurb: "A roster musician's own page. Accepts or declines offers, sees every community they are booked at with addresses and load-in notes, rates venues after each performance, and reads the ratings communities gave them.",
    tour: ["Home → accept an offer, rate a venue", "Calendar → every location, in their own time zone", "Where you play → addresses, parking, load-in, on-site contact", "Ratings → what communities said, and the ratings they gave"],
  },
] as const;

export type DemoKey = (typeof DEMO_ACCOUNTS)[number]["key"] | (typeof DEMO_PORTAL_ACCOUNTS)[number]["key"];
export const ALL_DEMO_ACCOUNTS = [...DEMO_ACCOUNTS, ...DEMO_PORTAL_ACCOUNTS] as const;
