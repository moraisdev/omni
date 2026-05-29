import { describe, expect, it } from 'bun:test';
import type { ClickUpClient, ClickUpMessage } from '../client';
import { ClickUpPoller } from './poller';

function makeClient(pages: ClickUpMessage[][]): { client: ClickUpClient; calls: () => number } {
  let i = 0;
  const client = {
    async getMessages(): Promise<ClickUpMessage[]> {
      const page = pages[Math.min(i, pages.length - 1)] ?? [];
      i += 1;
      return page;
    },
  } as unknown as ClickUpClient;
  return { client, calls: () => i };
}

const msg = (id: string, userId: string, content = `m${id}`): ClickUpMessage => ({ id, content, userId });

describe('ClickUpPoller.pollChannel', () => {
  it('primes on first poll without replaying backlog', async () => {
    const received: string[] = [];
    const { client } = makeClient([[msg('3', 'u1'), msg('2', 'u1'), msg('1', 'u1')]]);
    const poller = new ClickUpPoller({
      client,
      channelIds: ['c1'],
      selfUserId: 'bot',
      intervalMs: 1000,
      onMessage: async (_c, m) => {
        received.push(m.id);
      },
    });
    await poller.pollChannel('c1');
    expect(received).toEqual([]); // first poll only primes
  });

  it('emits new messages on subsequent polls, oldest-first', async () => {
    const received: string[] = [];
    const { client } = makeClient([
      [msg('1', 'u1')], // prime
      [msg('3', 'u1'), msg('2', 'u1'), msg('1', 'u1')], // 2 and 3 are new
    ]);
    const poller = new ClickUpPoller({
      client,
      channelIds: ['c1'],
      selfUserId: 'bot',
      intervalMs: 1000,
      onMessage: async (_c, m) => {
        received.push(m.id);
      },
    });
    await poller.pollChannel('c1'); // prime with 1
    await poller.pollChannel('c1'); // sees 2, 3
    expect(received).toEqual(['2', '3']); // oldest-first
  });

  it('skips the bot own messages', async () => {
    const received: string[] = [];
    const { client } = makeClient([
      [msg('1', 'u1')],
      [msg('2', 'bot'), msg('1', 'u1')], // 2 is from the bot
    ]);
    const poller = new ClickUpPoller({
      client,
      channelIds: ['c1'],
      selfUserId: 'bot',
      intervalMs: 1000,
      onMessage: async (_c, m) => {
        received.push(m.id);
      },
    });
    await poller.pollChannel('c1');
    await poller.pollChannel('c1');
    expect(received).toEqual([]); // bot message skipped
  });

  it('does not re-emit an already seen message', async () => {
    const received: string[] = [];
    const { client } = makeClient([
      [msg('1', 'u1')],
      [msg('2', 'u1'), msg('1', 'u1')],
      [msg('2', 'u1'), msg('1', 'u1')], // same as before
    ]);
    const poller = new ClickUpPoller({
      client,
      channelIds: ['c1'],
      selfUserId: 'bot',
      intervalMs: 1000,
      onMessage: async (_c, m) => {
        received.push(m.id);
      },
    });
    await poller.pollChannel('c1');
    await poller.pollChannel('c1');
    await poller.pollChannel('c1');
    expect(received).toEqual(['2']); // only once
  });
});
