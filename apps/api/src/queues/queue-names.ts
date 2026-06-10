export const WhatsAppCommandQueue = {
  SESSION_START: "whatsapp.session.start",
  SESSION_STOP: "whatsapp.session.stop",
  SESSION_RECONNECT: "whatsapp.session.reconnect",
  GROUPS_SYNC: "whatsapp.groups.sync",
} as const;

export type WhatsAppCommand = keyof typeof WhatsAppCommandQueue;

export type WhatsAppCommandQueueName =
  (typeof WhatsAppCommandQueue)[WhatsAppCommand];
