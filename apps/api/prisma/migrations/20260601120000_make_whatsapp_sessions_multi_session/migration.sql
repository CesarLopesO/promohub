-- AlterTable
ALTER TABLE "WhatsAppSession" ADD COLUMN "sessionId" TEXT;
UPDATE "WhatsAppSession" SET "sessionId" = "id" WHERE "sessionId" IS NULL;
ALTER TABLE "WhatsAppSession" ALTER COLUMN "sessionId" SET NOT NULL;

-- Rework auth state ownership from userId to sessionId.
ALTER TABLE "WhatsAppAuthState" ADD COLUMN "sessionId" TEXT;
UPDATE "WhatsAppAuthState" auth
SET "sessionId" = session."sessionId"
FROM "WhatsAppSession" session
WHERE auth."userId" = session."userId";
ALTER TABLE "WhatsAppAuthState" ALTER COLUMN "sessionId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "WhatsAppAuthState" DROP CONSTRAINT "WhatsAppAuthState_userId_fkey";

-- DropIndex
DROP INDEX "WhatsAppSession_userId_key";
DROP INDEX "WhatsAppAuthState_userId_type_keyId_key";
DROP INDEX "WhatsAppAuthState_userId_idx";

-- AlterTable
ALTER TABLE "WhatsAppAuthState" DROP COLUMN "userId";

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_sessionId_key" ON "WhatsAppSession"("sessionId");
CREATE INDEX "WhatsAppSession_userId_idx" ON "WhatsAppSession"("userId");
CREATE INDEX "WhatsAppAuthState_sessionId_idx" ON "WhatsAppAuthState"("sessionId");
CREATE UNIQUE INDEX "WhatsAppAuthState_sessionId_type_keyId_key" ON "WhatsAppAuthState"("sessionId", "type", "keyId");

-- AddForeignKey
ALTER TABLE "WhatsAppAuthState" ADD CONSTRAINT "WhatsAppAuthState_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
