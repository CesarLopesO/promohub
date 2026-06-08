import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import axios from "axios";
import { createHash } from "node:crypto";

import { PrismaService } from "../../prisma.service";
import { extractLinks } from "../../whatsapp/messages/whatsapp-message.helpers";
import { decryptAffiliateCredential } from "./affiliate-credential-secrets";
import { detectMarketplace, Marketplace } from "./helpers/detect-marketplace";
import { replaceLinksInText } from "./helpers/replace-links-in-text";
import { getAffiliateProvider } from "./providers/affiliate-provider.factory";
import { MercadoLivreAffiliateProvider } from "./providers/mercadolivre.provider";
import { AmazonAffiliateProvider } from "./providers/amazon.provider";
import type {
  MercadoLivreGenerationAttempt,
  MercadoLivreSocialCandidate,
  MercadoLivreSocialDebug,
} from "./providers/affiliate-provider.interface";

export type AffiliateRewriteResult = {
  originalUrl: string;
  rewrittenUrl: string;
  marketplace: Marketplace;
  changed: boolean;
  tag?: string;
  mode?: "real" | "legacy" | "disabled";
  reason?: string;
  error?: string;
  warning?: string;
  resolvedUrl?: string;
  attemptedPayloadUrl?: string;
  itemId?: string;
  affiliateUrl?: string;
  originalItemId?: string;
  generatedItemId?: string;
  sameProduct?: boolean;
  canForward?: boolean;
  originProductUrl?: string;
  mainProductUrl?: string;
  mainProductSource?:
    | "primary_show_product_action"
    | "pdp_filters_item_id"
    | "candidate_fallback"
    | "primary_cta"
    | "preloaded_primary"
    | "none";
  mainProductPath?: string;
  strategy?:
    | "show_product_action"
    | "pdp_filters_item_id"
    | "candidate_fallback";
  finalProductUrl?: string;
  originConfidence?: "explicit" | "canonical" | "none";
  generationAttempts?: MercadoLivreGenerationAttempt[];
  socialDebug?: MercadoLivreSocialDebug;
  socialCandidates?: MercadoLivreSocialCandidate[];
  candidates?: MercadoLivreSocialCandidate[];
  selectedCandidate?: MercadoLivreSocialCandidate;
  score?: number;
  candidatesCount?: number;
  ambiguous?: boolean;
  selectedCandidateReason?: string;
  offerKeywords?: string[];
  cacheHit?: boolean;
  matchReason?: string;
};

export type AffiliateMessageRewritePreview = {
  messageId: string;
  changed: boolean;
  originalText?: string;
  rewrittenText?: string;
  rewrites: AffiliateRewriteResult[];
  canForward: boolean;
  reason?: string;
};

export type MercadoLivreRawTestResult = {
  status: number;
  responseHeaders: Record<string, unknown>;
  requestHeaders: Record<string, unknown>;
  requestBody: unknown;
  body: unknown;
};

export type MercadoLivreSocialDebugResult = {
  resolvedUrl: string;
  generationAttempts: MercadoLivreGenerationAttempt[];
  socialDebug: MercadoLivreSocialDebug;
  candidates: MercadoLivreSocialDebug["candidates"];
};

const MERCADO_LIVRE_RAW_ENDPOINT =
  "https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links";

