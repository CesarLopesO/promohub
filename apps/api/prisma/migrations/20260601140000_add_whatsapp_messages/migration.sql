CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "groupJid" TEXT NOT NULL,
    "senderJid" TEXT,
    "messageId" TEXT NOT NULL,
    "messageType" TEXT NOT NULL,
    "text" TEXT,
    "hasMedia" BOOLEAN NOT NULL DEFAULT false,
    "rawMessage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppMessage_messageId_key" ON "WhatsAppMessage"("messageId");

CREATE INDEX "WhatsAppMessage_sessionId_idx" ON "WhatsAppMessage"("sessionId");

CREATE INDEX "WhatsAppMessage_groupJid_idx" ON "WhatsAppMessage"("groupJid");

CREATE INDEX "WhatsAppMessage_createdAt_idx" ON "WhatsAppMessage"("createdAt");

ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
