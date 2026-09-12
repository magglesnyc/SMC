import type { ReactElement } from "react";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { prisma } from "@/lib/db";
import { recordFailure } from "@/lib/alerts";
import { Prisma } from "@/generated/prisma/client";

/**
 * Channel-agnostic notification dispatcher.
 * Triggers call `dispatch()` with a message; adapters do the delivery. Email is the only
 * adapter in v1. An SMS adapter can be registered later without touching any trigger.
 */

export interface OutboundMessage {
  channel?: "email";
  to: string;
  templateKey: string;
  subject: string;
  body: ReactElement;
  /** Unique per logical send (e.g. `offer:${matchId}:MUSICIAN`). Duplicate keys are skipped. */
  idempotencyKey: string;
  matchId?: string | null;
  eventRequestId?: string | null;
}

export interface ChannelAdapter {
  channel: string;
  configured: boolean;
  send(msg: OutboundMessage, rendered: { html: string; text: string }): Promise<{ providerId?: string }>;
}

const from = () => process.env.EMAIL_FROM ?? "Senior Music Connection <bookings@example.com>";

const resendAdapter: ChannelAdapter = {
  channel: "email",
  configured: Boolean(process.env.RESEND_API_KEY),
  async send(msg, rendered) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const res = await resend.emails.send({
      from: from(),
      to: msg.to,
      subject: msg.subject,
      html: rendered.html,
      text: rendered.text,
      headers: { "X-Idempotency-Key": msg.idempotencyKey },
    });
    if (res.error) throw new Error(res.error.message);
    return { providerId: res.data?.id };
  },
};

/** Development adapter: logs to the console and keeps the rendered text in the notification log. */
const consoleAdapter: ChannelAdapter = {
  channel: "email",
  configured: false,
  async send(msg, rendered) {
    console.log(`\n=== EMAIL (not sent: no RESEND_API_KEY) ===\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${rendered.text}\n===\n`);
    return { providerId: `console-${Date.now()}` };
  },
};

const adapters: Record<string, ChannelAdapter> = {
  email: process.env.RESEND_API_KEY ? resendAdapter : consoleAdapter,
};

export function registerAdapter(adapter: ChannelAdapter) {
  adapters[adapter.channel] = adapter;
}

export type DispatchResult = { status: "SENT" | "SKIPPED" | "FAILED"; logId?: string; error?: string };

export async function dispatch(msg: OutboundMessage): Promise<DispatchResult> {
  const channel = msg.channel ?? "email";
  const adapter = adapters[channel];
  if (!adapter) return { status: "FAILED", error: `No adapter for channel ${channel}` };

  // Claim the idempotency key first. A unique violation means this send already happened.
  let log;
  try {
    log = await prisma.notificationLog.create({
      data: {
        idempotencyKey: msg.idempotencyKey,
        channel,
        recipient: msg.to,
        templateKey: msg.templateKey,
        subject: msg.subject,
        status: "SKIPPED",
        matchId: msg.matchId ?? null,
        eventRequestId: msg.eventRequestId ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { status: "SKIPPED" };
    }
    throw e;
  }

  try {
    const html = await render(msg.body);
    const text = await render(msg.body, { plainText: true });
    const { providerId } = await adapter.send(msg, { html, text });
    await prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: "SENT",
        providerId: providerId ?? null,
        // Keep the plain-text body only in dev mode so staff can find the links.
        payload: adapter.configured ? undefined : { devPreview: true, text },
      },
    });
    return { status: "SENT", logId: log.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.notificationLog.update({ where: { id: log.id }, data: { status: "FAILED", error } });
    await recordFailure(`Email send failed: ${msg.templateKey} to ${msg.to}`, e, {
      matchId: msg.matchId ?? null,
      eventRequestId: msg.eventRequestId ?? null,
    });
    return { status: "FAILED", logId: log.id, error };
  }
}

/** Subject/intro text overridable by admins (FR-16). */
export async function templateText(key: string, defaults: { subject: string; intro: string }) {
  const row = await prisma.notificationTemplate.findUnique({ where: { key } });
  return { subject: row?.subject || defaults.subject, intro: row?.intro || defaults.intro };
}

export function staffEmails(): string[] {
  const pm = process.env.PROGRAM_MANAGER_EMAIL;
  return pm ? [pm] : [];
}