@Injectable()
export class AffiliateLinkRewriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoLivreProvider: MercadoLivreAffiliateProvider,
    private readonly amazonProvider: AmazonAffiliateProvider,
  ) {}

  async rewriteUrlForUser(
    userId: string,
    originalUrl: string,
    context?: { originalMessageText?: string },
  ): Promise<AffiliateRewriteResult> {
    const normalizedUserId = this.normalizeRequiredString(userId, "userId");
    const normalizedUrl = this.normalizeRequiredString(originalUrl, "url");
    const marketplace = detectMarketplace(normalizedUrl);

    if (marketplace === Marketplace.UNKNOWN) {
      return this.unchanged(normalizedUrl, marketplace, "UNKNOWN_MARKETPLACE");
    }

    const credential = await this.prisma.affiliateCredential.findUnique({
      where: {
        userId_marketplace: {
          userId: normalizedUserId,
          marketplace,
        },
      },
    });

    if (!credential?.isActive) {
      return this.unchanged(
        normalizedUrl,
        marketplace,
        marketplace === Marketplace.AMAZON
          ? "AMAZON_TAG_NOT_CONFIGURED"
          : "MISSING_CREDENTIAL",
        marketplace === Marketplace.AMAZON ? { canForward: false } : undefined,
      );
    }
    const decryptedCredential = decryptAffiliateCredential(credential);

    const provider = getAffiliateProvider(
      marketplace,
      this.mercadoLivreProvider,
      this.amazonProvider,
    );

    if (!provider) {
      return this.unchanged(normalizedUrl, marketplace, "MISSING_PROVIDER");
    }

    const cacheHash =
      marketplace === Marketplace.MERCADO_LIVRE &&
      !["disabled", "legacy"].includes(
        process.env.MERCADO_LIVRE_MODE?.trim().toLowerCase() ?? "real",
      )
        ? this.hashAffiliateCacheKey(
            normalizedUserId,
            marketplace,
            normalizedUrl,
            decryptedCredential.affiliateId ??
              decryptedCredential.trackingId ??
              "",
          )
        : undefined;

    if (cacheHash) {
      const cached = await this.readAffiliateCache(cacheHash);

      if (
        cached &&
        (!cached.expiresAt || cached.expiresAt.getTime() > Date.now()) &&
        cached.affiliateUrl.startsWith("https://meli.la/")
      ) {
        return {
          originalUrl: normalizedUrl,
          rewrittenUrl: cached.affiliateUrl,
          marketplace,
          changed: true,
          canForward: true,
          affiliateUrl: cached.affiliateUrl,
          cacheHit: true,
          reason: "CACHE_HIT",
          candidates: [],
          candidatesCount: 0,
          ambiguous: false,
          ...(cached.resolvedUrl ? { resolvedUrl: cached.resolvedUrl } : {}),
          ...(cached.itemId
            ? { itemId: cached.itemId, originalItemId: cached.itemId }
            : {}),
          ...(cached.source === "pdp_filters_item_id"
            ? {
                strategy: "pdp_filters_item_id" as const,
                mainProductSource: "pdp_filters_item_id" as const,
              }
            : {}),
          ...(cached.source ? { matchReason: `CACHE:${cached.source}` } : {}),
        };
      }
    }

    const providerResult = await provider.rewriteLink(
      normalizedUrl,
      decryptedCredential,
      context,
    );

    if (!providerResult.changed && providerResult.canForward !== true) {
      return this.unchanged(
        normalizedUrl,
        marketplace,
        providerResult.reason ?? "MISSING_AFFILIATE_VALUE",
        providerResult,
      );
    }

    const result: AffiliateRewriteResult = {
      originalUrl: normalizedUrl,
      rewrittenUrl: providerResult.rewrittenUrl,
      marketplace,
      changed: providerResult.changed,
      ...(providerResult.tag ? { tag: providerResult.tag } : {}),
      ...(providerResult.reason ? { reason: providerResult.reason } : {}),
      ...(providerResult.mode ? { mode: providerResult.mode } : {}),
      ...(providerResult.warning ? { warning: providerResult.warning } : {}),
      ...(providerResult.resolvedUrl
        ? { resolvedUrl: providerResult.resolvedUrl }
        : {}),
      ...(providerResult.attemptedPayloadUrl
        ? { attemptedPayloadUrl: providerResult.attemptedPayloadUrl }
        : {}),
      ...(providerResult.itemId ? { itemId: providerResult.itemId } : {}),
      ...(providerResult.originalItemId
        ? { originalItemId: providerResult.originalItemId }
        : {}),
      ...(providerResult.generatedItemId
        ? { generatedItemId: providerResult.generatedItemId }
        : {}),
      ...(providerResult.sameProduct !== undefined
        ? { sameProduct: providerResult.sameProduct }
        : {}),
      ...(providerResult.canForward !== undefined
        ? { canForward: providerResult.canForward }
        : {}),
      ...(providerResult.originProductUrl
        ? { originProductUrl: providerResult.originProductUrl }
        : {}),
      ...(providerResult.mainProductUrl
        ? { mainProductUrl: providerResult.mainProductUrl }
        : {}),
      ...(providerResult.mainProductSource
        ? { mainProductSource: providerResult.mainProductSource }
        : {}),
      ...(providerResult.mainProductPath
        ? { mainProductPath: providerResult.mainProductPath }
        : {}),
      ...(providerResult.strategy ? { strategy: providerResult.strategy } : {}),
      ...(providerResult.finalProductUrl
        ? { finalProductUrl: providerResult.finalProductUrl }
        : {}),
      ...(providerResult.originConfidence
        ? { originConfidence: providerResult.originConfidence }
        : {}),
      ...(providerResult.generationAttempts
        ? { generationAttempts: providerResult.generationAttempts }
        : {}),
      ...(providerResult.socialDebug
        ? { socialDebug: providerResult.socialDebug }
        : {}),
      ...(providerResult.socialCandidates
        ? {
            socialCandidates: providerResult.socialCandidates,
            candidates: providerResult.socialCandidates,
          }
        : {}),
      ...(providerResult.selectedCandidate
        ? {
            selectedCandidate: providerResult.selectedCandidate,
            score: providerResult.selectedCandidate.score,
          }
        : {}),
      ...(providerResult.candidatesCount !== undefined
        ? { candidatesCount: providerResult.candidatesCount }
        : {}),
      ...(providerResult.ambiguous !== undefined
        ? { ambiguous: providerResult.ambiguous }
        : {}),
      ...(providerResult.selectedCandidateReason
        ? { selectedCandidateReason: providerResult.selectedCandidateReason }
        : {}),
      ...(providerResult.offerKeywords
        ? { offerKeywords: providerResult.offerKeywords }
        : {}),
      ...(providerResult.cacheHit !== undefined
        ? { cacheHit: providerResult.cacheHit }
        : {}),
      ...(providerResult.matchReason
        ? { matchReason: providerResult.matchReason }
        : {}),
      ...(marketplace === Marketplace.MERCADO_LIVRE
        ? {
            affiliateUrl: providerResult.rewrittenUrl,
            candidatesCount: providerResult.candidatesCount ?? 0,
            ambiguous: providerResult.ambiguous ?? false,
          }
        : {}),
    };

    if (
      cacheHash &&
      result.canForward === true &&
      result.affiliateUrl?.startsWith("https://meli.la/")
    ) {
      await this.saveAffiliateCache({
        cacheHash,
        marketplace,
        originalUrl: normalizedUrl,
        result,
      });
    }

    return result;
  }

  async debugMercadoLivreSocialForUser(
    userId: string,
    originalUrl: string,
  ): Promise<MercadoLivreSocialDebugResult> {
    const normalizedUserId = this.normalizeRequiredString(userId, "userId");
    const normalizedUrl = this.normalizeRequiredString(originalUrl, "url");
    const credential = await this.prisma.affiliateCredential.findUnique({
      where: {
        userId_marketplace: {
          userId: normalizedUserId,
          marketplace: Marketplace.MERCADO_LIVRE,
        },
      },
    });

    if (!credential?.isActive) {
      throw new BadRequestException(
        "Mercado Livre affiliate credential is not configured.",
      );
    }

    const decrypted = decryptAffiliateCredential(credential);
    const ssid = this.readMercadoLivreSsid(decrypted.metadata);

    if (!ssid) {
      throw new BadRequestException("Mercado Livre SSID is not configured.");
    }

    const providerResult = await this.mercadoLivreProvider.rewriteLink(
      normalizedUrl,
      decrypted,
    );
    const resolvedUrl = providerResult.resolvedUrl ?? normalizedUrl;
    const socialDebug =
      providerResult.socialDebug ??
      (await this.mercadoLivreProvider.debugSocialPage(resolvedUrl, ssid));

    return {
      resolvedUrl,
      generationAttempts: providerResult.generationAttempts ?? [],
      socialDebug,
      candidates: socialDebug.candidates,
    };
  }

  async testMercadoLivreForUser(
    userId: string,
    originalUrl: string,
  ): Promise<AffiliateRewriteResult> {
    const result = await this.rewriteUrlForUser(userId, originalUrl);

    if (result.marketplace !== Marketplace.MERCADO_LIVRE) {
      return this.unchanged(
        result.originalUrl,
        Marketplace.MERCADO_LIVRE,
        "INVALID_MERCADO_LIVRE_URL",
      );
    }

    return result;
  }

  async testAmazonForUser(
    userId: string,
    originalUrl: string,
  ): Promise<AffiliateRewriteResult> {
    const result = await this.rewriteUrlForUser(userId, originalUrl);

    if (result.marketplace !== Marketplace.AMAZON) {
      return this.unchanged(
        result.originalUrl,
        Marketplace.AMAZON,
        "INVALID_AMAZON_URL",
        { canForward: false },
      );
    }

    return result;
  }

  async testMercadoLivreRawForUser(
    userId: string,
    originalUrl: string,
    payload?: unknown,
  ): Promise<MercadoLivreRawTestResult> {
    const normalizedUserId = this.normalizeRequiredString(userId, "userId");
    const normalizedUrl = this.normalizeRequiredString(originalUrl, "url");
    const credential = await this.prisma.affiliateCredential.findUnique({
      where: {
        userId_marketplace: {
          userId: normalizedUserId,
          marketplace: Marketplace.MERCADO_LIVRE,
        },
      },
    });

    if (!credential?.isActive) {
      throw new BadRequestException(
        "Mercado Livre affiliate credential is not configured.",
      );
    }

    const decrypted = decryptAffiliateCredential(credential);
    const affiliateId = (decrypted.affiliateId ?? decrypted.trackingId)?.trim();
    const ssid = this.readMercadoLivreSsid(decrypted.metadata);

    if (!affiliateId) {
      throw new BadRequestException(
        "Mercado Livre affiliate ID is not configured.",
      );
    }

    if (!ssid) {
      throw new BadRequestException("Mercado Livre SSID is not configured.");
    }

    const requestHeaders = {
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "pt-BR,pt;q=0.9",
      Origin: "https://produto.mercadolivre.com.br",
      Referer: "https://produto.mercadolivre.com.br/",
      "User-Agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Brave";v="146"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
      "sec-gpc": "1",
      "Content-Type": "application/json",
      Cookie: `ssid=${ssid}`,
    };
    const requestBody =
      payload === undefined ? { url: normalizedUrl } : payload;
    const response = await axios.post(MERCADO_LIVRE_RAW_ENDPOINT, requestBody, {
      headers: requestHeaders,
      validateStatus: () => true,
      maxRedirects: 0,
    });

    return {
      status: response.status,
      responseHeaders: this.redactSecret(response.headers, ssid) as Record<
        string,
        unknown
      >,
      requestHeaders: this.redactSecret(requestHeaders, ssid) as Record<
        string,
        unknown
      >,
      requestBody: this.redactSecret(requestBody, ssid),
      body: this.redactSecret(response.data, ssid),
    };
  }

  async rewriteUrlsForUser(
    userId: string,
    urls: string[],
    context?: { originalMessageText?: string },
  ): Promise<AffiliateRewriteResult[]> {
    if (!Array.isArray(urls)) {
      throw new BadRequestException("Field urls must be an array.");
    }

    return Promise.all(
      urls.map((url) => this.rewriteUrlForUser(userId, url, context)),
    );
  }

  async rewriteMessageForUser(
    userId: string,
    messageId: string,
  ): Promise<AffiliateMessageRewritePreview> {
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

    if (!message.text?.trim()) {
      return {
        messageId: message.id,
        changed: false,
        rewrites: [],
        canForward: false,
        reason: "EMPTY_TEXT",
      };
    }

    const links = this.readLinks(message.links, message.text);

    if (links.length === 0) {
      return {
        messageId: message.id,
        changed: false,
        originalText: message.text,
        rewrittenText: message.text,
        rewrites: [],
        canForward: false,
        reason: "NO_LINKS",
      };
    }

    const rewrites = await this.rewriteUrlsForUser(normalizedUserId, links, {
      originalMessageText: message.text,
    });
    let rewrittenText = replaceLinksInText(
      message.text,
      rewrites.filter((rewrite) => rewrite.changed),
    );
    const mercadoLivreRewrites = rewrites.filter(
      (rewrite) => rewrite.marketplace === Marketplace.MERCADO_LIVRE,
    );
    const successfulMercadoLivreRewrites = mercadoLivreRewrites.filter(
      (rewrite) =>
        rewrite.changed &&
        rewrite.canForward === true &&
        (rewrite.affiliateUrl ?? rewrite.rewrittenUrl).startsWith(
          "https://meli.la/",
        ),
    );
    const failedMercadoLivreRewrites = mercadoLivreRewrites.filter(
      (rewrite) => !successfulMercadoLivreRewrites.includes(rewrite),
    );
    const failedAmazonRewrites = rewrites.filter(
      (rewrite) =>
        rewrite.marketplace === Marketplace.AMAZON &&
        rewrite.canForward !== true,
    );
    const mercadoLivreFailureReason =
      failedMercadoLivreRewrites.find(
        (rewrite) => rewrite.reason === "MERCADO_LIVRE_PRODUCT_NOT_FOUND",
      )?.reason ?? "MERCADO_LIVRE_GENERATION_FAILED";

    if (failedMercadoLivreRewrites.length > 0) {
      rewrittenText = this.removeOriginalLinks(
        rewrittenText,
        failedMercadoLivreRewrites.map((rewrite) => rewrite.originalUrl),
      );
    }

    const canForward =
      failedAmazonRewrites.length === 0 &&
      (mercadoLivreRewrites.length > 0
        ? failedMercadoLivreRewrites.length === 0
        : rewrites.some(
            (rewrite) => rewrite.changed || rewrite.canForward === true,
          ));

    return {
      messageId: message.id,
      changed: rewrites.some((rewrite) => rewrite.changed),
      canForward,
      originalText: message.text,
      rewrittenText,
      rewrites,
      ...(failedAmazonRewrites.length > 0
        ? { reason: failedAmazonRewrites[0]?.reason }
        : failedMercadoLivreRewrites.length > 0
          ? { reason: mercadoLivreFailureReason }
          : {}),
    };
  }

  private unchanged(
    originalUrl: string,
    marketplace: Marketplace,
    reason: string,
    details?: {
      error?: string;
      mode?: "real" | "legacy" | "disabled";
      warning?: string;
      tag?: string;
      resolvedUrl?: string;
      attemptedPayloadUrl?: string;
      itemId?: string;
      originalItemId?: string;
      generatedItemId?: string;
      sameProduct?: boolean;
      canForward?: boolean;
      originProductUrl?: string;
      mainProductUrl?: string;
      mainProductSource?:
        | "primary_show_product_action"
        | "pdp_filters_item_id"
        | "candidate_fallback"
        | "primary_cta"
        | "preloaded_primary"
        | "none";
      mainProductPath?: string;
      strategy?:
        | "show_product_action"
        | "pdp_filters_item_id"
        | "candidate_fallback";
      finalProductUrl?: string;
      originConfidence?: "explicit" | "canonical" | "none";
      generationAttempts?: MercadoLivreGenerationAttempt[];
      socialDebug?: MercadoLivreSocialDebug;
      socialCandidates?: MercadoLivreSocialCandidate[];
      selectedCandidate?: MercadoLivreSocialCandidate;
      candidatesCount?: number;
      ambiguous?: boolean;
      selectedCandidateReason?: string;
      offerKeywords?: string[];
      cacheHit?: boolean;
      matchReason?: string;
    },
  ): AffiliateRewriteResult {
    return {
      originalUrl,
      rewrittenUrl: originalUrl,
      marketplace,
      changed: false,
      reason,
      ...(details?.mode ? { mode: details.mode } : {}),
      ...(details?.warning ? { warning: details.warning } : {}),
      ...(details?.tag ? { tag: details.tag } : {}),
      ...(details?.error ? { error: details.error } : {}),
      ...(details?.resolvedUrl ? { resolvedUrl: details.resolvedUrl } : {}),
      ...(details?.attemptedPayloadUrl
        ? { attemptedPayloadUrl: details.attemptedPayloadUrl }
        : {}),
      ...(details?.itemId ? { itemId: details.itemId } : {}),
      ...(details?.originalItemId
        ? { originalItemId: details.originalItemId }
        : {}),
      ...(details?.generatedItemId
        ? { generatedItemId: details.generatedItemId }
        : {}),
      ...(details?.sameProduct !== undefined
        ? { sameProduct: details.sameProduct }
        : {}),
      ...(details?.canForward !== undefined
        ? { canForward: details.canForward }
        : {}),
      ...(details?.originProductUrl
        ? { originProductUrl: details.originProductUrl }
        : {}),
      ...(details?.mainProductUrl
        ? { mainProductUrl: details.mainProductUrl }
        : {}),
      ...(details?.mainProductSource
        ? { mainProductSource: details.mainProductSource }
        : {}),
      ...(details?.mainProductPath
        ? { mainProductPath: details.mainProductPath }
        : {}),
      ...(details?.strategy ? { strategy: details.strategy } : {}),
      ...(details?.finalProductUrl
        ? { finalProductUrl: details.finalProductUrl }
        : {}),
      ...(details?.originConfidence
        ? { originConfidence: details.originConfidence }
        : {}),
      ...(details?.generationAttempts
        ? { generationAttempts: details.generationAttempts }
        : {}),
      ...(details?.socialDebug ? { socialDebug: details.socialDebug } : {}),
      ...(details?.socialCandidates
        ? {
            socialCandidates: details.socialCandidates,
            candidates: details.socialCandidates,
          }
        : {}),
      ...(details?.selectedCandidate
        ? {
            selectedCandidate: details.selectedCandidate,
            score: details.selectedCandidate.score,
          }
        : {}),
      ...(details?.candidatesCount !== undefined
        ? { candidatesCount: details.candidatesCount }
        : {}),
      ...(details?.ambiguous !== undefined
        ? { ambiguous: details.ambiguous }
        : {}),
      ...(details?.selectedCandidateReason
        ? { selectedCandidateReason: details.selectedCandidateReason }
        : {}),
      ...(details?.offerKeywords
        ? { offerKeywords: details.offerKeywords }
        : {}),
      ...(details?.cacheHit !== undefined
        ? { cacheHit: details.cacheHit }
        : {}),
      ...(details?.matchReason ? { matchReason: details.matchReason } : {}),
    };
  }

  private removeOriginalLinks(text: string, links: string[]): string {
    return links
      .reduce((value, link) => value.split(link).join(""), text)
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  private normalizeRequiredString(value: string, fieldName: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Field ${fieldName} is required.`);
    }

    return value.trim();
  }

  private hashAffiliateCacheKey(
    userId: string,
    marketplace: Marketplace,
    originalUrl: string,
    affiliateIdentity: string,
  ): string {
    return createHash("sha256")
      .update(
        `primary-cta-v1\n${marketplace}\n${userId}\n${affiliateIdentity}\n${originalUrl}`,
      )
      .digest("hex");
  }

  private cacheExpiration(): Date {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  private async readAffiliateCache(originalUrlHash: string) {
    try {
      return await this.prisma.affiliateLinkCache.findUnique({
        where: { originalUrlHash },
      });
    } catch (error) {
      console.warn(
        `[AFFILIATE_CACHE] read failed error=${this.readErrorMessage(error)}`,
      );
      return null;
    }
  }

  private async saveAffiliateCache(params: {
    cacheHash: string;
    marketplace: Marketplace;
    originalUrl: string;
    result: AffiliateRewriteResult;
  }): Promise<void> {
    try {
      await this.prisma.affiliateLinkCache.upsert({
        where: { originalUrlHash: params.cacheHash },
        create: {
          marketplace: params.marketplace,
          originalUrl: params.originalUrl,
          resolvedUrl: params.result.resolvedUrl,
          originalUrlHash: params.cacheHash,
          affiliateUrl: params.result.affiliateUrl!,
          itemId: params.result.itemId,
          source:
            params.result.mainProductSource ??
            params.result.selectedCandidate?.source ??
            "direct",
          expiresAt: this.cacheExpiration(),
        },
        update: {
          resolvedUrl: params.result.resolvedUrl,
          affiliateUrl: params.result.affiliateUrl!,
          itemId: params.result.itemId,
          source:
            params.result.mainProductSource ??
            params.result.selectedCandidate?.source ??
            "direct",
          expiresAt: this.cacheExpiration(),
        },
      });
    } catch (error) {
      console.warn(
        `[AFFILIATE_CACHE] write failed error=${this.readErrorMessage(error)}`,
      );
    }
  }

  private readErrorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message.slice(0, 160)
      : "Unknown error";
  }

  private readMercadoLivreSsid(
    metadata: Prisma.JsonValue | null,
  ): string | undefined {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return undefined;
    }

    for (const key of ["ssid", "sessionToken", "mlSessionToken"]) {
      const value = metadata[key];

      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return undefined;
  }

  private redactSecret(value: unknown, secret: string): unknown {
    if (typeof value === "string") {
      return value.split(secret).join("<REDACTED>");
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redactSecret(item, secret));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.redactSecret(item, secret),
        ]),
      );
    }

    return value;
  }

  private readLinks(value: Prisma.JsonValue | null, text: string): string[] {
    if (Array.isArray(value) && value.length > 0) {
      return value.filter((link): link is string => typeof link === "string");
    }

    return extractLinks(text);
  }
}
