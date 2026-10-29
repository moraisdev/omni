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
  /** When true, periodically discover DM channels and watch them automatically. */
  autoDiscoverDms?: boolean;
  /** How often to re-discover DM channels, in ms (default 30000). */
  discoverIntervalMs?: number;
  onMessage: (channelId: string, message: ClickUpMessage, meta: { isDm: boolean }) => Promise<void>;
  onError?: (error: unknown) => void;
  /** Optional hook fired when new DM channels are discovered at runtime. */
  onChannelsDiscovered?: (newChannelIds: string[]) => void;
}

const DEFAULT_DISCOVER_INTERVAL_MS = 30000;

export class ClickUpPoller {
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Per-channel set of already-seen message ids. */
  private seen = new Map<string, Set<string>>();
  /** True until the first poll of a channel completes (so we don't replay history). */
  private primed = new Set<string>();
  private polling = false;
  /** Live set of watched channel ids (grows as DMs are discovered). */
  private channels: Set<string>;
  /** Channel ids classified as DM by the ClickUp API (type === 'DM'). */
  private dmChannels = new Set<string>();
  private lastDiscoverAt = 0;
  /** False until the first DM discovery completes. */
  private discoveredOnce = false;

  constructor(private readonly opts: ClickUpPollerOptions) {
    this.channels = new Set(opts.channelIds);
  }

  /** Watched channel ids (exposed for tests/inspection). */
  watchedChannels(): string[] {
    return [...this.channels];
  }

  /** Whether a channel is a DM (per ClickUp channel type). Unknown channels count as group. */
  isDmChannel(channelId: string): boolean {
    return this.dmChannels.has(channelId);
  }

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
    this.channels.clear();
    this.discoveredOnce = false;
    this.lastDiscoverAt = 0;
  }

  /**
   * Discover DM channels and add any new ones to the watch set.
   *
   * DMs found on the first discovery are primed normally (their backlog is
   * skipped). DMs that appear later are brand-new conversations, so they are
   * pre-primed with an empty seen set — their first message is processed
   * instead of being skipped as backlog.
   */
  private async discoverDms(): Promise<void> {
    const all = await this.opts.client.listChannels(100);
    const runtime = this.discoveredOnce;
    const added: string[] = [];
    for (const ch of all) {
      if (ch.type !== 'DM') continue;
      this.dmChannels.add(ch.id);
      if (!this.opts.autoDiscoverDms) continue;
      if (this.channels.has(ch.id)) continue;
      this.channels.add(ch.id);
      added.push(ch.id);
      if (runtime) {
        this.primed.add(ch.id);
        this.seen.set(ch.id, new Set());
      }
    }
    this.discoveredOnce = true;
    if (runtime && added.length > 0) this.opts.onChannelsDiscovered?.(added);
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

      await this.opts.onMessage(channelId, msg, { isDm: this.dmChannels.has(channelId) });
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
      if (this.opts.autoDiscoverDms || !this.discoveredOnce) {
        const now = Date.now();
        const every = this.opts.discoverIntervalMs ?? DEFAULT_DISCOVER_INTERVAL_MS;
        if (now - this.lastDiscoverAt >= every || !this.discoveredOnce) {
          this.lastDiscoverAt = now;
          try {
            await this.discoverDms();
          } catch (error) {
            this.opts.onError?.(error);
          }
        }
      }
      for (const channelId of this.channels) {
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
