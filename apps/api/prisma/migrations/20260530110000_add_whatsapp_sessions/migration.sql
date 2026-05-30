-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'QR_READY', 'CONNECTED');

-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "qrCode" TEXT,
    "qrCodeDataUrl" TEXT,
    "phoneNumber" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "lastQrAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppAuthState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_userId_key" ON "WhatsAppSession"("userId");

-- CreateIndex
CREATE INDEX "WhatsAppSession_status_idx" ON "WhatsAppSession"("status");

-- CreateIndex
CREATE INDEX "WhatsAppAuthState_userId_idx" ON "WhatsAppAuthState"("userId");

-- CreateIndex
CREATE INDEX "WhatsAppAuthState_type_idx" ON "WhatsAppAuthState"("type");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAuthState_userId_type_keyId_key" ON "WhatsAppAuthState"("userId", "type", "keyId");

-- AddForeignKey
ALTER TABLE "WhatsAppAuthState" ADD CONSTRAINT "WhatsAppAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "WhatsAppSession"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
