/**
 * ClickUp channel types
 */

import type { DedupeCache } from '@omni/channel-sdk';
import type { ClickUpClient } from './client';
import type { ClickUpPoller } from './handlers/poller';

export interface ClickUpConfig {
  /** ClickUp personal API token (pk_...) or OAuth access token */
  apiToken: string;
  /** Workspace (team) id the chat channels belong to */
  workspaceId: string;
  /** Optional shared secret used to verify incoming automation webhooks */
  webhookSecret?: string;
  /** Chat channel ids to poll for inbound messages (polling mode). */
  channelIds?: string[];
  /** Polling interval in ms (default 5000). */
  pollIntervalMs?: number;
}

export interface ClickUpInstanceState {
  client: ClickUpClient;
  config: ClickUpConfig;
  dedupeCache: DedupeCache;
  poller?: ClickUpPoller;
}

export enum ClickUpErrorCode {
  AUTH_FAILED = 'AUTH_FAILED',
  INVALID_CONFIG = 'INVALID_CONFIG',
  SEND_FAILED = 'SEND_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',
}

export class ClickUpError extends Error {
  constructor(
    readonly code: ClickUpErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClickUpError';
  }
}
