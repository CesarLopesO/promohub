CREATE TYPE "WorkerNodeStatus" AS ENUM (
  'STARTING',
  'ACTIVE',
  'DRAINING',
  'STALE',
  'STOPPED'
);

CREATE TABLE "WorkerNode" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "WorkerNodeStatus" NOT NULL DEFAULT 'STARTING',
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL,
  "maxSessions" INTEGER NOT NULL,
  "currentSessions" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkerNode_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WhatsAppSession"
ADD COLUMN "workerId" TEXT,
ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
ADD COLUMN "workerLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "workerLeaseToken" TEXT;

CREATE UNIQUE INDEX "WorkerNode_name_key" ON "WorkerNode"("name");
CREATE INDEX "WorkerNode_status_lastHeartbeatAt_idx"
ON "WorkerNode"("status", "lastHeartbeatAt");
CREATE INDEX "WhatsAppSession_workerId_idx"
ON "WhatsAppSession"("workerId");
CREATE INDEX "WhatsAppSession_workerId_lastHeartbeatAt_idx"
ON "WhatsAppSession"("workerId", "lastHeartbeatAt");
CREATE INDEX "WhatsAppSession_workerLeaseExpiresAt_idx"
ON "WhatsAppSession"("workerLeaseExpiresAt");

ALTER TABLE "WhatsAppSession"
ADD CONSTRAINT "WhatsAppSession_workerId_fkey"
FOREIGN KEY ("workerId") REFERENCES "WorkerNode"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
