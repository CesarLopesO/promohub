import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient, type WorkerNode } from "@prisma/client";

@Injectable()
export class WorkerNodeService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma = new PrismaClient();
  private currentWorker?: WorkerNode;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async register(): Promise<WorkerNode> {
    const now = new Date();
    const worker = await this.prisma.workerNode.upsert({
      where: { name: this.workerName() },
      create: {
        name: this.workerName(),
        status: "STARTING",
        lastHeartbeatAt: now,
        maxSessions: this.maxSessions(),
        currentSessions: 0,
      },
      update: {
        status: "STARTING",
        lastHeartbeatAt: now,
        maxSessions: this.maxSessions(),
        currentSessions: 0,
      },
    });

    this.currentWorker = await this.prisma.workerNode.update({
      where: { id: worker.id },
      data: {
        status: "ACTIVE",
        lastHeartbeatAt: new Date(),
        maxSessions: this.maxSessions(),
        currentSessions: 0,
      },
    });

    return this.currentWorker;
  }

  async heartbeat(): Promise<WorkerNode> {
    const worker = this.requireCurrentWorker();
    this.currentWorker = await this.prisma.workerNode.update({
      where: { id: worker.id },
      data: {
        status: "ACTIVE",
        lastHeartbeatAt: new Date(),
        maxSessions: this.maxSessions(),
        currentSessions: 0,
      },
    });

    return this.currentWorker;
  }

  async stop(): Promise<void> {
    const worker = this.currentWorker;

    if (!worker) {
      return;
    }

    this.currentWorker = await this.prisma.workerNode.update({
      where: { id: worker.id },
      data: {
        status: "STOPPED",
        lastHeartbeatAt: new Date(),
        currentSessions: 0,
      },
    });
  }

  getCurrentWorker(): WorkerNode | undefined {
    return this.currentWorker;
  }

  heartbeatIntervalMs(): number {
    return this.readPositiveInt("WORKER_HEARTBEAT_INTERVAL_MS", 10_000);
  }

  private requireCurrentWorker(): WorkerNode {
    if (!this.currentWorker) {
      throw new Error("WorkerNode is not registered.");
    }

    return this.currentWorker;
  }

  private workerName(): string {
    return (
      this.config.get<string>("WORKER_NAME", "whatsapp-worker-1").trim() ||
      "whatsapp-worker-1"
    );
  }

  private maxSessions(): number {
    return this.readPositiveInt("WORKER_MAX_SESSIONS", 25);
  }

  private readPositiveInt(name: string, fallback: number): number {
    const parsed = Number.parseInt(this.config.get<string>(name, "") ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
