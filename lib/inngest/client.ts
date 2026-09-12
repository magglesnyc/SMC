import { Inngest } from "inngest";

export type Events = {
  "smc/request.ready": { eventRequestId: string };
  "smc/jobs.run": Record<string, never>;
};

export const inngest = new Inngest({ id: "senior-music-connection" });

/**
 * Fire-and-forget event emission. If the Inngest dev server / cloud is unreachable the
 * caller falls back to running the work inline, so local demos work without Inngest.
 */
export async function emit<K extends keyof Events>(name: K, data: Events[K], inlineFallback?: () => Promise<unknown>) {
  try {
    await inngest.send({ name, data });
    return "queued" as const;
  } catch (e) {
    if (inlineFallback) {
      console.warn(`Inngest unavailable (${e instanceof Error ? e.message : e}); running ${name} inline`);
      await inlineFallback();
      return "inline" as const;
    }
    throw e;
  }
}
