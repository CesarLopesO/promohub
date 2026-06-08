ALTER TABLE "WhatsAppSession" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "WhatsAppSession_userId_deletedAt_idx" ON "WhatsAppSession"("userId", "deletedAt");
CREATE INDEX "WhatsAppSession_deletedAt_idx" ON "WhatsAppSession"("deletedAt");
