import { ClipeiError, ClipeiErrorCode } from './types';

export interface ClipeiReplyResult {
  messageId: string;
}

export function buildReplyBody(conversaId: string, text: string): { conversa_id: number; conteudo: string } {
  return { conversa_id: Number(conversaId), conteudo: text };
}

export class ClipeiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly responseSecret: string,
  ) {}

  async reply(conversaId: string, text: string): Promise<ClipeiReplyResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/otto/responder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.responseSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildReplyBody(conversaId, text)),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ClipeiError(ClipeiErrorCode.SEND_FAILED, `Clipei reply failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const data = (await res.json().catch(() => ({}))) as { mensagem?: { id?: number | string } };
    return { messageId: data.mensagem?.id !== undefined ? String(data.mensagem.id) : crypto.randomUUID() };
  }
}
