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
}
