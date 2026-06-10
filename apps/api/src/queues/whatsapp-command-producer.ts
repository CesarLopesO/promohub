import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue, type ConnectionOptions } from "bullmq";

import type { WhatsAppCommandPayload } from "./job-contracts";
import {
  WhatsAppCommandQueue,
  type WhatsAppCommand,
  type WhatsAppCommandQueueName,
} from "./queue-names";

type QueueLike = {
  add(
    name: string,
    data: WhatsAppCommandPayload,
    options: { jobId: string; removeOnComplete: number; removeOnFail: number },
  ): Promise<unknown>;
  close(): Promise<void>;
};

@Injectable()
export class WhatsAppCommandProducer implements OnModuleDestroy {
  private readonly queues = new Map<WhatsAppCommandQueueName, QueueLike>();

  constructor(private readonly config: ConfigService) {}

  publishSessionStart(sessionId: string): Promise<boolean> {
    return this.publish("SESSION_START", sessionId, "session-start");
  }

  publishSessionStop(sessionId: string): Promise<boolean> {
    return this.publish("SESSION_STOP", sessionId, "session-stop");
  }

  publishSessionReconnect(sessionId: string): Promise<boolean> {
    return this.publish("SESSION_RECONNECT", sessionId, "session-reconnect");
  }

  publishGroupsSync(sessionId: string): Promise<boolean> {
    return this.publish("GROUPS_SYNC", sessionId, "groups-sync");
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(
      [...this.queues.values()].map((queue) => queue.close()),
    );
  }

  private async publish(
    command: WhatsAppCommand,
    sessionId: string,
    jobIdPrefix: string,
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    const normalizedSessionId = sessionId.trim();

    if (!normalizedSessionId) {
      return false;
    }

    const payload: WhatsAppCommandPayload = {
      sessionId: normalizedSessionId,
      requestedAt: new Date().toISOString(),
    };

    try {
      await this.getQueue(WhatsAppCommandQueue[command]).add(command, payload, {
        // BullMQ rejects ":" in custom IDs, so use the deterministic
        // separator accepted by the library.
        jobId: `${jobIdPrefix}-${normalizedSessionId}`,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      console.log(
        `[QUEUE] published command=${command} sessionId=${normalizedSessionId}`,
      );
      return true;
    } catch (error) {
      console.error(
        `[QUEUE] publish_failed command=${command} sessionId=${normalizedSessionId} error=${error instanceof Error ? error.name : "UnknownError"}`,
      );
      return false;
    }
  }

  private getQueue(name: WhatsAppCommandQueueName): QueueLike {
    const existing = this.queues.get(name);

    if (existing) {
      return existing;
    }

    const queue = new Queue<WhatsAppCommandPayload>(name, {
      connection: this.connectionOptions(),
    });
    const queueLike = queue as unknown as QueueLike;
    this.queues.set(name, queueLike);

    return queueLike;
  }

  private connectionOptions(): ConnectionOptions {
    const redisUrl = this.config.get<string>(
      "REDIS_URL",
      "redis://localhost:6379",
    );
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: Number.parseInt(parsed.port || "6379", 10),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      db: parsed.pathname
        ? Number.parseInt(parsed.pathname.slice(1) || "0", 10)
        : 0,
      maxRetriesPerRequest: 1,
      ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    };
  }

  private isEnabled(): boolean {
    return (
      this.config
        .get<string>("WHATSAPP_QUEUE_COMMANDS_ENABLED", "false")
        .trim()
        .toLowerCase() === "true"
    );
  }
}
