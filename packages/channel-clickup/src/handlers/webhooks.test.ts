import { describe, expect, it } from 'bun:test';
import { parseClickUpWebhook, verifyClickUpSecret } from './webhooks';

describe('parseClickUpWebhook', () => {
  it('parses a nested message payload', () => {
    const result = parseClickUpWebhook({
      message: {
        id: 'msg_123',
        text_content: 'olá otto',
        channel_id: 'chan_9',
        user: { id: 42 },
      },
    });
    expect(result).toEqual({
      externalId: 'msg_123',
      chatId: 'chan_9',
      from: '42',
      text: 'olá otto',
      replyToId: undefined,
    });
  });

  it('parses a flat payload and content fallback field', () => {
    const result = parseClickUpWebhook({
      message: { id: 7, content: 'hi', channel_id: 100, user_id: 5 },
    });
    expect(result?.text).toBe('hi');
    expect(result?.chatId).toBe('100');
    expect(result?.from).toBe('5');
    expect(result?.externalId).toBe('7');
  });

  it('captures parent_message_id as replyToId', () => {
    const result = parseClickUpWebhook({
      message: { id: 'm1', text_content: 'reply', channel_id: 'c1', user_id: 'u1', parent_message_id: 'm0' },
    });
    expect(result?.replyToId).toBe('m0');
  });

  it('returns null when required fields are missing (non-message event)', () => {
    expect(parseClickUpWebhook({ event: 'status_update' })).toBeNull();
    expect(parseClickUpWebhook({ message: { id: 'x', channel_id: 'c' } })).toBeNull(); // no text/from
  });

  it('returns null on malformed input', () => {
    expect(parseClickUpWebhook(null)).toBeNull();
    expect(parseClickUpWebhook('garbage')).toBeNull();
  });
});

describe('verifyClickUpSecret', () => {
  const makeReq = (opts: { query?: string; header?: string }) =>
    new Request(`https://x/api/v2/channels/clickup/i1/webhook${opts.query ? `?secret=${opts.query}` : ''}`, {
      method: 'POST',
      headers: opts.header ? { 'x-signature': opts.header } : {},
    });

  it('passes when no secret is configured', () => {
    expect(verifyClickUpSecret(makeReq({}), undefined)).toBe(true);
  });

  it('passes with matching query secret', () => {
    expect(verifyClickUpSecret(makeReq({ query: 's3cr3t' }), 's3cr3t')).toBe(true);
  });

  it('passes with matching header secret', () => {
    expect(verifyClickUpSecret(makeReq({ header: 's3cr3t' }), 's3cr3t')).toBe(true);
  });

  it('fails with wrong secret', () => {
    expect(verifyClickUpSecret(makeReq({ query: 'wrong' }), 's3cr3t')).toBe(false);
  });
});
