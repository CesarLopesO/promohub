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
import { WhatsAppInviteService } from "../../whatsapp/invites/whatsapp-invite.service";
import { downloadImageFromRawMessage } from "./helpers/download-image-from-raw-message";
import {
  detectWhatsAppInviteLinks,
  replaceWhatsAppLinks,
} from "./helpers/whatsapp-link-rewriter";
import {
  ForwardSkipReason,
  type ForwardSkipReason as ForwardSkipReasonValue,
} from "./forward-skip-reason";
import { SettingsService } from "../settings/settings.service";
import { DEFAULT_FREE_PLAN_SIGNATURE } from "../settings/settings.types";
import { PlanLimitsService } from "../plans/plan-limits.service";

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
  reason?: ForwardSkipReasonValue;
  error?: string;
  warnings?: string[];
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
    private readonly inviteService: WhatsAppInviteService,
    private readonly settings: SettingsService,
    private readonly planLimits: PlanLimitsService,
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

    const user = await this.prisma.user.findUnique({
      where: { id: normalizedUserId },
      select: { plan: true },
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const links = this.readLinks(message.links);
    const whatsappLinks = detectWhatsAppInviteLinks(message.text ?? "");

    if (mode === "auto" && links.length === 0 && whatsappLinks.length === 0) {
      this.logOperational("AUTO_FORWARD", "skipped", {
        sessionId: message.sessionId,
        sourceGroupJid: message.groupJid,
        messageId: message.id,
        reason: ForwardSkipReason.NO_LINKS,
      });
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
      this.logOperational(
        mode === "auto" ? "AUTO_FORWARD" : "MESSAGE_FORWARD",
        "skipped",
        {
          sessionId: message.sessionId,
          sourceGroupJid: message.groupJid,
          messageId: message.id,
          reason:
            mode === "auto"
              ? ForwardSkipReason.NO_ACTIVE_ROUTES
              : ForwardSkipReason.ROUTE_NOT_FOUND,
        },
      );

      return this.toForwardResponse(message.id, []);
    }

    if (
      !(await this.planLimits.canForwardMessage(normalizedUserId, user.plan))
    ) {
      this.logSkippedForRoutes(
        message,
        routes,
        ForwardSkipReason.DAILY_MESSAGE_LIMIT_REACHED,
      );
      return this.persistSkippedForRoutes({
        userId: normalizedUserId,
        message,
        routes,
        mode,
        rewrittenText: message.text ?? "",
        reason: ForwardSkipReason.DAILY_MESSAGE_LIMIT_REACHED,
      });
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

    if (mercadoLivreRewrites.length > 0 && !allMercadoLivreRewritesSucceeded) {
      const providerReason =
        rewritePreview.reason ??
        mercadoLivreRewrites.find((rewrite) => !rewrite.changed)?.reason ??
        "MERCADO_LIVRE_GENERATION_FAILED";
      const reason = this.normalizeAffiliateReason(
        Marketplace.MERCADO_LIVRE,
        providerReason,
      );
      this.logSkippedForRoutes(message, routes, reason);

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
        errorDetail: providerReason,
      });
    }

    const failedAmazonRewrite = rewritePreview.rewrites.find(
      (rewrite) =>
        rewrite.marketplace === Marketplace.AMAZON &&
        rewrite.canForward !== true &&
        this.isAmazonFailureReason(rewrite.reason),
    );

    if (failedAmazonRewrite) {
      const providerReason =
        failedAmazonRewrite.reason ?? "AMAZON_GENERATION_FAILED";
      const reason = this.normalizeAffiliateReason(
        Marketplace.AMAZON,
        providerReason,
      );
      this.logSkippedForRoutes(message, routes, reason);

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
        errorDetail: providerReason,
      });
    }

    const failedMagaluRewrite = rewritePreview.rewrites.find(
      (rewrite) =>
        rewrite.marketplace === Marketplace.MAGAZINE_LUIZA &&
        rewrite.canForward !== true,
    );

    if (failedMagaluRewrite) {
      const providerReason =
        failedMagaluRewrite.reason ?? "MAGALU_REWRITE_FAILED";
      const reason = this.normalizeAffiliateReason(
        Marketplace.MAGAZINE_LUIZA,
        providerReason,
      );
      this.logSkippedForRoutes(message, routes, reason);

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
        errorDetail: providerReason,
      });
    }

    if (
      mode === "auto" &&
      !rewritePreview.rewrites.some(
        (rewrite) => rewrite.changed || rewrite.canForward === true,
      ) &&
      whatsappLinks.length === 0
    ) {
      const failedRewrite = rewritePreview.rewrites.find(
        (rewrite) => rewrite.canForward !== true,
      );
      const reason = failedRewrite
        ? this.normalizeAffiliateReason(
            failedRewrite.marketplace,
            failedRewrite.reason,
          )
        : ForwardSkipReason.NO_LINKS;
      this.logSkippedForRoutes(message, routes, reason);

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
        errorDetail: failedRewrite?.reason,
      });
    }

    const affiliateRewrittenText =
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
      this.logSkippedForRoutes(
        message,
        routes,
        ForwardSkipReason.SESSION_DISCONNECTED,
      );
      await this.persistSkippedForRoutes({
        userId: normalizedUserId,
        message,
        routes,
        mode,
        rewrittenText: affiliateRewrittenText,
        reason: ForwardSkipReason.SESSION_DISCONNECTED,
      });
      throw new BadRequestException("WhatsApp session is not connected.");
    }

    const { socket } = await this.sessionManager.getConnectedSocket(session.id);
    const results: ForwardMessageResultDto[] = [];
    const adsEnabled = this.planLimits.getLimits(user.plan).adsEnabled;
    const freePlanSignature = adsEnabled
      ? (await this.settings.getPublicSettings()).freePlanSignature
      : DEFAULT_FREE_PLAN_SIGNATURE;

    for (const route of routes) {
      const destinationGroupJid = route.destinationGroupJid;

      if (
        !(await this.planLimits.canForwardMessage(normalizedUserId, user.plan))
      ) {
        this.logOperational("MESSAGE_FORWARD", "skipped", {
          sessionId: message.sessionId,
          sourceGroupJid: message.groupJid,
          destinationGroupJid,
          messageId: message.id,
          reason: ForwardSkipReason.DAILY_MESSAGE_LIMIT_REACHED,
        });
        await this.prisma.forwardedMessage.create({
          data: {
            userId: normalizedUserId,
            sessionId: message.sessionId,
            sourceMessageId: message.id,
            sourceGroupJid: message.groupJid,
            destinationGroupJid,
            originalText: message.text,
            rewrittenText: affiliateRewrittenText,
            status: FORWARDED_STATUS_SKIPPED,
            mode: this.toStoredMode(mode),
            mediaForwarded: false,
            reason: ForwardSkipReason.DAILY_MESSAGE_LIMIT_REACHED,
            error: ForwardSkipReason.DAILY_MESSAGE_LIMIT_REACHED,
          },
        });
        results.push({
          destinationGroupJid,
          status: FORWARDED_STATUS_SKIPPED,
          mediaForwarded: false,
          reason: ForwardSkipReason.DAILY_MESSAGE_LIMIT_REACHED,
          error: ForwardSkipReason.DAILY_MESSAGE_LIMIT_REACHED,
        });
        continue;
      }

      const destinationInviteUrl =
        whatsappLinks.length > 0
          ? await this.inviteService.getDestinationInviteUrl(
              route.sessionId,
              destinationGroupJid,
              route.destinationInviteUrl,
            )
          : null;
      const whatsappRewrite = replaceWhatsAppLinks(
        affiliateRewrittenText,
        destinationInviteUrl,
      );
      const rewrittenText = this.appendFreePlanSignature(
        whatsappRewrite.text,
        adsEnabled,
        freePlanSignature,
      );
      const warnings =
        whatsappLinks.length > 0 && !destinationInviteUrl
          ? ["WHATSAPP_INVITE_CODE_FAILED"]
          : [];

      if (whatsappRewrite.changed) {
        console.log(
          `[WHATSAPP_LINK_REWRITE] replaced sessionId=${message.sessionId} sourceGroupJid=${message.groupJid} destinationGroupJid=${destinationGroupJid} messageId=${message.id} count=${whatsappRewrite.links.length}`,
        );
      }
      const alreadySent = await this.prisma.forwardedMessage.findFirst({
        where: {
          sourceMessageId: message.id,
          destinationGroupJid,
          status: FORWARDED_STATUS_SENT,
        },
      });

      if (alreadySent) {
        this.logOperational("MESSAGE_FORWARD", "skipped", {
          sessionId: message.sessionId,
          sourceGroupJid: message.groupJid,
          destinationGroupJid,
          messageId: message.id,
          reason: ForwardSkipReason.DUPLICATE_FORWARD,
        });
        await this.prisma.forwardedMessage.create({
          data: {
            userId: normalizedUserId,
            sessionId: message.sessionId,
            sourceMessageId: message.id,
            sourceGroupJid: message.groupJid,
            destinationGroupJid,
            originalText: message.text,
            rewrittenText,
            status: FORWARDED_STATUS_SKIPPED_ALREADY_SENT,
            mode: this.toStoredMode(mode),
            mediaForwarded: false,
            reason: ForwardSkipReason.DUPLICATE_FORWARD,
          },
        });
        results.push({
          destinationGroupJid,
          status: FORWARDED_STATUS_SKIPPED_ALREADY_SENT,
          reason: ForwardSkipReason.DUPLICATE_FORWARD,
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
            reason: sendResult.reason,
            sentAt: new Date(),
          },
        });
        if (mode === "auto") {
          console.log(
            `[AUTO_FORWARD] sent sessionId=${message.sessionId} sourceGroupJid=${message.groupJid} destinationGroupJid=${destinationGroupJid} messageId=${message.id}`,
          );
        }
        results.push({
          destinationGroupJid,
          status: sendResult.status,
          sentMessageType: sendResult.sentMessageType,
          mediaForwarded: sendResult.mediaForwarded,
          sentProviderMessageId: sendResult.sentProviderMessageId,
          ...(sendResult.reason ? { reason: sendResult.reason } : {}),
          ...(warnings.length > 0 ? { warnings } : {}),
        });
      } catch (error) {
        const errorMessage = this.readErrorMessage(error);

        this.logOperational("FORWARD_SEND_RESULT", "failed", {
          sessionId: message.sessionId,
          sourceGroupJid: message.groupJid,
          destinationGroupJid,
          messageId: message.id,
          reason: ForwardSkipReason.SEND_FAILED,
        });
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
            reason: ForwardSkipReason.SEND_FAILED,
            error: errorMessage,
          },
        });
        if (mode === "auto") {
          this.logOperational("AUTO_FORWARD", "failed", {
            sessionId: message.sessionId,
            sourceGroupJid: message.groupJid,
            destinationGroupJid,
            messageId: message.id,
            reason: ForwardSkipReason.SEND_FAILED,
          });
        }
        results.push({
          destinationGroupJid,
          status: FORWARDED_STATUS_FAILED,
          sentMessageType: "text",
          mediaForwarded: false,
          reason: ForwardSkipReason.SEND_FAILED,
          error: errorMessage,
          ...(warnings.length > 0 ? { warnings } : {}),
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
    reason: ForwardSkipReasonValue;
    errorDetail?: string;
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
          reason: params.reason,
          error: params.errorDetail ?? params.reason,
        },
      });
      results.push({
        destinationGroupJid: route.destinationGroupJid,
        status: FORWARDED_STATUS_SKIPPED,
        mediaForwarded: false,
        reason: params.reason,
        error: params.errorDetail ?? params.reason,
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

  private appendFreePlanSignature(
    text: string,
    adsEnabled: boolean,
    signature: string,
  ): string {
    if (!adsEnabled || text.includes(signature)) {
      return text;
    }

    return `${text}\n\n${signature}`;
  }

  private async sendForwardedMessage(
    socket: Awaited<
      ReturnType<WhatsAppSessionManager["getConnectedSocket"]>
    >["socket"],
    destinationGroupJid: string,
    message: {
      id: string;
      sessionId: string;
      groupJid: string;
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
    reason?: ForwardSkipReasonValue;
  }> {
    if (message.messageType !== "image" || !message.hasMedia) {
      const providerResult = await socket.sendMessage(destinationGroupJid, {
        text: rewrittenText,
      });

      return this.toSuccessfulSendResult(
        message,
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
      image = await this.downloadImage(message.rawMessage, socket);
    } catch {
      this.logOperational("FORWARD_MEDIA", "fallback", {
        sessionId: message.sessionId,
        sourceGroupJid: message.groupJid,
        destinationGroupJid,
        messageId: message.id,
        reason: ForwardSkipReason.MEDIA_DOWNLOAD_FAILED,
      });
      const providerResult = await socket.sendMessage(destinationGroupJid, {
        text: rewrittenText,
      });

      return this.toSuccessfulSendResult(
        message,
        destinationGroupJid,
        providerResult,
        {
          status: FORWARDED_STATUS_SENT_TEXT_FALLBACK,
          sentMessageType: "text_fallback",
          mediaForwarded: false,
          reason: ForwardSkipReason.MEDIA_DOWNLOAD_FAILED,
        },
      );
    }

    const providerResult = await socket.sendMessage(destinationGroupJid, {
      image,
      caption: rewrittenText,
    });
    return this.toSuccessfulSendResult(
      message,
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
    message: {
      id: string;
      sessionId: string;
      groupJid: string;
    },
    destinationGroupJid: string,
    providerResult: unknown,
    result: {
      status: string;
      sentMessageType: string;
      mediaForwarded: boolean;
      reason?: ForwardSkipReasonValue;
    },
  ): {
    status: string;
    sentMessageType: string;
    mediaForwarded: boolean;
    sentProviderMessageId?: string;
    sentProviderRaw?: Prisma.InputJsonValue;
    reason?: ForwardSkipReasonValue;
  } {
    const sentProviderMessageId =
      this.readProviderMessageId(providerResult) ?? undefined;
    const sentProviderRaw = this.sanitizeProviderResult(providerResult);

    console.log(
      `[FORWARD_SEND_RESULT] sessionId=${message.sessionId} sourceGroupJid=${message.groupJid} destinationGroupJid=${destinationGroupJid} messageId=${message.id} providerMessageId=${sentProviderMessageId ?? "none"} status=${result.status}${result.reason ? ` reason=${result.reason}` : ""}`,
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
    socket: Awaited<
      ReturnType<WhatsAppSessionManager["getConnectedSocket"]>
    >["socket"],
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

  private isAmazonFailureReason(reason?: string): boolean {
    return (
      reason === "INVALID_AMAZON_URL" || Boolean(reason?.startsWith("AMAZON_"))
    );
  }

  private normalizeAffiliateReason(
    marketplace: Marketplace,
    providerReason?: string,
  ): ForwardSkipReasonValue {
    if (marketplace === Marketplace.MAGAZINE_LUIZA) {
      return providerReason === "MAGALU_CREDENTIAL_MISSING"
        ? ForwardSkipReason.MAGALU_CREDENTIAL_MISSING
        : ForwardSkipReason.MAGALU_REWRITE_FAILED;
    }

    if (
      providerReason === "AMAZON_TAG_NOT_CONFIGURED" ||
      providerReason === "MISSING_MERCADO_LIVRE_SESSION" ||
      providerReason === "MISSING_AFFILIATE_VALUE"
    ) {
      return ForwardSkipReason.AFFILIATE_CREDENTIAL_MISSING;
    }

    return marketplace === Marketplace.MERCADO_LIVRE
      ? ForwardSkipReason.ML_GENERATION_FAILED
      : ForwardSkipReason.AMAZON_GENERATION_FAILED;
  }

  private logSkippedForRoutes(
    message: { id: string; sessionId: string; groupJid: string },
    routes: Array<{ destinationGroupJid: string }>,
    reason: ForwardSkipReasonValue,
  ): void {
    for (const route of routes) {
      this.logOperational("MESSAGE_FORWARD", "skipped", {
        sessionId: message.sessionId,
        sourceGroupJid: message.groupJid,
        destinationGroupJid: route.destinationGroupJid,
        messageId: message.id,
        reason,
      });
    }
  }

  private logOperational(
    scope: string,
    action: "skipped" | "failed" | "fallback",
    context: {
      sessionId: string;
      sourceGroupJid: string;
      destinationGroupJid?: string;
      messageId?: string;
      reason: ForwardSkipReasonValue;
    },
  ): void {
    console.log(
      `[${scope}] ${action} sessionId=${context.sessionId} sourceGroupJid=${context.sourceGroupJid}${context.destinationGroupJid ? ` destinationGroupJid=${context.destinationGroupJid}` : ""}${context.messageId ? ` messageId=${context.messageId}` : ""} reason=${context.reason}`,
    );
  }

  private normalizeRequiredString(value: string, fieldName: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Field ${fieldName} is required.`);
    }

    return value.trim();
  }
}
