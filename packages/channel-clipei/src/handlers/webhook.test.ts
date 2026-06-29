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
  it('parses an image message (com legenda) carregando a midia', () => {
    expect(
      parseClipeiWebhook({
        conversa_id: 42,
        usuario: { tipo: 'clipador', id: 9, nome: 'Ana' },
        mensagem: { id: 101, texto: 'olha o erro', tipo: 'imagem', midia_url: 'https://cdn.x/y.jpg' },
      }),
    ).toEqual({
      externalId: '101',
      chatId: '42',
      from: 'clipador:9',
      text: 'olha o erro',
      senderName: 'Ana',
      mediaUrl: 'https://cdn.x/y.jpg',
      mediaType: 'imagem',
      mimeType: 'image/jpeg',
    });
  });
  it('aceita imagem SEM legenda (texto vazio) em vez de descartar', () => {
    const r = parseClipeiWebhook({
      conversa_id: 7,
      usuario: { tipo: 'clipador', id: 1 },
      mensagem: { id: 5, texto: '', tipo: 'imagem', midia_url: 'https://cdn.x/p.png' },
    });
    expect(r).not.toBeNull();
    expect(r?.mediaUrl).toBe('https://cdn.x/p.png');
    expect(r?.mediaType).toBe('imagem');
  });
  it('descarta mensagem sem texto E sem midia', () => {
    expect(
      parseClipeiWebhook({
        conversa_id: 7,
        usuario: { tipo: 'clipador', id: 1 },
        mensagem: { id: 5, texto: '', tipo: 'texto' },
      }),
    ).toBeNull();
  });
  it('mensagem de texto puro nao carrega campos de midia', () => {
    const r = parseClipeiWebhook({
      conversa_id: 7,
      usuario: { tipo: 'clipador', id: 1 },
      mensagem: { id: 5, texto: 'oi', tipo: 'texto' },
    });
    expect(r?.mediaUrl).toBeUndefined();
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
