import type { DedupeCache } from '@omni/channel-sdk';
import type { ClipeiClient } from './client';

export interface ClipeiConfig {
  /** Base URL of the Clipei app (where /api/otto/responder lives). */
  baseUrl: string;
  /** Secret the Clipei sends us on inbound webhooks (we verify it). */
  webhookSecret?: string;
  /** Secret we send to Clipei when replying. */
  responseSecret: string;
}

export interface ClipeiInstanceState {
  client: ClipeiClient;
  config: ClipeiConfig;
  dedupeCache: DedupeCache;
}

export enum ClipeiErrorCode {
  INVALID_CONFIG = 'INVALID_CONFIG',
  SEND_FAILED = 'SEND_FAILED',
}

export class ClipeiError extends Error {
  constructor(
    readonly code: ClipeiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClipeiError';
  }
}
