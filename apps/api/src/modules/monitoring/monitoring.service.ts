import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma.service";

type HealthDto = {
  status: "ok" | "degraded";
  database: "ok" | "error";
  redis: "ok" | "error" | "unknown";
  connectedSessions: number;
  activeRoutes: number;
  lastForwardAt?: Date;
};

type MonitoringStatsDto = {
  userId?: string;
  sessions: {
    total: number;
    connected: number;
  };
  groups: {
    total: number;
  };
  messages: {
    total: number;
    withLinks: number;
    images: number;
    lastCapturedAt?: Date;
  };
  routes: {
    total: number;
    active: number;
  };
  forwards: {
    total: number;
    sent: number;
    failed: number;
    auto: number;
    manual: number;
    images: number;
    text: number;
    fallbacks: number;
    lastSentAt?: Date;
  };
};

type ForwardErrorDto = {
  id: string;
  sourceMessageId: string;
  destinationGroupJid: string;
  error?: string;
  createdAt: Date;
};

type RecentActivityDto = {
  recentMessages: Array<{
    id: string;
    sessionId: string;
    groupJid: string;
    messageType: string;
    text?: string;
    links: string[];
    marketplaces: string[];
    createdAt: Date;
  }>;
  recentForwards: Array<{
    id: string;
    sourceMessageId: string;
    destinationGroupJid: string;
    status: string;
    mode?: string;
    sentMessageType?: string;
    mediaForwarded: boolean;
    createdAt: Date;
  }>;
};

const SENT_STATUSES = ["SENT", "SENT_TEXT_FALLBACK"];
const TEXT_PREVIEW_LIMIT = 180;

@Injectable()
export class MonitoringService {
  constructor(private readonly prisma: PrismaService) {}

  async health(): Promise<HealthDto> {
    const database = await this.checkDatabase();
    const [connectedSessions, activeRoutes, lastForward] = await Promise.all([
      this.prisma.whatsAppSession.count({
        where: {
          status: "CONNECTED",
        },
      }),
      this.prisma.messageRoute.count({
        where: {
          isActive: true,
        },
      }),
      this.prisma.forwardedMessage.findFirst({
        where: {
          sentAt: {
            not: null,
          },
        },
        orderBy: {
          sentAt: "desc",
        },
        select: {
          sentAt: true,
        },
      }),
    ]);

    return {
      status: database === "ok" ? "ok" : "degraded",
      database,
      redis: "unknown",
      connectedSessions,
      activeRoutes,
      lastForwardAt: lastForward?.sentAt ?? undefined,
    };
  }

  async stats(userId?: string): Promise<MonitoringStatsDto> {
    const normalizedUserId = this.normalizeOptionalString(userId);
    const sessionWhere = normalizedUserId ? { userId: normalizedUserId } : {};
    const sessionIds = await this.findSessionIds(normalizedUserId);
    const bySessionId = this.bySessionId(sessionIds);
    const byUserId = normalizedUserId ? { userId: normalizedUserId } : {};

    const [
      totalSessions,
      connectedSessions,
      totalGroups,
      messageRows,
      imageMessages,
      lastMessage,
      totalRoutes,
      activeRoutes,
      totalForwards,
      sentForwards,
      failedForwards,
      autoForwards,
      manualForwards,
      imageForwards,
      textForwards,
      fallbackForwards,
      lastForward,
    ] = await Promise.all([
      this.prisma.whatsAppSession.count({ where: sessionWhere }),
      this.prisma.whatsAppSession.count({
        where: {
          ...sessionWhere,
          status: "CONNECTED",
        },
      }),
      this.prisma.whatsAppGroup.count({ where: bySessionId }),
      this.prisma.whatsAppMessage.findMany({
        where: bySessionId,
        select: {
          links: true,
        },
      }),
      this.prisma.whatsAppMessage.count({
        where: {
          ...bySessionId,
          messageType: "image",
        },
      }),
      this.prisma.whatsAppMessage.findFirst({
        where: bySessionId,
        orderBy: {
          createdAt: "desc",
        },
        select: {
          createdAt: true,
        },
      }),
      this.prisma.messageRoute.count({ where: byUserId }),
      this.prisma.messageRoute.count({
        where: {
          ...byUserId,
          isActive: true,
        },
      }),
      this.prisma.forwardedMessage.count({ where: byUserId }),
      this.prisma.forwardedMessage.count({
        where: {
          ...byUserId,
          status: {
            in: SENT_STATUSES,
          },
        },
      }),
      this.prisma.forwardedMessage.count({
        where: {
          ...byUserId,
          status: "FAILED",
        },
      }),
      this.prisma.forwardedMessage.count({
        where: {
          ...byUserId,
          mode: "AUTO",
        },
      }),
      this.prisma.forwardedMessage.count({
        where: {
          ...byUserId,
          mode: "MANUAL",
        },
      }),
      this.prisma.forwardedMessage.count({
        where: {
          ...byUserId,
          mediaForwarded: true,
        },
      }),
      this.prisma.forwardedMessage.count({
        where: {
          ...byUserId,
          sentMessageType: "text",
        },
      }),
      this.prisma.forwardedMessage.count({
        where: {
          ...byUserId,
          sentMessageType: "text_fallback",
        },
      }),
      this.prisma.forwardedMessage.findFirst({
        where: {
          ...byUserId,
          sentAt: {
            not: null,
          },
        },
        orderBy: {
          sentAt: "desc",
        },
        select: {
          sentAt: true,
        },
      }),
    ]);

    return {
      userId: normalizedUserId,
      sessions: {
        total: totalSessions,
        connected: connectedSessions,
      },
      groups: {
        total: totalGroups,
      },
      messages: {
        total: messageRows.length,
        withLinks: messageRows.filter((message) => this.hasLinks(message.links))
          .length,
        images: imageMessages,
        lastCapturedAt: lastMessage?.createdAt ?? undefined,
      },
      routes: {
        total: totalRoutes,
        active: activeRoutes,
      },
      forwards: {
        total: totalForwards,
        sent: sentForwards,
        failed: failedForwards,
        auto: autoForwards,
        manual: manualForwards,
        images: imageForwards,
        text: textForwards,
        fallbacks: fallbackForwards,
        lastSentAt: lastForward?.sentAt ?? undefined,
      },
    };
  }

