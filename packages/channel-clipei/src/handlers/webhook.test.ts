import { describe, expect, it } from 'bun:test';
import { parseClipeiWebhook, verifyClipeiSecret } from './webhook';

describe('parseClipeiWebhook', () => {
  it('parses a support message payload', () => {
    expect(
      parseClipeiWebhook({
        event: 'suporte.mensagem_nova',
        conversa_id: 42,
        usuario: { tipo: 'clipador', id: 9, nome: 'Ana' },
        mensagem: { id: 100, texto: 'como funciona?' },
      }),
    ).toEqual({ externalId: '100', chatId: '42', from: 'clipador:9', text: 'como funciona?', senderName: 'Ana' });
  });
  it('returns null on missing fields', () => {
    expect(parseClipeiWebhook({ event: 'x' })).toBeNull();
    expect(parseClipeiWebhook(null)).toBeNull();
  });
});

describe('verifyClipeiSecret', () => {
  const req = (h?: string) =>
    new Request('https://x/api/v2/channels/clipei/i1/webhook', {
      method: 'POST',
      headers: h ? { authorization: `Bearer ${h}` } : {},
    });
  it('passes without configured secret', () => {
    expect(verifyClipeiSecret(req(), undefined)).toBe(true);
  });
  it('passes on match', () => {
    expect(verifyClipeiSecret(req('s'), 's')).toBe(true);
  });
  it('fails on mismatch', () => {
    expect(verifyClipeiSecret(req('x'), 's')).toBe(false);
  });
});
