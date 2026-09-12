"use server";

import { headers } from "next/headers";
import { offerResponseSchema } from "@/lib/validation/schemas";
import { recordOfferResponse, type ResponseOutcome } from "@/lib/services/bookings";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { recordFailure } from "@/lib/alerts";

export type RespondState = { outcome?: ResponseOutcome; error?: string } | null;

export async function respondAction(_prev: RespondState, formData: FormData): Promise<RespondState> {
  const h = await headers();
  if (!rateLimit(`respond:${clientIp(h)}`, 20, 10 * 60_000).ok) return { error: "Too many attempts. Please wait a few minutes and try again." };
  const parsed = offerResponseSchema.safeParse({ token: formData.get("token"), action: formData.get("action"), note: formData.get("note") || undefined });
  if (!parsed.success) return { error: "Please choose a response." };
  if (parsed.data.action === "REQUEST_CHANGES" && !parsed.data.note?.trim()) return { error: "Please tell us what needs to change." };
  try {
    const outcome = await recordOfferResponse(parsed.data.token, parsed.data.action, parsed.data.note?.trim());
    return { outcome };
  } catch (e) {
    await recordFailure("Offer response failed", e);
    return { error: "We could not record your response. Please try again or reply to the email." };
  }
}