  async forwardErrors(userId?: string): Promise<ForwardErrorDto[]> {
    const normalizedUserId = this.normalizeOptionalString(userId);
    const rows = await this.prisma.forwardedMessage.findMany({
      where: {
        ...(normalizedUserId ? { userId: normalizedUserId } : {}),
        status: "FAILED",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      select: {
        id: true,
        sourceMessageId: true,
        destinationGroupJid: true,
        error: true,
        createdAt: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      sourceMessageId: row.sourceMessageId,
      destinationGroupJid: row.destinationGroupJid,
      error: row.error ?? undefined,
      createdAt: row.createdAt,
    }));
  }

  async recentActivity(userId?: string): Promise<RecentActivityDto> {
    const normalizedUserId = this.normalizeOptionalString(userId);
    const sessionIds = await this.findSessionIds(normalizedUserId);
    const recentMessages = await this.prisma.whatsAppMessage.findMany({
      where: this.bySessionId(sessionIds),
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      select: {
        id: true,
        sessionId: true,
        groupJid: true,
        messageType: true,
        text: true,
        links: true,
        marketplaces: true,
        createdAt: true,
      },
    });
    const recentForwards = await this.prisma.forwardedMessage.findMany({
      where: {
        ...(normalizedUserId ? { userId: normalizedUserId } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 10,
      select: {
        id: true,
        sourceMessageId: true,
        destinationGroupJid: true,
        status: true,
        mode: true,
        sentMessageType: true,
        mediaForwarded: true,
        createdAt: true,
      },
    });

    return {
      recentMessages: recentMessages.map((message) => ({
        id: message.id,
        sessionId: message.sessionId,
        groupJid: message.groupJid,
        messageType: message.messageType,
        text: this.summarizeText(message.text),
        links: this.readStringArray(message.links),
        marketplaces: this.readStringArray(message.marketplaces),
        createdAt: message.createdAt,
      })),
      recentForwards: recentForwards.map((message) => ({
        id: message.id,
        sourceMessageId: message.sourceMessageId,
        destinationGroupJid: message.destinationGroupJid,
        status: message.status,
        mode: message.mode ?? undefined,
        sentMessageType: message.sentMessageType ?? undefined,
        mediaForwarded: message.mediaForwarded,
        createdAt: message.createdAt,
      })),
    };
  }

  private async checkDatabase(): Promise<"ok" | "error"> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return "ok";
    } catch {
      return "error";
    }
  }

  private async findSessionIds(userId?: string): Promise<string[] | undefined> {
    if (!userId) {
      return undefined;
    }

    const sessions = await this.prisma.whatsAppSession.findMany({
      where: {
        userId,
      },
      select: {
        sessionId: true,
      },
    });

    return sessions.map((session) => session.sessionId);
  }

  private bySessionId(
    sessionIds: string[] | undefined,
  ): Prisma.WhatsAppMessageWhereInput & Prisma.WhatsAppGroupWhereInput {
    if (!sessionIds) {
      return {};
    }

    return {
      sessionId: {
        in: sessionIds,
      },
    };
  }

  private hasLinks(value: Prisma.JsonValue | null): boolean {
    return this.readStringArray(value).length > 0;
  }

  private readStringArray(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === "string");
  }

  private summarizeText(value: string | null): string | undefined {
    if (!value) {
      return undefined;
    }

    if (value.length <= TEXT_PREVIEW_LIMIT) {
      return value;
    }

    return `${value.slice(0, TEXT_PREVIEW_LIMIT)}...`;
  }

  private normalizeOptionalString(value?: string): string | undefined {
    if (!value || typeof value !== "string" || !value.trim()) {
      return undefined;
    }

    return value.trim();
  }
}
