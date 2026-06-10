import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type RedisClientType } from "redis";

type MemoryEntry = {
  count: number;
  expiresAt: number;
};

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly memory = new Map<string, MemoryEntry>();
  private redis?: RedisClientType;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url =
      this.config.get<string>("RATE_LIMIT_REDIS_URL")?.trim() ||
      this.config.get<string>("REDIS_URL")?.trim();

    if (!url || !this.enabled()) {
      return;
    }

    const redis = createClient({ url });
    redis.on("error", (error) => {
      this.logger.warn(`Redis rate limit unavailable: ${String(error)}`);
    });

    try {
      await redis.connect();
      this.redis = redis as RedisClientType;
    } catch (error) {
      this.logger.warn(`Using in-memory rate limit: ${String(error)}`);
      await redis.disconnect().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis?.isOpen) {
      await this.redis.quit();
    }
  }

  enabled(): boolean {
    return this.config.get<string>("RATE_LIMIT_ENABLED", "true") !== "false";
  }

  async increment(key: string, windowMs: number): Promise<number> {
    if (this.redis?.isReady) {
      const count = await this.redis.incr(key);
      if (count === 1) {
        await this.redis.pExpire(key, windowMs);
      }
      return count;
    }

    const now = Date.now();
    const existing = this.memory.get(key);
    const entry =
      !existing || existing.expiresAt <= now
        ? { count: 0, expiresAt: now + windowMs }
        : existing;
    entry.count += 1;
    this.memory.set(key, entry);
    return entry.count;
  }
}
