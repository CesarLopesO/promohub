import { Injectable } from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "node:crypto";

import { PrismaService } from "../../prisma.service";
import { WorkerNodesService } from "./worker-nodes.service";

export type SessionLease = {
  sessionId: string;
  leaseToken: string;
  workerId: string;
  workerName: string;
  expiresAt: Date;
};

@Injectable()
export class WorkerLeaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workers: WorkerNodesService,
  ) {}

  async acquireSessionLease(sessionId: string): Promise<SessionLease | null> {
    const worker =
      this.workers.getCurrentWorker() ??
      (await this.workers.registerEmbeddedWorker());
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.workers.sessionLeaseMs());
    const leaseToken = randomBytes(32).toString("hex");
    const result = await this.prisma.whatsAppSession.updateMany({
      where: {
        sessionId,
        deletedAt: null,
        OR: [
          { workerId: null },
          { workerLeaseExpiresAt: null },
          { workerLeaseExpiresAt: { lte: now } },
          { workerId: worker.id },
        ],
      },
      data: {
        workerId: worker.id,
        workerLeaseToken: leaseToken,
        workerLeaseExpiresAt: expiresAt,
        lastHeartbeatAt: now,
      },
    });

    if (result.count !== 1) {
      console.log(
        `[WORKER_LEASE] refused sessionId=${sessionId} reason=LEASE_OWNED`,
      );
      return null;
    }

    await this.workers.recomputeCurrentSessions(worker.id);
    console.log(
      `[WORKER_LEASE] acquired sessionId=${sessionId} worker=${worker.name}`,
    );

    return {
      sessionId,
      leaseToken,
      workerId: worker.id,
      workerName: worker.name,
      expiresAt,
    };
  }

  async renewSessionLease(
    sessionId: string,
    leaseToken: string,
  ): Promise<boolean> {
    const worker = this.workers.getCurrentWorker();

    if (!worker || !this.isPlausibleToken(leaseToken)) {
      return false;
    }

    const now = new Date();
    const result = await this.prisma.whatsAppSession.updateMany({
      where: {
        sessionId,
        workerId: worker.id,
        workerLeaseToken: leaseToken,
        deletedAt: null,
      },
      data: {
        lastHeartbeatAt: now,
        workerLeaseExpiresAt: new Date(
          now.getTime() + this.workers.sessionLeaseMs(),
        ),
      },
    });

    if (result.count === 1) {
      console.log(`[WORKER_LEASE] renewed sessionId=${sessionId}`);
      return true;
    }

    return false;
  }

  async releaseSessionLease(
    sessionId: string,
    leaseToken: string,
  ): Promise<boolean> {
    const worker = this.workers.getCurrentWorker();

    if (!worker || !this.isPlausibleToken(leaseToken)) {
      return false;
    }

    const result = await this.prisma.whatsAppSession.updateMany({
      where: {
        sessionId,
        workerId: worker.id,
        workerLeaseToken: leaseToken,
      },
      data: {
        workerId: null,
        workerLeaseToken: null,
        workerLeaseExpiresAt: null,
        lastHeartbeatAt: null,
      },
    });

    if (result.count !== 1) {
      return false;
    }

    await this.workers.recomputeCurrentSessions(worker.id);
    console.log(`[WORKER_LEASE] released sessionId=${sessionId}`);
    return true;
  }

  async assertLeaseOwner(
    sessionId: string,
    leaseToken: string,
  ): Promise<boolean> {
    const worker = this.workers.getCurrentWorker();

    if (!worker || !this.isPlausibleToken(leaseToken)) {
      return false;
    }

    const lease = await this.prisma.whatsAppSession.findFirst({
      where: {
        sessionId,
        workerId: worker.id,
        deletedAt: null,
        workerLeaseExpiresAt: { gt: new Date() },
      },
      select: { workerLeaseToken: true },
    });

    return (
      typeof lease?.workerLeaseToken === "string" &&
      this.tokensEqual(lease.workerLeaseToken, leaseToken)
    );
  }

  private isPlausibleToken(token: string): boolean {
    return typeof token === "string" && /^[a-f0-9]{64}$/u.test(token);
  }

  private tokensEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
