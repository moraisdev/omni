import { describe, expect, it } from 'bun:test';
import { buildReplyBody } from './client';

describe('buildReplyBody', () => {
  it('builds the responder payload', () => {
    expect(buildReplyBody('42', 'olá')).toEqual({ conversa_id: 42, conteudo: 'olá' });
  });
  it('coerces numeric chatId string', () => {
    expect(buildReplyBody('7', 'oi').conversa_id).toBe(7);
  });
});
