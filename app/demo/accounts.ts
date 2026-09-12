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
