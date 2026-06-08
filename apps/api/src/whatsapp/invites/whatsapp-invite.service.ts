import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import { WhatsAppSessionManager } from "../session/whatsapp-session.manager";

const INVITE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type InviteCacheEntry = {
  url: string;
  expiresAt: number;
};

@Injectable()
export class WhatsAppInviteService {
  private readonly cache = new Map<string, InviteCacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionManager: WhatsAppSessionManager,
  ) {}

  async getDestinationInviteUrl(
    sessionId: string,
    destinationGroupJid: string,
    overrideUrl?: string | null,
  ): Promise<string | null> {
    const override = overrideUrl?.trim();
    if (override) {
      return override;
    }

    const cacheKey = `${sessionId}:${destinationGroupJid}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(
        `[WHATSAPP_INVITE] cache hit groupJid=${destinationGroupJid}`,
      );
      return cached.url;
    }
    if (cached) {
      this.cache.delete(cacheKey);
    }

    try {
      const session = await this.prisma.whatsAppSession.findUnique({
        where: { sessionId },
        select: { id: true },
      });
      if (!session) {
        throw new Error("SESSION_NOT_FOUND");
      }

      const { socket } = await this.sessionManager.getConnectedSocket(
        session.id,
      );
      const code = await socket.groupInviteCode(destinationGroupJid);
      if (!code?.trim()) {
        throw new Error("EMPTY_INVITE_CODE");
      }

      const url = `https://chat.whatsapp.com/${code.trim()}`;
      this.cache.set(cacheKey, {
        url,
        expiresAt: Date.now() + INVITE_CACHE_TTL_MS,
      });
      console.log(
        `[WHATSAPP_INVITE] generated groupJid=${destinationGroupJid}`,
      );
      return url;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN";
      console.warn(
        `[WHATSAPP_INVITE] failed groupJid=${destinationGroupJid} reason=${reason}`,
      );
      return null;
    }
  }
}
