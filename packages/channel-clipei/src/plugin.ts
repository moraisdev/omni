import { BaseChannelPlugin, createInboundDedupeCache } from '@omni/channel-sdk';
import type { ChannelCapabilities, InstanceConfig, OutgoingMessage, SendResult } from '@omni/channel-sdk';
import type { Logger } from '@omni/core';
import type { ChannelType, ContentType } from '@omni/core/types';

import { CLIPEI_CAPABILITIES } from './capabilities';
import { ClipeiClient } from './client';
import { parseHandoff } from './handoff';
import { handleClipeiWebhook } from './handlers/webhook';
import { type ClipeiConfig, ClipeiError, ClipeiErrorCode, type ClipeiInstanceState } from './types';

export class ClipeiPlugin extends BaseChannelPlugin {
  readonly id: ChannelType = 'clipei';
  readonly name = 'Clipei Support';
  readonly version = '0.1.0';
  readonly capabilities: ChannelCapabilities = CLIPEI_CAPABILITIES;

  private clipeiInstances = new Map<string, ClipeiInstanceState>();

  getLogger(): Logger {
    return this.logger as unknown as Logger;
  }

  protected override async onDestroy(): Promise<void> {
    for (const [, state] of this.clipeiInstances) state.dedupeCache.dispose();
    this.clipeiInstances.clear();
  }

  async connect(instanceId: string, config: InstanceConfig): Promise<void> {
    const creds = config.credentials ?? {};
    const opts = config.options ?? {};
    const baseUrl = (creds.baseUrl ?? opts.baseUrl) as string | undefined;
    const responseSecret = (creds.responseSecret ?? opts.responseSecret) as string | undefined;
    const webhookSecret = (creds.webhookSecret ?? opts.webhookSecret) as string | undefined;

    if (!baseUrl) throw new ClipeiError(ClipeiErrorCode.INVALID_CONFIG, 'baseUrl is required');
    if (!responseSecret) throw new ClipeiError(ClipeiErrorCode.INVALID_CONFIG, 'responseSecret is required');

    const client = new ClipeiClient(baseUrl, responseSecret);
    const cfg: ClipeiConfig = { baseUrl, responseSecret, webhookSecret };
    this.clipeiInstances.set(instanceId, { client, config: cfg, dedupeCache: createInboundDedupeCache() });

    await this.updateInstanceStatus(instanceId, config, {
      state: 'connected',
      since: new Date(),
      message: 'Connected to Clipei support',
    });
    await this.emitInstanceConnected(instanceId, { profileName: 'Clipei Support', ownerIdentifier: baseUrl });
  }

  async disconnect(instanceId: string): Promise<void> {
    const state = this.clipeiInstances.get(instanceId);
    if (state) {
      state.dedupeCache.dispose();
      this.clipeiInstances.delete(instanceId);
    }
    await this.emitInstanceDisconnected(instanceId, 'Disconnected by request', false);
  }

  async sendMessage(instanceId: string, message: OutgoingMessage): Promise<SendResult> {
    const state = this.clipeiInstances.get(instanceId);
    if (!state) {
      return { success: false, error: 'Clipei instance not connected', retryable: false, timestamp: Date.now() };
    }
    const text = message.content.text;
    if (!text) {
      return { success: false, error: 'Clipei channel only supports text', retryable: false, timestamp: Date.now() };
    }
    try {
      const ho = parseHandoff(text);
      if (ho.isHandoff) {
        const { messageId } = await state.client.handoff(message.to, ho.reason);
        await this.emitMessageSent({
          instanceId,
          externalId: messageId,
          chatId: message.to,
          to: message.to,
          content: { type: 'text' as ContentType, text },
          senderAgentId: message.metadata?.senderAgentId as string | undefined,
        });
        return { success: true, messageId, timestamp: Date.now() };
      }
      const { messageId } = await state.client.reply(message.to, text);
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
      await this.emitMessageFailed({ instanceId, chatId: message.to, error: errorMessage, retryable: false });
      return { success: false, error: errorMessage, retryable: false, timestamp: Date.now() };
    }
  }

  async handleWebhook(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    const instanceId = parts[parts.indexOf('clipei') + 1] ?? '';
    const state = this.clipeiInstances.get(instanceId);
    if (!state) return new Response('Instance not found', { status: 404 });
    return handleClipeiWebhook(request, this, instanceId, state);
  }

  async handleMessageReceived(params: {
    instanceId: string;
    externalId: string;
    chatId: string;
    from: string;
    text: string;
  }): Promise<void> {
    await this.emitMessageReceived({
      instanceId: params.instanceId,
      externalId: params.externalId,
      chatId: params.chatId,
      from: params.from,
      content: { type: 'text' as ContentType, text: params.text },
    });
  }
}
