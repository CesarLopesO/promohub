export type WhatsAppCommandPayload = {
  sessionId: string;
  requestedAt: string;
};

export type WhatsAppSessionStartJob = WhatsAppCommandPayload;
export type WhatsAppSessionStopJob = WhatsAppCommandPayload;
export type WhatsAppSessionReconnectJob = WhatsAppCommandPayload;
export type WhatsAppGroupsSyncJob = WhatsAppCommandPayload;
