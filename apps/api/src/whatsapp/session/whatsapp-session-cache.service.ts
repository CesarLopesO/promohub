import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type RedisClientType } from "redis";

import type { WhatsAppSessionStatusDto } from "../dto/whatsapp-session-status.dto";

const SESSION_CACHE_TTL_SECONDS = 60 * 60;
const QR_CACHE_TTL_SECONDS = 120;

@Injectable()
export class WhatsAppSessionCacheService
  implements OnModuleInit, OnModuleDestroy
{
  private client?: RedisClientType;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>("REDIS_URL");

    if (!url) {
      return;
    }

    const client = createClient({ url });
    client.on("error", () => undefined);

    try {
      await client.connect();
      this.client = client as RedisClientType;
    } catch {
      await client.disconnect().catch(() => undefined);
    }
  }

  async onModuleDestroy() {
    await this.client?.disconnect().catch(() => undefined);
  }

  async setSession(status: WhatsAppSessionStatusDto): Promise<void> {
    await this.client
      ?.set(this.sessionKey(status.id), JSON.stringify(status), {
        EX: SESSION_CACHE_TTL_SECONDS,
      })
      .catch(() => undefined);
  }

  async setQr(
    id: string,
    qr: { qrCode?: string; qrCodeDataUrl?: string },
  ): Promise<void> {
    await this.client
      ?.set(this.qrKey(id), JSON.stringify(qr), {
        EX: QR_CACHE_TTL_SECONDS,
      })
      .catch(() => undefined);
  }

  async deleteSession(id: string): Promise<void> {
    await this.client
      ?.del([this.sessionKey(id), this.qrKey(id)])
      .catch(() => undefined);
  }

  private sessionKey(id: string): string {
    return `whatsapp:session:${id}`;
  }

  private qrKey(id: string): string {
    return `whatsapp:session:${id}:qr`;
  }
}
