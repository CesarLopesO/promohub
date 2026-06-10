import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Worker, type ConnectionOptions } from "bullmq";

import type { WhatsAppCommandPayload } from "./job-contracts";
import { WhatsAppCommandQueue, type WhatsAppCommand } from "./queue-names";

@Injectable()
export class WhatsAppCommandProcessorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly processors: Worker[] = [];

  constructor(private readonly config: ConfigService) {}

  onApplicationBootstrap(): void {
    for (const command of Object.keys(
      WhatsAppCommandQueue,
    ) as WhatsAppCommand[]) {
      const processor = new Worker(
        WhatsAppCommandQueue[command],
        async (job) => {
          this.processCommand(command, job.data);
        },
        {
          connection: this.connectionOptions(),
        },
      );
      processor.on("error", (error) => {
        console.error(
          `[WORKER] queue_error command=${command} error=${error.name}`,
        );
      });
      this.processors.push(processor);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled(
      this.processors.map((processor) => processor.close()),
    );
  }

  processCommand(command: WhatsAppCommand, payload: unknown): boolean {
    if (!this.isValidPayload(payload)) {
      console.warn(
        `[WORKER] rejected command=${command} reason=INVALID_PAYLOAD dryRun=true`,
      );
      return false;
    }

    console.log(
      `[WORKER] received command=${command} sessionId=${payload.sessionId} dryRun=true`,
    );
    return true;
  }

  private isValidPayload(payload: unknown): payload is WhatsAppCommandPayload {
    if (!payload || typeof payload !== "object") {
      return false;
    }

    const candidate = payload as Record<string, unknown>;
    return (
      typeof candidate.sessionId === "string" &&
      candidate.sessionId.trim().length > 0 &&
      typeof candidate.requestedAt === "string" &&
      Number.isFinite(Date.parse(candidate.requestedAt)) &&
      Object.keys(candidate).every((key) =>
        ["sessionId", "requestedAt"].includes(key),
      )
    );
  }

  private connectionOptions(): ConnectionOptions {
    const parsed = new URL(
      this.config.get<string>("REDIS_URL", "redis://localhost:6379"),
    );
    return {
      host: parsed.hostname,
      port: Number.parseInt(parsed.port || "6379", 10),
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      db: parsed.pathname
        ? Number.parseInt(parsed.pathname.slice(1) || "0", 10)
        : 0,
      maxRetriesPerRequest: null,
      ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
    };
  }
}
