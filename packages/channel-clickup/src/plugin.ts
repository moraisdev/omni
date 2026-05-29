/**
 * ClickUp Chat channel plugin for Omni.
 *
 * Inbound:  ClickUp Chat Automation ("Message is posted") POSTs to
 *           /api/v2/channels/clickup/{instanceId}/webhook → handleWebhook.
 * Outbound: sendMessage → POST v3 chat message.
 *
 * The ClickUp Chat API is experimental; field shapes are parsed defensively.
 */

import { BaseChannelPlugin, createInboundDedupeCache } from '@omni/channel-sdk';
import type { ChannelCapabilities, InstanceConfig, OutgoingMessage, SendResult } from '@omni/channel-sdk';
import type { Logger } from '@omni/core';
import type { ChannelType, ContentType } from '@omni/core/types';

import { CLICKUP_CAPABILITIES } from './capabilities';
import { ClickUpClient } from './client';
import { handleClickUpWebhook } from './handlers/webhooks';
import { type ClickUpConfig, ClickUpError, ClickUpErrorCode, type ClickUpInstanceState } from './types';

export class ClickUpPlugin extends BaseChannelPlugin {
  readonly id: ChannelType = 'clickup';
  readonly name = 'ClickUp Chat';
  readonly version = '0.1.0';
  readonly capabilities: ChannelCapabilities = CLICKUP_CAPABILITIES;

  private clickupInstances = new Map<string, ClickUpInstanceState>();

  /** Expose the plugin logger to the webhook handler. */
  getLogger(): Logger {
    return this.logger as unknown as Logger;
  }

  protected override async onDestroy(): Promise<void> {
    for (const [, state] of this.clickupInstances) {
      state.dedupeCache.dispose();
    }
    this.clickupInstances.clear();
  }

  async connect(instanceId: string, config: InstanceConfig): Promise<void> {
    const creds = config.credentials ?? {};
    const opts = config.options ?? {};

    const apiToken = (creds.apiToken ?? opts.apiToken) as string | undefined;
    const workspaceId = (creds.workspaceId ?? opts.workspaceId) as string | undefined;
    const webhookSecret = (creds.webhookSecret ?? opts.webhookSecret) as string | undefined;

    if (!apiToken) throw new ClickUpError(ClickUpErrorCode.INVALID_CONFIG, 'apiToken is required');
    if (!workspaceId) throw new ClickUpError(ClickUpErrorCode.INVALID_CONFIG, 'workspaceId is required');

    this.logger.info('Connecting ClickUp instance', { instanceId, workspaceId });

    const client = new ClickUpClient(apiToken, workspaceId);
    const valid = await client.validateCredentials();
    if (!valid) {
      throw new ClickUpError(
        ClickUpErrorCode.AUTH_FAILED,
        'ClickUp credential validation failed — check apiToken and workspaceId',
      );
    }

    const clickupConfig: ClickUpConfig = { apiToken, workspaceId, webhookSecret };
    const dedupeCache = createInboundDedupeCache();

    this.clickupInstances.set(instanceId, { client, config: clickupConfig, dedupeCache });

    await this.updateInstanceStatus(instanceId, config, {
      state: 'connected',
      since: new Date(),
      message: 'Connected via ClickUp Chat API',
    });

    await this.emitInstanceConnected(instanceId, {
      profileName: 'ClickUp Chat',
      ownerIdentifier: workspaceId,
    });
  }

  async disconnect(instanceId: string): Promise<void> {
    const state = this.clickupInstances.get(instanceId);
    if (state) {
      state.dedupeCache.dispose();
      this.clickupInstances.delete(instanceId);
    }
    await this.emitInstanceDisconnected(instanceId, 'Disconnected by request', false);
  }

  async sendMessage(instanceId: string, message: OutgoingMessage): Promise<SendResult> {
    const state = this.clickupInstances.get(instanceId);
    if (!state) {
      return { success: false, error: 'ClickUp instance not connected', retryable: false, timestamp: Date.now() };
    }

    const text = message.content.text;
    if (!text) {
      return { success: false, error: 'ClickUp channel only supports text', retryable: false, timestamp: Date.now() };
    }

    try {
      const { messageId } = await state.client.sendMessage(message.to, text);

      await this.emitMessageSent({
        instanceId,
        externalId: messageId,
        chatId: message.to,
        to: message.to,
        content: { type: 'text' as ContentType, text },
        senderAgentId: message.metadata?.senderAgentId as string | undefined,
      });

      return { success: true, messageId, timestamp: Date.now() };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const retryable = error instanceof ClickUpError && error.code === ClickUpErrorCode.RATE_LIMITED;
      await this.emitMessageFailed({ instanceId, chatId: message.to, error: errorMessage, retryable });
      return { success: false, error: errorMessage, retryable, timestamp: Date.now() };
    }
  }

  /** Entry point for the API webhook route. */
  async handleWebhook(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const instanceId = pathParts[pathParts.indexOf('clickup') + 1] ?? '';

    const state = this.clickupInstances.get(instanceId);
    if (!state) return new Response('Instance not found', { status: 404 });

    return handleClickUpWebhook(request, this, instanceId, state);
  }

  /** Normalize a parsed ClickUp message and emit it as an inbound Omni event. */
  async handleMessageReceived(params: {
    instanceId: string;
    externalId: string;
    chatId: string;
    from: string;
    text: string;
    replyToId?: string;
    rawPayload?: Record<string, unknown>;
  }): Promise<void> {
    await this.emitMessageReceived({
      instanceId: params.instanceId,
      externalId: params.externalId,
      chatId: params.chatId,
      from: params.from,
      content: { type: 'text' as ContentType, text: params.text },
      replyToId: params.replyToId,
      rawPayload: params.rawPayload,
    });
  }
}
