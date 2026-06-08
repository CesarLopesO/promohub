import {
  BadRequestException,
  ConflictException,
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
import { PlanLimitsService } from "../plans/plan-limits.service";
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
    private readonly planLimits: PlanLimitsService,
  ) {}

  async create(
    body: CreateMessageRouteDto & { userId: string },
  ): Promise<MessageRouteDto> {
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

    if (data.sourceGroupJid === data.destinationGroupJid) {
      throw new BadRequestException(
        "O grupo de origem e destino não podem ser iguais.",
      );
    }

    const existingRoute = await this.prisma.messageRoute.findFirst({
      where: {
        userId: data.userId,
        sessionId: data.sessionId,
        sourceGroupJid: data.sourceGroupJid,
        destinationGroupJid: data.destinationGroupJid,
      },
      select: {
        id: true,
        isActive: true,
      },
    });

    if (existingRoute?.isActive) {
      throw new ConflictException("Esta rota já existe.");
    }

    if (existingRoute) {
      await this.planLimits.assertCanCreateRoute(
        data.userId,
        data.sourceGroupJid,
        data.destinationGroupJid,
      );
      const reactivated = await this.prisma.messageRoute.update({
        where: {
          id: existingRoute.id,
        },
        data: {
          isActive: true,
        },
      });

      return this.toDto(reactivated);
    }

    await this.planLimits.assertCanCreateRoute(
      data.userId,
      data.sourceGroupJid,
      data.destinationGroupJid,
    );

    try {
      const route = await this.prisma.messageRoute.create({
        data: {
          ...data,
          isActive: true,
        },
      });

      return this.toDto(route);
    } catch (err) {
      if (this.isPrismaUniqueConstraint(err)) {
        throw new ConflictException("Esta rota já existe.");
      }

      throw err;
    }
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

  async findOne(id: string, userId?: string): Promise<MessageRouteDto> {
    return this.toDto(await this.findRoute(id, userId));
  }

  async update(
    id: string,
    body: UpdateMessageRouteDto,
    userId?: string,
  ): Promise<MessageRouteDto> {
    const route = await this.findRoute(id, userId);
    const data = {
      sessionId:
        body.sessionId === undefined
          ? route.sessionId
          : this.normalizeRequiredString(body.sessionId, "sessionId"),
      sourceGroupJid:
        body.sourceGroupJid === undefined
          ? route.sourceGroupJid
          : this.normalizeRequiredString(body.sourceGroupJid, "sourceGroupJid"),
      destinationGroupJid:
        body.destinationGroupJid === undefined
          ? route.destinationGroupJid
          : this.normalizeRequiredString(
              body.destinationGroupJid,
              "destinationGroupJid",
            ),
      isActive: body.isActive === undefined ? route.isActive : body.isActive,
    };

    if (data.sourceGroupJid === data.destinationGroupJid) {
      throw new BadRequestException(
        "O grupo de origem e destino não podem ser iguais.",
      );
    }

    if (data.isActive) {
      const duplicate = await this.prisma.messageRoute.findFirst({
        where: {
          userId: route.userId,
          sessionId: data.sessionId,
          sourceGroupJid: data.sourceGroupJid,
          destinationGroupJid: data.destinationGroupJid,
          isActive: true,
          NOT: {
            id: route.id,
          },
        },
        select: {
          id: true,
        },
      });

      if (duplicate) {
        throw new ConflictException("Esta rota já existe.");
      }
    }

    let updated: MessageRoute;

    try {
      updated = await this.prisma.messageRoute.update({
        where: {
          id: route.id,
        },
        data: {
          sessionId: data.sessionId,
          sourceGroupJid: data.sourceGroupJid,
          destinationGroupJid: data.destinationGroupJid,
          isActive: data.isActive,
        },
      });
    } catch (err) {
      if (this.isPrismaUniqueConstraint(err)) {
        throw new ConflictException("Esta rota já existe.");
      }

      throw err;
    }

    return this.toDto(updated);
  }

  async softDelete(id: string, userId?: string): Promise<MessageRouteDto> {
    const route = await this.findRoute(id, userId);
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

  async preview(
    body: PreviewMessageRouteDto & { userId: string },
  ): Promise<MessageRoutePreviewDto> {
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
    bodyOrUserId: (ForwardMessageRouteDto & { userId?: string }) | string,
  ): Promise<ForwardMessageResponseDto> {
    const userId =
      typeof bodyOrUserId === "string" ? bodyOrUserId : bodyOrUserId.userId;

    return this.forwardingService.forwardMessageById(
      this.normalizeRequiredString(userId ?? "", "userId"),
      messageId,
      {
        mode: "manual",
      },
    );
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

  private async findRoute(id: string, userId?: string): Promise<MessageRoute> {
    const normalizedId = this.normalizeRequiredString(id, "id");
    const normalizedUserId = userId
      ? this.normalizeRequiredString(userId, "userId")
      : undefined;
    const route = normalizedUserId
      ? await this.prisma.messageRoute.findFirst({
          where: {
            id: normalizedId,
            userId: normalizedUserId,
          },
        })
      : await this.prisma.messageRoute.findUnique({
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

  private isPrismaUniqueConstraint(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    );
  }
}
