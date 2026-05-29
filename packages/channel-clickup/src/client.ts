/**
 * Minimal ClickUp v3 Chat API client.
 *
 * Docs: https://developer.clickup.com/reference/createchatmessage
 * NOTE: The Chat API is marked experimental by ClickUp and may change.
 */

import { ClickUpError, ClickUpErrorCode } from './types';

const API_BASE = 'https://api.clickup.com/api/v3';

export interface ClickUpSendResult {
  messageId: string;
}

export interface ClickUpMessage {
  id: string;
  content: string;
  userId: string;
  parentMessageId?: string;
}

export class ClickUpClient {
  constructor(
    private readonly apiToken: string,
    private readonly workspaceId: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: this.apiToken,
      'Content-Type': 'application/json',
    };
  }

  /** Return the authenticated user's id (used to skip the bot's own messages). */
  async getCurrentUserId(): Promise<string | undefined> {
    try {
      const res = await fetch('https://api.clickup.com/api/v2/user', {
        method: 'GET',
        headers: this.headers(),
      });
      if (!res.ok) return undefined;
      const data = (await res.json().catch(() => ({}))) as { user?: { id?: number | string } };
      return data.user?.id !== undefined ? String(data.user.id) : undefined;
    } catch {
      return undefined;
    }
  }

  /** Validate the token + workspace by listing chat channels. */
  async validateCredentials(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE}/workspaces/${this.workspaceId}/chat/channels?limit=1`, {
        method: 'GET',
        headers: this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Post a top-level text message to a chat channel. */
  async sendMessage(channelId: string, text: string): Promise<ClickUpSendResult> {
    const res = await fetch(`${API_BASE}/workspaces/${this.workspaceId}/chat/channels/${channelId}/messages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ type: 'message', content: text }),
    });

    if (res.status === 429) {
      throw new ClickUpError(ClickUpErrorCode.RATE_LIMITED, 'ClickUp rate limit hit');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ClickUpError(
        ClickUpErrorCode.SEND_FAILED,
        `ClickUp send failed (${res.status}): ${body.slice(0, 300)}`,
      );
    }

    const data = (await res.json().catch(() => ({}))) as { data?: { id?: string }; id?: string };
    const messageId = data.data?.id ?? data.id ?? crypto.randomUUID();
    return { messageId };
  }

  /** Fetch the most recent messages from a chat channel (newest first). */
  async getMessages(channelId: string, limit = 25): Promise<ClickUpMessage[]> {
    const res = await fetch(
      `${API_BASE}/workspaces/${this.workspaceId}/chat/channels/${channelId}/messages?limit=${limit}`,
      { method: 'GET', headers: this.headers() },
    );

    if (res.status === 429) {
      throw new ClickUpError(ClickUpErrorCode.RATE_LIMITED, 'ClickUp rate limit hit');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ClickUpError(
        ClickUpErrorCode.SEND_FAILED,
        `ClickUp getMessages failed (${res.status}): ${body.slice(0, 300)}`,
      );
    }

    const raw = (await res.json().catch(() => ({}))) as { data?: unknown[] };
    return normalizeMessages(raw.data ?? []);
  }
}

/** Map raw ClickUp message rows into the normalized shape (defensive field access). */
export function normalizeMessages(rows: unknown[]): ClickUpMessage[] {
  const out: ClickUpMessage[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const r = row as Record<string, unknown>;
    const id = r.id !== undefined ? String(r.id) : undefined;
    const content = (r.content ?? r.text_content) as string | undefined;
    const user = r.user as Record<string, unknown> | undefined;
    const userId = user?.id !== undefined ? String(user.id) : r.user_id !== undefined ? String(r.user_id) : undefined;
    if (!id || !content || !userId) continue;
    out.push({
      id,
      content,
      userId,
      parentMessageId: r.parent_message_id != null ? String(r.parent_message_id) : undefined,
    });
  }
  return out;
}
