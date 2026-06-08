import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import axios from "axios";

import { PrismaService } from "../../prisma.service";
import { extractLinks } from "../../whatsapp/messages/whatsapp-message.helpers";
import { decryptAffiliateCredential } from "./affiliate-credential-secrets";
import { detectMarketplace, Marketplace } from "./helpers/detect-marketplace";
import { replaceLinksInText } from "./helpers/replace-links-in-text";
import { getAffiliateProvider } from "./providers/affiliate-provider.factory";
import { MercadoLivreAffiliateProvider } from "./providers/mercadolivre.provider";

export type AffiliateRewriteResult = {
  originalUrl: string;
  rewrittenUrl: string;
  marketplace: Marketplace;
  changed: boolean;
  mode?: "real" | "legacy" | "disabled";
  reason?: string;
  error?: string;
  warning?: string;
  resolvedUrl?: string;
  itemId?: string;
  affiliateUrl?: string;
};

export type AffiliateMessageRewritePreview = {
  messageId: string;
  changed: boolean;
  originalText?: string;
  rewrittenText?: string;
  rewrites: AffiliateRewriteResult[];
  reason?: string;
};

export type MercadoLivreRawTestResult = {
  status: number;
  responseHeaders: Record<string, unknown>;
  requestHeaders: Record<string, unknown>;
  requestBody: unknown;
  body: unknown;
};

const MERCADO_LIVRE_RAW_ENDPOINT =
  "https://www.mercadolivre.com.br/affiliate-program/api/v2/stripe/user/links";

@Injectable()
export class AffiliateLinkRewriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mercadoLivreProvider: MercadoLivreAffiliateProvider,
  ) {}

  async rewriteUrlForUser(
    userId: string,
    originalUrl: string,
  ): Promise<AffiliateRewriteResult> {
    const normalizedUserId = this.normalizeRequiredString(userId, "userId");
    const normalizedUrl = this.normalizeRequiredString(originalUrl, "url");
    const marketplace = detectMarketplace(normalizedUrl);

    if (marketplace === Marketplace.UNKNOWN) {
      return this.unchanged(
        normalizedUrl,
        marketplace,
        "UNKNOWN_MARKETPLACE",
      );
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
      return this.unchanged(normalizedUrl, marketplace, "MISSING_CREDENTIAL");
    }

    const provider = getAffiliateProvider(
      marketplace,
      this.mercadoLivreProvider,
    );

    if (!provider) {
      return this.unchanged(normalizedUrl, marketplace, "MISSING_PROVIDER");
    }

    const providerResult = await provider.rewriteLink(
      normalizedUrl,
      decryptAffiliateCredential(credential),
    );

    if (!providerResult.changed) {
      return this.unchanged(
        normalizedUrl,
        marketplace,
        providerResult.reason ?? "MISSING_AFFILIATE_VALUE",
        providerResult,
      );
    }

    return {
      originalUrl: normalizedUrl,
      rewrittenUrl: providerResult.rewrittenUrl,
      marketplace,
      changed: true,
      ...(providerResult.reason ? { reason: providerResult.reason } : {}),
      ...(providerResult.mode ? { mode: providerResult.mode } : {}),
      ...(providerResult.warning ? { warning: providerResult.warning } : {}),
      ...(providerResult.resolvedUrl
        ? { resolvedUrl: providerResult.resolvedUrl }
        : {}),
      ...(providerResult.itemId ? { itemId: providerResult.itemId } : {}),
      ...(marketplace === Marketplace.MERCADO_LIVRE
        ? { affiliateUrl: providerResult.rewrittenUrl }
        : {}),
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
    const affiliateId = (
      decrypted.affiliateId ?? decrypted.trackingId
    )?.trim();
    const ssid = this.readMercadoLivreSsid(decrypted.metadata);

    if (!affiliateId) {
      throw new BadRequestException(
        "Mercado Livre affiliate ID is not configured.",
      );
    }

    if (!ssid) {
      throw new BadRequestException(
        "Mercado Livre SSID is not configured.",
      );
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
      "sec-ch-ua":
        '"Chromium";v="146", "Not-A.Brand";v="24", "Brave";v="146"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
      "sec-gpc": "1",
      "Content-Type": "application/json",
      Cookie: `ssid=${ssid}`,
    };
    const requestBody = payload === undefined ? { url: normalizedUrl } : payload;
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
  ): Promise<AffiliateRewriteResult[]> {
    if (!Array.isArray(urls)) {
      throw new BadRequestException("Field urls must be an array.");
    }

    return Promise.all(
      urls.map((url) => this.rewriteUrlForUser(userId, url)),
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
        reason: "NO_LINKS",
      };
    }

    const rewrites = await this.rewriteUrlsForUser(normalizedUserId, links);
    const rewrittenText = replaceLinksInText(
      message.text,
      rewrites.filter((rewrite) => rewrite.changed),
    );

    return {
      messageId: message.id,
      changed: rewrites.some((rewrite) => rewrite.changed),
      originalText: message.text,
      rewrittenText,
      rewrites,
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
      resolvedUrl?: string;
      itemId?: string;
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
      ...(details?.error ? { error: details.error } : {}),
      ...(details?.resolvedUrl ? { resolvedUrl: details.resolvedUrl } : {}),
      ...(details?.itemId ? { itemId: details.itemId } : {}),
    };
  }

  private normalizeRequiredString(value: string, fieldName: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Field ${fieldName} is required.`);
    }

    return value.trim();
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
