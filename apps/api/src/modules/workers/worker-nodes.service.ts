import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { WorkerNode } from "@prisma/client";

import { PrismaService } from "../../prisma.service";

@Injectable()
export class WorkerNodesService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private currentWorker?: WorkerNode;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.runtimeMode() !== "embedded") {
      return;
    }

    await this.registerEmbeddedWorker();
    this.heartbeatTimer = setInterval(() => {
      void this.heartbeat().catch((error: unknown) => {
        console.error(
          `[WORKER] heartbeat_failed name=${this.workerName()} error=${this.errorName(error)}`,
        );
      });
    }, this.heartbeatIntervalMs());
    this.heartbeatTimer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    if (this.currentWorker) {
      await this.markStopped().catch(() => undefined);
    }
  }

  async registerEmbeddedWorker(): Promise<WorkerNode> {
    if (this.currentWorker) {
      return this.currentWorker;
    }

    const now = new Date();
    const worker = await this.prisma.workerNode.upsert({
      where: { name: this.workerName() },
      create: {
        name: this.workerName(),
        status: "STARTING",
        lastHeartbeatAt: now,
        maxSessions: this.maxSessions(),
      },
      update: {
        status: "STARTING",
        lastHeartbeatAt: now,
        maxSessions: this.maxSessions(),
      },
    });
    this.currentWorker = await this.prisma.workerNode.update({
      where: { id: worker.id },
      data: {
        status: "ACTIVE",
        lastHeartbeatAt: new Date(),
      },
    });
    await this.recomputeCurrentSessions(this.currentWorker.id);
    console.log(`[WORKER] registered name=${this.currentWorker.name}`);

    return this.currentWorker;
  }

  async heartbeat(): Promise<WorkerNode> {
    const worker = await this.requireCurrentWorker();
    const now = new Date();

    await this.prisma.workerNode.updateMany({
      where: {
        id: { not: worker.id },
        status: { in: ["STARTING", "ACTIVE"] },
        lastHeartbeatAt: {
          lt: new Date(now.getTime() - this.staleAfterMs()),
        },
      },
      data: { status: "STALE" },
    });

    this.currentWorker = await this.prisma.workerNode.update({
      where: { id: worker.id },
      data: {
        status: "ACTIVE",
        lastHeartbeatAt: now,
        maxSessions: this.maxSessions(),
      },
    });
    await this.recomputeCurrentSessions(worker.id);
    console.log(`[WORKER] heartbeat name=${worker.name}`);

    return this.currentWorker;
  }

  async markDraining(): Promise<WorkerNode> {
    const worker = await this.requireCurrentWorker();
    this.currentWorker = await this.prisma.workerNode.update({
      where: { id: worker.id },
      data: { status: "DRAINING", lastHeartbeatAt: new Date() },
    });

    return this.currentWorker;
  }

  async markStopped(): Promise<WorkerNode> {
    const worker = await this.requireCurrentWorker();
    this.currentWorker = await this.prisma.workerNode.update({
      where: { id: worker.id },
      data: {
        status: "STOPPED",
        lastHeartbeatAt: new Date(),
        currentSessions: 0,
      },
    });

    return this.currentWorker;
  }

  getCurrentWorker(): WorkerNode | undefined {
    return this.currentWorker;
  }

  async listWorkers(): Promise<WorkerNode[]> {
    const staleBefore = new Date(Date.now() - this.staleAfterMs());
    await this.prisma.workerNode.updateMany({
      where: {
        status: { in: ["STARTING", "ACTIVE"] },
        lastHeartbeatAt: { lt: staleBefore },
      },
      data: { status: "STALE" },
    });

    return this.prisma.workerNode.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
  }

  async recomputeCurrentSessions(workerId: string): Promise<number> {
    const currentSessions = await this.prisma.whatsAppSession.count({
      where: {
        workerId,
        deletedAt: null,
        workerLeaseExpiresAt: { gt: new Date() },
      },
    });
    await this.prisma.workerNode.update({
      where: { id: workerId },
      data: { currentSessions },
    });

    if (this.currentWorker?.id === workerId) {
      this.currentWorker = {
        ...this.currentWorker,
        currentSessions,
      };
    }

    return currentSessions;
  }

  heartbeatIntervalMs(): number {
    return this.readPositiveInt("WORKER_HEARTBEAT_INTERVAL_MS", 10_000);
  }

  sessionLeaseMs(): number {
    return this.readPositiveInt("WORKER_SESSION_LEASE_MS", 30_000);
  }

  private async requireCurrentWorker(): Promise<WorkerNode> {
    return this.currentWorker ?? this.registerEmbeddedWorker();
  }

  private runtimeMode(): string {
    return this.config
      .get<string>("WHATSAPP_RUNTIME_MODE", "embedded")
      .trim()
      .toLowerCase();
  }

  private workerName(): string {
    return (
      this.config.get<string>("WORKER_NAME", "api-embedded-1").trim() ||
      "api-embedded-1"
    );
  }

  private maxSessions(): number {
    return this.readPositiveInt("WORKER_MAX_SESSIONS", 25);
  }

  private staleAfterMs(): number {
    return this.readPositiveInt("WORKER_STALE_AFTER_MS", 45_000);
  }

  private readPositiveInt(name: string, fallback: number): number {
    const parsed = Number.parseInt(this.config.get<string>(name, "") ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : "UnknownError";
  }
}
