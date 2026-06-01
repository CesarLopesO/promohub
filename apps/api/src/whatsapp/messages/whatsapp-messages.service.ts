import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import type { WAMessage } from "@whiskeysockets/baileys";

import { PrismaService } from "../../prisma.service";
import {
  detectMarketplace,
  Marketplace,
} from "../../modules/affiliate/helpers/detect-marketplace";
import { MessageForwardingService } from "../../modules/routes/message-forwarding.service";
import type {
  WhatsAppMessageDto,
  WhatsAppMessageListDto,
} from "../dto/whatsapp-message.dto";
import {
  extractLinks,
  extractMessageText,
  getMessageType,
  isReactionMessage,
  messageHasMedia,
} from "./whatsapp-message.helpers";

type ListMessagesQuery = {
  groupJid?: string;
  includeRaw?: string;
  limit?: string;
  page?: string;
};

@Injectable()
export class WhatsAppMessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async listMessages(
    sessionRecordId: string,
    query: ListMessagesQuery,
  ): Promise<WhatsAppMessageListDto> {
    const session = await this.findSession(sessionRecordId);
    const limit = this.parsePositiveInteger(query.limit, "limit", 50, 100);
    const page = this.parsePositiveInteger(query.page, "page", 1, 10_000);
    const includeRaw = query.includeRaw === "true";

    const where: Prisma.WhatsAppMessageWhereInput = {
      sessionId: session.sessionId,
      ...(query.groupJid?.trim()
        ? {
            groupJid: query.groupJid.trim(),
          }
        : {}),
    };

    const [total, messages] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.count({ where }),
      this.prisma.whatsAppMessage.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: (page - 1) * limit,
      }),
    ]);

    return {
      sessionId: session.sessionId,
      page,
      limit,
      total,
      messages: messages.map((message) => this.toDto(message, includeRaw)),
    };
  }

  async listRecentMessages(
    sessionRecordId: string,
    includeRaw = false,
  ): Promise<WhatsAppMessageDto[]> {
    const session = await this.findSession(sessionRecordId);
    const messages = await this.prisma.whatsAppMessage.findMany({
      where: {
        sessionId: session.sessionId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return messages.map((message) => this.toDto(message, includeRaw));
  }

  async recordIncomingGroupMessage(
    sessionId: string,
    message: WAMessage,
  ): Promise<void> {
    const groupJid = message.key.remoteJid;
    const messageId = message.key.id;

    if (
      !groupJid ||
      !groupJid.endsWith("@g.us") ||
      message.key.fromMe ||
      !messageId ||
      isReactionMessage(message)
    ) {
      return;
    }

    const messageType = getMessageType(message);
    const text = extractMessageText(message);
    const links = extractLinks(text);
    const marketplaces = this.detectMarketplaces(links);

    try {
      const savedMessage = await this.prisma.whatsAppMessage.create({
        data: {
          sessionId,
          groupJid,
          senderJid: message.key.participant,
          messageId,
          messageType,
          text,
          hasMedia: messageHasMedia(messageType),
          links,
          marketplaces,
          rawMessage: this.toJson(message),
        },
        include: {
          session: true,
        },
      });

      if (links.length > 0) {
        this.runAutoForwardIfRouteExists(
          savedMessage.session.userId,
          savedMessage.id,
          savedMessage.sessionId,
          savedMessage.groupJid,
        );
      }
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        if (links.length > 0) {
          await this.prisma.whatsAppMessage.update({
            where: {
              messageId,
            },
            data: {
              text,
              links,
              marketplaces,
            },
          });
        }

        return;
      }

      throw error;
    }
  }

  private runAutoForwardIfRouteExists(
    userId: string,
    messageId: string,
    sessionId: string,
    sourceGroupJid: string,
  ): void {
    void this.prisma.messageRoute
      .findFirst({
        where: {
          userId,
          sessionId,
          sourceGroupJid,
          isActive: true,
        },
      })
      .then((route) => {
        if (!route) {
          console.log("[AUTO_FORWARD] skipped no active routes");
          return undefined;
        }

        return this.moduleRef
          .get(MessageForwardingService, { strict: false })
          .forwardMessageById(userId, messageId, { mode: "auto" });
      })
      .catch((error: unknown) => {
        console.log(
          `[AUTO_FORWARD] failed ${this.readErrorMessage(error)}`,
        );
      });
  }

  private async findSession(sessionRecordId: string) {
    const normalizedId = this.normalizeRequiredString(sessionRecordId, "id");
    const session = await this.prisma.whatsAppSession.findUnique({
      where: {
        id: normalizedId,
      },
    });

    if (!session) {
      throw new NotFoundException("WhatsApp session not found.");
    }

    return session;
  }

  private toDto(
    message: {
      id: string;
      sessionId: string;
      groupJid: string;
      senderJid: string | null;
      messageId: string;
      messageType: string;
      text: string | null;
      hasMedia: boolean;
      links: Prisma.JsonValue | null;
      marketplaces: Prisma.JsonValue | null;
      rawMessage: Prisma.JsonValue | null;
      createdAt: Date;
    },
    includeRaw: boolean,
  ): WhatsAppMessageDto {
    const dto: WhatsAppMessageDto = {
      id: message.id,
      sessionId: message.sessionId,
      groupJid: message.groupJid,
      senderJid: message.senderJid ?? undefined,
      messageId: message.messageId,
      messageType: message.messageType,
      text: message.text ?? undefined,
      hasMedia: message.hasMedia,
      links: this.readLinks(message.links, message.text),
      marketplaces: this.readMarketplaces(
        message.marketplaces,
        message.links,
        message.text,
      ),
      createdAt: message.createdAt,
    };

    if (includeRaw) {
      dto.rawMessage = message.rawMessage ?? undefined;
    }

    return dto;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private readLinks(
    value: Prisma.JsonValue | null,
    text: string | null,
  ): string[] {
    if (Array.isArray(value) && value.length > 0) {
      return value.filter((link): link is string => typeof link === "string");
    }

    return extractLinks(text);
  }

  private readMarketplaces(
    value: Prisma.JsonValue | null,
    linksValue: Prisma.JsonValue | null,
    text: string | null,
  ): Marketplace[] {
    if (Array.isArray(value) && value.length > 0) {
      return value.filter((marketplace): marketplace is Marketplace =>
        Object.values(Marketplace).includes(marketplace as Marketplace),
      );
    }

    return this.detectMarketplaces(this.readLinks(linksValue, text));
  }

  private detectMarketplaces(links: string[]): Marketplace[] {
    const marketplaces: Marketplace[] = [];
    const seen = new Set<Marketplace>();

    for (const link of links) {
      const marketplace = detectMarketplace(link);

      if (seen.has(marketplace)) {
        continue;
      }

      seen.add(marketplace);
      marketplaces.push(marketplace);
    }

    return marketplaces;
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "Unknown error";
  }

  private parsePositiveInteger(
    value: string | undefined,
    fieldName: string,
    defaultValue: number,
    maxValue: number,
  ): number {
    if (value === undefined) {
      return defaultValue;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException(
        `Query param ${fieldName} must be a positive integer.`,
      );
    }

    return Math.min(parsed, maxValue);
  }

  private normalizeRequiredString(value: string, fieldName: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Field ${fieldName} is required.`);
    }

    return value.trim();
  }
}
