export const QueueName = {
  WHATSAPP_SESSION_START: "whatsapp.session.start",
  WHATSAPP_SESSION_STOP: "whatsapp.session.stop",
  WHATSAPP_SESSION_RECONNECT: "whatsapp.session.reconnect",
  WHATSAPP_GROUPS_SYNC: "whatsapp.groups.sync",
  WHATSAPP_MESSAGE_RECEIVED: "whatsapp.message.received",
  AFFILIATE_REWRITE: "affiliate.rewrite",
  WHATSAPP_MESSAGE_FORWARD: "whatsapp.message.forward",
  MEDIA_DOWNLOAD: "media.download",
} as const;

export type QueueName = (typeof QueueName)[keyof typeof QueueName];

export const WhatsAppCommandQueue = {
  SESSION_START: QueueName.WHATSAPP_SESSION_START,
  SESSION_STOP: QueueName.WHATSAPP_SESSION_STOP,
  SESSION_RECONNECT: QueueName.WHATSAPP_SESSION_RECONNECT,
  GROUPS_SYNC: QueueName.WHATSAPP_GROUPS_SYNC,
} as const;

export type WhatsAppCommand = keyof typeof WhatsAppCommandQueue;
