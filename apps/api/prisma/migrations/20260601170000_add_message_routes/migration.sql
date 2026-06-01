CREATE TABLE "MessageRoute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceGroupJid" TEXT NOT NULL,
    "destinationGroupJid" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageRoute_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageRoute_sessionId_sourceGroupJid_destinationGroupJid_key" ON "MessageRoute"("sessionId", "sourceGroupJid", "destinationGroupJid");

CREATE INDEX "MessageRoute_userId_idx" ON "MessageRoute"("userId");

CREATE INDEX "MessageRoute_sessionId_idx" ON "MessageRoute"("sessionId");

CREATE INDEX "MessageRoute_sourceGroupJid_idx" ON "MessageRoute"("sourceGroupJid");

CREATE INDEX "MessageRoute_destinationGroupJid_idx" ON "MessageRoute"("destinationGroupJid");
