import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { AffiliateLinkRewriterService } from "../affiliate/affiliate-link-rewriter.service";
import { Marketplace } from "../affiliate/helpers/detect-marketplace";
import { PrismaService } from "../../prisma.service";
import { WhatsAppSessionManager } from "../../whatsapp/session/whatsapp-session.manager";
import { downloadImageFromRawMessage } from "./helpers/download-image-from-raw-message";

const FORWARDED_STATUS_SENT = "SENT";
const FORWARDED_STATUS_SENT_TEXT_FALLBACK = "SENT_TEXT_FALLBACK";
const FORWARDED_STATUS_FAILED = "FAILED";
const FORWARDED_STATUS_SKIPPED = "SKIPPED";
const FORWARDED_STATUS_SKIPPED_ALREADY_SENT = "SKIPPED_ALREADY_SENT";

type ForwardMode = "manual" | "auto";

export type ForwardMessageResultDto = {
  destinationGroupJid: string;
  status: string;
  sentMessageType?: string;
  mediaForwarded?: boolean;
  sentProviderMessageId?: string;
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
    const mercadoLivreRewrites = rewritePreview.rewrites.filter(
      (rewrite) => rewrite.marketplace === Marketplace.MERCADO_LIVRE,
    );
    const allMercadoLivreRewritesSucceeded = mercadoLivreRewrites.every(
      (rewrite) =>
        rewrite.changed &&
        rewrite.canForward === true &&
        (rewrite.affiliateUrl ?? rewrite.rewrittenUrl).startsWith(
          "https://meli.la/",
        ),
    );

    if (
      mercadoLivreRewrites.length > 0 &&
      !allMercadoLivreRewritesSucceeded
    ) {
      const reason =
        rewritePreview.reason ??
        mercadoLivreRewrites.find((rewrite) => !rewrite.changed)?.reason ??
        "MERCADO_LIVRE_GENERATION_FAILED";
      console.log(`[MESSAGE_FORWARD] skipped reason=${reason}`);

      return this.persistSkippedForRoutes({
        userId: normalizedUserId,
        message,
        routes,
        mode,
        rewrittenText:
          rewritePreview.rewrittenText ??
          rewritePreview.originalText ??
          message.text ??
          "",
        reason,
      });
    }

    if (
      mode === "auto" &&
      !rewritePreview.rewrites.some((rewrite) => rewrite.changed)
    ) {
      const reasons = [
        ...new Set(
          rewritePreview.rewrites
            .map((rewrite) => rewrite.reason)
            .filter((reason): reason is string => Boolean(reason)),
        ),
      ];
      console.log(
        `[AUTO_FORWARD] skipped no rewritten links${reasons.length > 0 ? ` reason=${reasons.join(",")}` : ""}`,
      );
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
            sentProviderMessageId: sendResult.sentProviderMessageId,
            sentProviderRaw: sendResult.sentProviderRaw,
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
          sentProviderMessageId: sendResult.sentProviderMessageId,
        });
      } catch (error) {
        const errorMessage = this.readErrorMessage(error);

        console.error(
          `[FORWARD_SEND_RESULT] destinationGroupJid=${destinationGroupJid} messageId=none status=${FORWARDED_STATUS_FAILED} error=${errorMessage}`,
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

  private async persistSkippedForRoutes(params: {
    userId: string;
    message: {
      id: string;
      sessionId: string;
      groupJid: string;
      text: string | null;
    };
    routes: Array<{ destinationGroupJid: string }>;
    mode: ForwardMode;
    rewrittenText: string;
    reason: string;
  }): Promise<ForwardMessageResponseDto> {
    const results: ForwardMessageResultDto[] = [];

    for (const route of params.routes) {
      await this.prisma.forwardedMessage.create({
        data: {
          userId: params.userId,
          sessionId: params.message.sessionId,
          sourceMessageId: params.message.id,
          sourceGroupJid: params.message.groupJid,
          destinationGroupJid: route.destinationGroupJid,
          originalText: params.message.text,
          rewrittenText: params.rewrittenText,
          status: FORWARDED_STATUS_SKIPPED,
          mode: this.toStoredMode(params.mode),
          mediaForwarded: false,
          error: params.reason,
        },
      });
      results.push({
        destinationGroupJid: route.destinationGroupJid,
        status: FORWARDED_STATUS_SKIPPED,
        mediaForwarded: false,
        error: params.reason,
      });
    }

    return this.toForwardResponse(params.message.id, results);
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
    sentProviderMessageId?: string;
    sentProviderRaw?: Prisma.InputJsonValue;
  }> {
    if (message.messageType !== "image" || !message.hasMedia) {
      const providerResult = await socket.sendMessage(destinationGroupJid, {
        text: rewrittenText,
      });

      return this.toSuccessfulSendResult(
        destinationGroupJid,
        providerResult,
        {
          status: FORWARDED_STATUS_SENT,
          sentMessageType: "text",
          mediaForwarded: false,
        },
      );
    }

    let image: Buffer;

    try {
      console.log("[FORWARD_MEDIA] downloading image");
      image = await this.downloadImage(message.rawMessage, socket);
    } catch {
      console.log("[FORWARD_MEDIA] image failed, sending text fallback");
      const providerResult = await socket.sendMessage(destinationGroupJid, {
        text: rewrittenText,
      });

      return this.toSuccessfulSendResult(
        destinationGroupJid,
        providerResult,
        {
          status: FORWARDED_STATUS_SENT_TEXT_FALLBACK,
          sentMessageType: "text_fallback",
          mediaForwarded: false,
        },
      );
    }

    const providerResult = await socket.sendMessage(destinationGroupJid, {
      image,
      caption: rewrittenText,
    });
    console.log("[FORWARD_MEDIA] image sent");

    return this.toSuccessfulSendResult(
      destinationGroupJid,
      providerResult,
      {
        status: FORWARDED_STATUS_SENT,
        sentMessageType: "image",
        mediaForwarded: true,
      },
    );
  }

  private toSuccessfulSendResult(
    destinationGroupJid: string,
    providerResult: unknown,
    result: {
      status: string;
      sentMessageType: string;
      mediaForwarded: boolean;
    },
  ): {
    status: string;
    sentMessageType: string;
    mediaForwarded: boolean;
    sentProviderMessageId?: string;
    sentProviderRaw?: Prisma.InputJsonValue;
  } {
    const sentProviderMessageId =
      this.readProviderMessageId(providerResult) ?? undefined;
    const sentProviderRaw = this.sanitizeProviderResult(providerResult);

    console.log(
      `[FORWARD_SEND_RESULT] destinationGroupJid=${destinationGroupJid} messageId=${sentProviderMessageId ?? "none"} status=${result.status}`,
    );

    return {
      ...result,
      sentProviderMessageId,
      ...(sentProviderRaw ? { sentProviderRaw } : {}),
    };
  }

  private readProviderMessageId(providerResult: unknown): string | null {
    if (
      typeof providerResult !== "object" ||
      providerResult === null ||
      !("key" in providerResult) ||
      typeof providerResult.key !== "object" ||
      providerResult.key === null ||
      !("id" in providerResult.key) ||
      typeof providerResult.key.id !== "string"
    ) {
      return null;
    }

    return providerResult.key.id;
  }

  private sanitizeProviderResult(
    providerResult: unknown,
  ): Prisma.InputJsonValue | undefined {
    if (typeof providerResult !== "object" || providerResult === null) {
      return undefined;
    }

    const result = providerResult as Record<string, unknown>;
    const sanitized: Record<string, Prisma.InputJsonValue> = {};
    const key = this.sanitizeProviderKey(result.key);

    if (key) {
      sanitized.key = key;
    }

    const timestamp = this.toSafeJsonScalar(result.messageTimestamp);

    if (timestamp !== undefined) {
      sanitized.messageTimestamp = timestamp;
    }

    const status = this.toSafeJsonScalar(result.status);

    if (status !== undefined) {
      sanitized.status = status;
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  private sanitizeProviderKey(
    value: unknown,
  ): Prisma.InputJsonValue | undefined {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }

    const key = value as Record<string, unknown>;
    const sanitized: Record<string, Prisma.InputJsonValue> = {};

    for (const field of ["id", "remoteJid", "participant", "fromMe"]) {
      const scalar = this.toSafeJsonScalar(key[field]);

      if (scalar !== undefined) {
        sanitized[field] = scalar;
      }
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  private toSafeJsonScalar(
    value: unknown,
  ): string | number | boolean | undefined {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return value;
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    if (
      typeof value === "object" &&
      value !== null &&
      "toString" in value &&
      typeof value.toString === "function"
    ) {
      const stringValue = value.toString();

      return stringValue === "[object Object]" ? undefined : stringValue;
    }

    return undefined;
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
