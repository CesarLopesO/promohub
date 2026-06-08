import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AffiliateLinkRewriterService } from "../affiliate/affiliate-link-rewriter.service";
import { PrismaService } from "../../prisma.service";
import { WhatsAppSessionManager } from "../../whatsapp/session/whatsapp-session.manager";
import { downloadImageFromRawMessage } from "./helpers/download-image-from-raw-message";

const FORWARDED_STATUS_SENT = "SENT";
const FORWARDED_STATUS_SENT_TEXT_FALLBACK = "SENT_TEXT_FALLBACK";
const FORWARDED_STATUS_FAILED = "FAILED";
const FORWARDED_STATUS_SKIPPED_ALREADY_SENT = "SKIPPED_ALREADY_SENT";

type ForwardMode = "manual" | "auto";

export type ForwardMessageResultDto = {
  destinationGroupJid: string;
  status: string;
  sentMessageType?: string;
  mediaForwarded?: boolean;
  error?: string;
};

export type ForwardMessageResponseDto = {
  messageId: string;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  results: ForwardMessageResultDto[];
};

@Injectable()
export class MessageForwardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly linkRewriter: AffiliateLinkRewriterService,
    private readonly sessionManager: WhatsAppSessionManager,
  ) {}

  async forwardMessageById(
    userId: string,
    messageId: string,
    options?: {
      mode?: ForwardMode;
    },
  ): Promise<ForwardMessageResponseDto> {
    const mode = options?.mode ?? "manual";
    const normalizedUserId = this.normalizeRequiredString(userId, "userId");
    const normalizedMessageId = this.normalizeRequiredString(
      messageId,
      "messageId",
    );
    const message = await this.prisma.whatsAppMessage.findUnique({
      where: {
        id: normalizedMessageId,
      },
    });

    if (!message) {
      throw new NotFoundException("WhatsApp message not found.");
    }

    const links = this.readLinks(message.links);

    if (mode === "auto" && links.length === 0) {
      console.log("[AUTO_FORWARD] skipped no links");
      return this.toForwardResponse(message.id, []);
    }

    const routes = await this.prisma.messageRoute.findMany({
      where: {
        userId: normalizedUserId,
        sessionId: message.sessionId,
        sourceGroupJid: message.groupJid,
        isActive: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (routes.length === 0) {
      if (mode === "auto") {
        console.log("[AUTO_FORWARD] skipped no active routes");
      }

      return this.toForwardResponse(message.id, []);
    }

    const rewritePreview = await this.linkRewriter.rewriteMessageForUser(
      normalizedUserId,
      message.id,
    );
    const hasBlockedLegacyRewrite =
      mode === "auto" &&
      process.env.MERCADO_LIVRE_LEGACY_FORWARD_ENABLED !== "true" &&
      rewritePreview.rewrites.some(
        (rewrite) => rewrite.changed && rewrite.mode === "legacy",
      );

    if (hasBlockedLegacyRewrite) {
      console.log("[AUTO_FORWARD] skipped Mercado Livre legacy mode");
      return this.toForwardResponse(message.id, []);
    }

    if (
      mode === "auto" &&
      !rewritePreview.rewrites.some((rewrite) => rewrite.changed)
    ) {
      console.log("[AUTO_FORWARD] skipped no rewritten links");
      return this.toForwardResponse(message.id, []);
    }

    const rewrittenText =
      rewritePreview.rewrittenText ?? rewritePreview.originalText ?? "";
    const session = await this.prisma.whatsAppSession.findFirst({
      where: {
        sessionId: message.sessionId,
        deletedAt: null,
      },
    });

    if (!session) {
      throw new NotFoundException("WhatsApp session not found.");
    }

    if (session.status !== "CONNECTED") {
      throw new BadRequestException("WhatsApp session is not connected.");
    }

    const { socket } = await this.sessionManager.getConnectedSocket(session.id);
    const results: ForwardMessageResultDto[] = [];

    for (const route of routes) {
      const destinationGroupJid = route.destinationGroupJid;
      const alreadySent = await this.prisma.forwardedMessage.findFirst({
        where: {
          sourceMessageId: message.id,
          destinationGroupJid,
          status: FORWARDED_STATUS_SENT,
        },
      });

      if (alreadySent) {
        results.push({
          destinationGroupJid,
          status: FORWARDED_STATUS_SKIPPED_ALREADY_SENT,
        });
        continue;
      }

      if (mode === "auto") {
        await this.waitRandomDelay();
      }

      try {
        const sendResult = await this.sendForwardedMessage(
          socket,
          destinationGroupJid,
          message,
          rewrittenText,
        );
        await this.prisma.forwardedMessage.create({
          data: {
            userId: normalizedUserId,
            sessionId: message.sessionId,
            sourceMessageId: message.id,
            sourceGroupJid: message.groupJid,
            destinationGroupJid,
            originalText: message.text,
            rewrittenText,
            status: sendResult.status,
            mode: this.toStoredMode(mode),
            sentMessageType: sendResult.sentMessageType,
            mediaForwarded: sendResult.mediaForwarded,
            sentAt: new Date(),
          },
        });
        if (mode === "auto") {
          console.log(`[AUTO_FORWARD] sent ${destinationGroupJid}`);
        }
        results.push({
          destinationGroupJid,
          status: sendResult.status,
          sentMessageType: sendResult.sentMessageType,
          mediaForwarded: sendResult.mediaForwarded,
        });
      } catch (error) {
        const errorMessage = this.readErrorMessage(error);

        await this.prisma.forwardedMessage.create({
          data: {
            userId: normalizedUserId,
            sessionId: message.sessionId,
            sourceMessageId: message.id,
            sourceGroupJid: message.groupJid,
            destinationGroupJid,
            originalText: message.text,
            rewrittenText,
            status: FORWARDED_STATUS_FAILED,
            mode: this.toStoredMode(mode),
            sentMessageType: "text",
            mediaForwarded: false,
            error: errorMessage,
          },
        });
        if (mode === "auto") {
          console.log(
            `[AUTO_FORWARD] failed ${destinationGroupJid} ${errorMessage}`,
          );
        }
        results.push({
          destinationGroupJid,
          status: FORWARDED_STATUS_FAILED,
          sentMessageType: "text",
          mediaForwarded: false,
          error: errorMessage,
        });
      }
    }

    return this.toForwardResponse(message.id, results);
  }

  private toForwardResponse(
    messageId: string,
    results: ForwardMessageResultDto[],
  ): ForwardMessageResponseDto {
    return {
      messageId,
      sentCount: results.filter(
        (result) =>
          result.status === FORWARDED_STATUS_SENT ||
          result.status === FORWARDED_STATUS_SENT_TEXT_FALLBACK,
      ).length,
      failedCount: results.filter(
        (result) => result.status === FORWARDED_STATUS_FAILED,
      ).length,
      skippedCount: results.filter((result) =>
        result.status.startsWith("SKIPPED"),
      ).length,
      results,
    };
  }

  private readLinks(value: Prisma.JsonValue | null): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((link): link is string => typeof link === "string");
  }

  private async sendForwardedMessage(
    socket: Awaited<ReturnType<WhatsAppSessionManager["getConnectedSocket"]>>["socket"],
    destinationGroupJid: string,
    message: {
      messageType: string;
      hasMedia: boolean;
      rawMessage: Prisma.JsonValue | null;
    },
    rewrittenText: string,
  ): Promise<{
    status: string;
    sentMessageType: string;
    mediaForwarded: boolean;
  }> {
    if (message.messageType !== "image" || !message.hasMedia) {
      await socket.sendMessage(destinationGroupJid, {
        text: rewrittenText,
      });

      return {
        status: FORWARDED_STATUS_SENT,
        sentMessageType: "text",
        mediaForwarded: false,
      };
    }

    try {
      console.log("[FORWARD_MEDIA] downloading image");
      const image = await this.downloadImage(message.rawMessage, socket);

      await socket.sendMessage(destinationGroupJid, {
        image,
        caption: rewrittenText,
      });
      console.log("[FORWARD_MEDIA] image sent");

      return {
        status: FORWARDED_STATUS_SENT,
        sentMessageType: "image",
        mediaForwarded: true,
      };
    } catch {
      console.log("[FORWARD_MEDIA] image failed, sending text fallback");
      await socket.sendMessage(destinationGroupJid, {
        text: rewrittenText,
      });

      return {
        status: FORWARDED_STATUS_SENT_TEXT_FALLBACK,
        sentMessageType: "text_fallback",
        mediaForwarded: false,
      };
    }
  }

  private downloadImage(
    rawMessage: Prisma.JsonValue | null,
    socket: Awaited<ReturnType<WhatsAppSessionManager["getConnectedSocket"]>>["socket"],
  ): Promise<Buffer> {
    return downloadImageFromRawMessage(rawMessage, socket);
  }

  private toStoredMode(mode: ForwardMode): string {
    return mode === "auto" ? "AUTO" : "MANUAL";
  }

  private async waitRandomDelay(): Promise<void> {
    const delayMs = 2_000 + Math.floor(Math.random() * 3_001);

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private readErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return "Unknown error";
  }

  private normalizeRequiredString(value: string, fieldName: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Field ${fieldName} is required.`);
    }

    return value.trim();
  }
}
