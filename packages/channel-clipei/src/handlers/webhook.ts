import { z } from 'zod';
import type { ClipeiPlugin } from '../plugin';
import type { ClipeiInstanceState } from '../types';

const Schema = z
  .object({
    event: z.string().optional(),
    conversa_id: z.union([z.string(), z.number()]),
    usuario: z.object({
      tipo: z.string(),
      id: z.union([z.string(), z.number()]),
      nome: z.string().optional(),
    }),
    mensagem: z.object({
      id: z.union([z.string(), z.number()]),
      texto: z.string(),
    }),
  })
  .passthrough();

export interface ParsedClipeiMessage {
  externalId: string;
  chatId: string;
  from: string;
  text: string;
  senderName?: string;
}

export function parseClipeiWebhook(raw: unknown): ParsedClipeiMessage | null {
  const p = Schema.safeParse(raw);
  if (!p.success) return null;
  const d = p.data;
  if (!d.mensagem.texto) return null;
  return {
    externalId: String(d.mensagem.id),
    chatId: String(d.conversa_id),
    from: `${d.usuario.tipo}:${d.usuario.id}`,
    text: d.mensagem.texto,
    senderName: d.usuario.nome,
  };
}

export function verifyClipeiSecret(request: Request, secret?: string): boolean {
  if (!secret) return true;
  const auth = request.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return token === secret;
}

export async function handleClipeiWebhook(
  request: Request,
  plugin: ClipeiPlugin,
  instanceId: string,
  state: ClipeiInstanceState,
): Promise<Response> {
  if (!verifyClipeiSecret(request, state.config.webhookSecret)) {
    return new Response('Forbidden', { status: 403 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  const msg = parseClipeiWebhook(raw);
  if (!msg) return new Response('OK', { status: 200 });
  if (state.dedupeCache.isDuplicate(instanceId, msg.externalId, 'clipei', plugin.getLogger())) {
    return new Response('OK', { status: 200 });
  }
  await plugin.handleMessageReceived({
    instanceId,
    externalId: msg.externalId,
    chatId: msg.chatId,
    from: msg.from,
    text: msg.text,
  });
  return new Response('OK', { status: 200 });
}
