/**
 * ClickUp Chat webhook handler.
 *
 * Fed by a ClickUp Chat Automation ("Message is posted" trigger) configured to
 * POST to: /api/v2/channels/clickup/{instanceId}/webhook
 *
 * ClickUp's automation payload shape is not strictly documented (the Chat API is
 * experimental), so we parse defensively: we look for the message text, the
 * channel id, the sender id, and a message id across the most likely field names.
 */

import { z } from 'zod';
import type { ClickUpPlugin } from '../plugin';
import type { ClickUpInstanceState } from '../types';

/**
 * Loose schema — ClickUp automation payloads vary. We accept a superset and
 * extract what we need. `.passthrough()` keeps unknown fields for rawPayload.
 */
const ClickUpWebhookSchema = z
  .object({
    // Possible message containers across automation/webhook variants.
    message: z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        text_content: z.string().optional(),
        content: z.string().optional(),
        channel_id: z.union([z.string(), z.number()]).optional(),
        parent_message_id: z.union([z.string(), z.number()]).nullable().optional(),
        user: z
          .object({ id: z.union([z.string(), z.number()]).optional() })
          .passthrough()
          .optional(),
        user_id: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
    // Some automation payloads put fields at top-level.
    channel_id: z.union([z.string(), z.number()]).optional(),
    user_id: z.union([z.string(), z.number()]).optional(),
    text: z.string().optional(),
  })
  .passthrough();

function asString(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

export interface ParsedClickUpMessage {
  externalId: string;
  chatId: string;
  from: string;
  text: string;
  replyToId?: string;
}

/** Extract a normalized message from a raw ClickUp webhook payload, or null. */
export function parseClickUpWebhook(raw: unknown): ParsedClickUpMessage | null {
  const parsed = ClickUpWebhookSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const msg = p.message ?? {};

  const text = msg.text_content ?? msg.content ?? p.text;
  const chatId = asString(msg.channel_id ?? p.channel_id);
  const from = asString(msg.user?.id ?? msg.user_id ?? p.user_id);
  const externalId = asString(msg.id) ?? crypto.randomUUID();

  if (!text || !chatId || !from) return null;

  return {
    externalId,
    chatId,
    from,
    text,
    replyToId: asString(msg.parent_message_id ?? undefined),
  };
}

/**
 * Constant-time-ish secret check. ClickUp signs automation webhooks with a
 * shared secret; the exact header is not stable across the experimental API, so
 * we accept the secret via `?secret=` query param OR an `X-Signature` header
 * matching the configured webhookSecret. If no secret is configured, skip.
 */
export function verifyClickUpSecret(request: Request, secret?: string): boolean {
  if (!secret) return true;
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('secret');
  const fromHeader = request.headers.get('x-signature') ?? request.headers.get('x-clickup-secret');
  return fromQuery === secret || fromHeader === secret;
}

export async function handleClickUpWebhook(
  request: Request,
  plugin: ClickUpPlugin,
  instanceId: string,
  state: ClickUpInstanceState,
): Promise<Response> {
  if (!verifyClickUpSecret(request, state.config.webhookSecret)) {
    return new Response('Forbidden', { status: 403 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const message = parseClickUpWebhook(raw);
  // Non-message events (status, reactions, etc.) are acknowledged and discarded.
  if (!message) return new Response('OK', { status: 200 });

  // Dedupe redelivered webhooks by message id.
  if (state.dedupeCache.isDuplicate(instanceId, message.externalId, 'clickup', plugin.getLogger())) {
    return new Response('OK', { status: 200 });
  }

  await plugin.handleMessageReceived({
    instanceId,
    externalId: message.externalId,
    chatId: message.chatId,
    from: message.from,
    text: message.text,
    replyToId: message.replyToId,
    rawPayload: raw as Record<string, unknown>,
  });

  return new Response('OK', { status: 200 });
}
