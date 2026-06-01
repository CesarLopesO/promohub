import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma.service";
import { extractLinks } from "../../whatsapp/messages/whatsapp-message.helpers";
import { detectMarketplace, Marketplace } from "./helpers/detect-marketplace";
import { replaceLinksInText } from "./helpers/replace-links-in-text";
import { getAffiliateProvider } from "./providers/affiliate-provider.factory";

export type AffiliateRewriteResult = {
  originalUrl: string;
  rewrittenUrl: string;
  marketplace: Marketplace;
  changed: boolean;
  reason?: string;
};

export type AffiliateMessageRewritePreview = {
  messageId: string;
  changed: boolean;
  originalText?: string;
  rewrittenText?: string;
  rewrites: AffiliateRewriteResult[];
  reason?: string;
};

@Injectable()
export class AffiliateLinkRewriterService {
  constructor(private readonly prisma: PrismaService) {}

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

    const provider = getAffiliateProvider(marketplace);

    if (!provider) {
      return this.unchanged(normalizedUrl, marketplace, "MISSING_PROVIDER");
    }

    const rewrittenUrl = await provider.rewriteLink(normalizedUrl, credential);

    if (rewrittenUrl === normalizedUrl) {
      return this.unchanged(
        normalizedUrl,
        marketplace,
        "MISSING_AFFILIATE_VALUE",
      );
    }

    return {
      originalUrl: normalizedUrl,
      rewrittenUrl,
      marketplace,
      changed: true,
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
  ): AffiliateRewriteResult {
    return {
      originalUrl,
      rewrittenUrl: originalUrl,
      marketplace,
      changed: false,
      reason,
    };
  }

  private normalizeRequiredString(value: string, fieldName: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Field ${fieldName} is required.`);
    }

    return value.trim();
  }

  private readLinks(value: Prisma.JsonValue | null, text: string): string[] {
    if (Array.isArray(value) && value.length > 0) {
      return value.filter((link): link is string => typeof link === "string");
    }

    return extractLinks(text);
  }
}
