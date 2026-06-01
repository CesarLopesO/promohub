-- CreateTable
CREATE TABLE "WhatsAppGroup" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "groupJid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "isCommunity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppGroup_sessionId_groupJid_key" ON "WhatsAppGroup"("sessionId", "groupJid");

-- CreateIndex
CREATE INDEX "WhatsAppGroup_sessionId_idx" ON "WhatsAppGroup"("sessionId");

-- CreateIndex
CREATE INDEX "WhatsAppGroup_groupJid_idx" ON "WhatsAppGroup"("groupJid");

-- AddForeignKey
ALTER TABLE "WhatsAppGroup" ADD CONSTRAINT "WhatsAppGroup_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WhatsAppSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;
