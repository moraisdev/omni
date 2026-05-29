/**
 * ClickUp Chat poller.
 *
 * The ClickUp Chat API has no usable real-time webhook for message content
 * (Automation webhooks only carry task fields). So inbound messages are picked
 * up by polling each watched channel on an interval and emitting new ones.
 *
 * "New" = message id not seen before AND not authored by the bot user itself
 * (otherwise the agent would reply to its own messages).
 */

import type { ClickUpClient, ClickUpMessage } from '../client';

export interface ClickUpPollerOptions {
  client: ClickUpClient;
  channelIds: string[];
  /** The bot's own ClickUp user id — its messages are skipped. */
  selfUserId: string;
  intervalMs: number;
  /** When true, do not skip the bot's own messages (test/debug only). */
  disableSelfFilter?: boolean;
  onMessage: (channelId: string, message: ClickUpMessage) => Promise<void>;
  onError?: (error: unknown) => void;
}

export class ClickUpPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Per-channel set of already-seen message ids. */
  private seen = new Map<string, Set<string>>();
  /** True until the first poll of a channel completes (so we don't replay history). */
  private primed = new Set<string>();
  private polling = false;

  constructor(private readonly opts: ClickUpPollerOptions) {}

  start(): void {
    if (this.timer) return;
    // Fire once immediately to prime, then on the interval.
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.opts.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.seen.clear();
    this.primed.clear();
  }

  /** Exposed for tests: process one channel's latest messages. */
  async pollChannel(channelId: string): Promise<void> {
    const messages = await this.opts.client.getMessages(channelId, 25);
    let seenSet = this.seen.get(channelId);
    if (!seenSet) {
      seenSet = new Set();
      this.seen.set(channelId, seenSet);
    }

    const firstPoll = !this.primed.has(channelId);

    // API returns newest-first; process oldest-first for natural ordering.
    for (const msg of [...messages].reverse()) {
      if (seenSet.has(msg.id)) continue;
      seenSet.add(msg.id);

      // On the first poll we only record ids (prime) — don't replay backlog.
      if (firstPoll) continue;
      // Skip the bot's own messages to avoid self-reply loops.
      if (!this.opts.disableSelfFilter && msg.userId === this.opts.selfUserId) continue;

      await this.opts.onMessage(channelId, msg);
    }

    this.primed.add(channelId);

    // Bound memory: keep the set from growing unbounded on busy channels.
    if (seenSet.size > 500) {
      const trimmed = new Set([...seenSet].slice(-250));
      this.seen.set(channelId, trimmed);
    }
  }

  private async tick(): Promise<void> {
    if (this.polling) return; // avoid overlapping runs on slow networks
    this.polling = true;
    try {
      for (const channelId of this.opts.channelIds) {
        try {
          await this.pollChannel(channelId);
        } catch (error) {
          this.opts.onError?.(error);
        }
      }
    } finally {
      this.polling = false;
    }
  }
}
