DROP INDEX IF EXISTS "MessageRoute_sessionId_sourceGroupJid_destinationGroupJid_key";

CREATE UNIQUE INDEX "MessageRoute_userId_sessionId_sourceGroupJid_destinationGroupJid_key"
ON "MessageRoute"("userId", "sessionId", "sourceGroupJid", "destinationGroupJid");
