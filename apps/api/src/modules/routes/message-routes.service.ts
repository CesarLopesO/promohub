import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ForwardedMessage,
  MessageRoute,
} from "@prisma/client";

import {
  AffiliateLinkRewriterService,
  AffiliateRewriteResult,
} from "../affiliate/affiliate-link-rewriter.service";
import { PrismaService } from "../../prisma.service";
import type { CreateMessageRouteDto } from "./dto/create-message-route.dto";
import type { ForwardMessageRouteDto } from "./dto/forward-message-route.dto";
import type { PreviewMessageRouteDto } from "./dto/preview-message-route.dto";
import type { UpdateMessageRouteDto } from "./dto/update-message-route.dto";
import {
  ForwardMessageResponseDto,
  MessageForwardingService,
} from "./message-forwarding.service";

export type MessageRouteDto = {
  id: string;
  userId: string;
  sessionId: string;
  sourceGroupJid: string;
  destinationGroupJid: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageRoutePreviewDto = {
  messageId: string;
  sourceGroupJid: string;
  destinationGroups: string[];
  rewrittenText: string;
  canForward: boolean;
  rewrites: AffiliateRewriteResult[];
};

export type ForwardedMessageDto = {
  id: string;
  userId: string;
  sessionId: string;
  sourceMessageId: string;
  sourceGroupJid: string;
  destinationGroupJid: string;
  originalText?: string;
  rewrittenText: string;
  status: string;
  mode?: string;
  sentMessageType?: string;
  mediaForwarded: boolean;
  error?: string;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class MessageRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly linkRewriter: AffiliateLinkRewriterService,
    private readonly forwardingService: MessageForwardingService,
  ) {}

  async create(body: CreateMessageRouteDto): Promise<MessageRouteDto> {
    const data = {
      userId: this.normalizeRequiredString(body.userId, "userId"),
      sessionId: this.normalizeRequiredString(body.sessionId, "sessionId"),
      sourceGroupJid: this.normalizeRequiredString(
        body.sourceGroupJid,
        "sourceGroupJid",
      ),
      destinationGroupJid: this.normalizeRequiredString(
        body.destinationGroupJid,
        "destinationGroupJid",
      ),
    };
    const route = await this.prisma.messageRoute.upsert({
      where: {
        sessionId_sourceGroupJid_destinationGroupJid: {
          sessionId: data.sessionId,
          sourceGroupJid: data.sourceGroupJid,
          destinationGroupJid: data.destinationGroupJid,
        },
      },
      create: {
        ...data,
        isActive: true,
      },
      update: {
        userId: data.userId,
        isActive: true,
      },
    });

    return this.toDto(route);
  }

  async list(filters: {
    userId?: string;
    sessionId?: string;
  }): Promise<MessageRouteDto[]> {
    const routes = await this.prisma.messageRoute.findMany({
      where: {
        isActive: true,
        ...(filters.userId?.trim() ? { userId: filters.userId.trim() } : {}),
        ...(filters.sessionId?.trim()
          ? { sessionId: filters.sessionId.trim() }
          : {}),
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    return routes.map((route) => this.toDto(route));
  }

  async findOne(id: string): Promise<MessageRouteDto> {
    return this.toDto(await this.findRoute(id));
  }

  async update(
    id: string,
    body: UpdateMessageRouteDto,
  ): Promise<MessageRouteDto> {
    const route = await this.findRoute(id);
    const updated = await this.prisma.messageRoute.update({
      where: {
        id: route.id,
      },
      data: {
        ...(body.userId === undefined
          ? {}
          : { userId: this.normalizeRequiredString(body.userId, "userId") }),
        ...(body.sessionId === undefined
          ? {}
          : {
              sessionId: this.normalizeRequiredString(
                body.sessionId,
                "sessionId",
              ),
            }),
        ...(body.sourceGroupJid === undefined
          ? {}
          : {
              sourceGroupJid: this.normalizeRequiredString(
                body.sourceGroupJid,
                "sourceGroupJid",
              ),
            }),
        ...(body.destinationGroupJid === undefined
          ? {}
          : {
              destinationGroupJid: this.normalizeRequiredString(
                body.destinationGroupJid,
                "destinationGroupJid",
              ),
            }),
        ...(body.isActive === undefined ? {} : { isActive: body.isActive }),
      },
    });

    return this.toDto(updated);
  }

  async softDelete(id: string): Promise<MessageRouteDto> {
    const route = await this.findRoute(id);
    const updated = await this.prisma.messageRoute.update({
      where: {
        id: route.id,
      },
      data: {
        isActive: false,
      },
    });

    return this.toDto(updated);
  }

  async preview(body: PreviewMessageRouteDto): Promise<MessageRoutePreviewDto> {
    const userId = this.normalizeRequiredString(body.userId, "userId");
    const messageId = this.normalizeRequiredString(body.messageId, "messageId");
    const message = await this.prisma.whatsAppMessage.findUnique({
      where: {
        id: messageId,
      },
    });

    if (!message) {
      throw new NotFoundException("WhatsApp message not found.");
    }

    const rewritePreview = await this.linkRewriter.rewriteMessageForUser(
      userId,
      message.id,
    );
    const routes = await this.prisma.messageRoute.findMany({
      where: {
        userId,
        sessionId: message.sessionId,
        sourceGroupJid: message.groupJid,
        isActive: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    const destinationGroups = routes.map((route) => route.destinationGroupJid);

    return {
      messageId: message.id,
      sourceGroupJid: message.groupJid,
      destinationGroups,
      rewrittenText:
        rewritePreview.rewrittenText ?? rewritePreview.originalText ?? "",
      canForward: destinationGroups.length > 0,
      rewrites: rewritePreview.rewrites,
    };
  }

  async forward(
    messageId: string,
    body: ForwardMessageRouteDto,
  ): Promise<ForwardMessageResponseDto> {
    return this.forwardingService.forwardMessageById(body.userId, messageId, {
      mode: "manual",
    });
  }

  async listForwarded(filters: {
    userId?: string;
  }): Promise<ForwardedMessageDto[]> {
    const forwardedMessages = await this.prisma.forwardedMessage.findMany({
      where: {
        ...(filters.userId?.trim() ? { userId: filters.userId.trim() } : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return forwardedMessages.map((message) => this.toForwardedDto(message));
  }

  private async findRoute(id: string): Promise<MessageRoute> {
    const normalizedId = this.normalizeRequiredString(id, "id");
    const route = await this.prisma.messageRoute.findUnique({
      where: {
        id: normalizedId,
      },
    });

    if (!route) {
      throw new NotFoundException("Message route not found.");
    }

    return route;
  }

  private toDto(route: MessageRoute): MessageRouteDto {
    return {
      id: route.id,
      userId: route.userId,
      sessionId: route.sessionId,
      sourceGroupJid: route.sourceGroupJid,
      destinationGroupJid: route.destinationGroupJid,
      isActive: route.isActive,
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
    };
  }

  private toForwardedDto(message: ForwardedMessage): ForwardedMessageDto {
    return {
      id: message.id,
      userId: message.userId,
      sessionId: message.sessionId,
      sourceMessageId: message.sourceMessageId,
      sourceGroupJid: message.sourceGroupJid,
      destinationGroupJid: message.destinationGroupJid,
      originalText: message.originalText ?? undefined,
      rewrittenText: message.rewrittenText,
      status: message.status,
      mode: message.mode ?? undefined,
      sentMessageType: message.sentMessageType ?? undefined,
      mediaForwarded: message.mediaForwarded,
      error: message.error ?? undefined,
      sentAt: message.sentAt ?? undefined,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  private normalizeRequiredString(value: string, fieldName: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Field ${fieldName} is required.`);
    }

    return value.trim();
  }
}
