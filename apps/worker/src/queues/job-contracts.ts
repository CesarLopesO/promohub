import type { QueueName } from "./queue-names";

export type WhatsAppSessionStartJob = {
  sessionId: string;
  requestedAt: string;
};

export type WhatsAppSessionStopJob = {
  sessionId: string;
  requestedAt: string;
};

export type WhatsAppSessionReconnectJob = {
  sessionId: string;
  requestedAt: string;
};

export type WhatsAppGroupsSyncJob = {
  sessionId: string;
  requestedAt: string;
};

export type WhatsAppMessageReceivedJob = {
  sessionId: string;
  messageId: string;
  sourceGroupJid: string;
  receivedAt: string;
};

export type AffiliateRewriteJob = {
  userId: string;
  sessionId: string;
  messageId: string;
  sourceGroupJid: string;
  text: string;
};

export type WhatsAppMessageForwardJob = {
  userId: string;
  sessionId: string;
  sourceMessageId: string;
  sourceGroupJid: string;
  destinationGroupJid: string;
};

export type MediaDownloadJob = {
  sessionId: string;
  messageId: string;
  sourceGroupJid: string;
};

export type QueueJobPayloads = {
  "whatsapp.session.start": WhatsAppSessionStartJob;
  "whatsapp.session.stop": WhatsAppSessionStopJob;
  "whatsapp.session.reconnect": WhatsAppSessionReconnectJob;
  "whatsapp.groups.sync": WhatsAppGroupsSyncJob;
  "whatsapp.message.received": WhatsAppMessageReceivedJob;
  "affiliate.rewrite": AffiliateRewriteJob;
  "whatsapp.message.forward": WhatsAppMessageForwardJob;
  "media.download": MediaDownloadJob;
};

export type WhatsAppCommandPayload =
  | WhatsAppSessionStartJob
  | WhatsAppSessionStopJob
  | WhatsAppSessionReconnectJob
  | WhatsAppGroupsSyncJob;

export type QueueJob<TName extends QueueName = QueueName> = {
  name: TName;
  data: QueueJobPayloads[TName];
};
