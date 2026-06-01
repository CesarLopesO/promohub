CREATE TABLE "ForwardedMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceMessageId" TEXT NOT NULL,
    "sourceGroupJid" TEXT NOT NULL,
    "destinationGroupJid" TEXT NOT NULL,
    "originalText" TEXT,
    "rewrittenText" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForwardedMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ForwardedMessage_userId_idx" ON "ForwardedMessage"("userId");

CREATE INDEX "ForwardedMessage_sessionId_idx" ON "ForwardedMessage"("sessionId");

CREATE INDEX "ForwardedMessage_sourceMessageId_idx" ON "ForwardedMessage"("sourceMessageId");

CREATE INDEX "ForwardedMessage_destinationGroupJid_idx" ON "ForwardedMessage"("destinationGroupJid");

CREATE INDEX "ForwardedMessage_status_idx" ON "ForwardedMessage"("status");
