import { inngest } from "./client";
import { runMatchingForRequest } from "@/lib/services/matching";
import { runDueJobs } from "@/lib/services/jobs";

/** Stage 4→5: a request became Ready to Match → run the engine. Idempotent per request. */
export const matchOnReady = inngest.createFunction(
  { id: "match-on-ready", triggers: [{ event: "smc/request.ready" }], retries: 3 },
  async ({ event, step }) => {
    const eventRequestId = String((event.data as { eventRequestId?: string }).eventRequestId ?? "");
    return step.run("run-matching", async () => {
      const { run, result } = await runMatchingForRequest(eventRequestId);
      return { runId: run.id, eligible: result.eligibleCount };
    });
  },
);

/** Reminders, completion, feedback sends, nudges — every 10 minutes. All sends are idempotent. */
export const scheduledJobs = inngest.createFunction(
  { id: "scheduled-jobs", triggers: [{ cron: "*/10 * * * *" }, { event: "smc/jobs.run" }], retries: 1 },
  async ({ step }) => step.run("run-due-jobs", () => runDueJobs()),
);

export const functions = [matchOnReady, scheduledJobs];
