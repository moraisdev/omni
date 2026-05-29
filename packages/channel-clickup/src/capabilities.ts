/**
 * ClickUp Chat channel capabilities.
 */

import { DEFAULT_CAPABILITIES } from '@omni/channel-sdk';
import type { ChannelCapabilities } from '@omni/channel-sdk';

export const CLICKUP_CAPABILITIES: ChannelCapabilities = {
  ...DEFAULT_CAPABILITIES,
  canSendText: true,
  canSendMedia: false,
  canSendReaction: false,
  canSendTyping: false,
  canReceiveReadReceipts: false,
  canReceiveDeliveryReceipts: false,
  canEditMessage: false,
  canDeleteMessage: false,
  canReplyToMessage: false,
  canForwardMessage: false,
  canSendContact: false,
  canSendLocation: false,
  canSendSticker: false,
  canSendButtons: false,
  canHandleGroups: true,
  canHandleBroadcast: false,
  canHandleDMs: true,
  canStreamResponse: false,
  // ClickUp chat message limit is 40,000 chars.
  maxMessageLength: 40000,
  maxFileSize: 0,
  supportedMediaTypes: [],
};
