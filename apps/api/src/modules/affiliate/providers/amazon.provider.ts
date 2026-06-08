import { Injectable } from "@nestjs/common";
import type { AffiliateCredential } from "@prisma/client";

import type { AffiliateProvider } from "./affiliate-provider.interface";

const AMAZON_SHORT_HOST = "amzn.to";
const AMAZON_HOSTS = new Set([
  "amazon.com",
  "www.amazon.com",
  "amazon.com.br",
  "www.amazon.com.br",
]);

@Injectable()
export class AmazonAffiliateProvider implements AffiliateProvider {
  async rewriteLink(originalUrl: string, credential: AffiliateCredential) {
    const tag = (credential.trackingId ?? credential.affiliateId)?.trim();

    if (!tag) {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        canForward: false,
        reason: "AMAZON_TAG_NOT_CONFIGURED",
      };
    }

    const normalizedOriginalUrl = this.ensureProtocol(originalUrl);
    let resolvedUrl = normalizedOriginalUrl;

    if (this.readHostname(normalizedOriginalUrl) === AMAZON_SHORT_HOST) {
      try {
        const response = await fetch(normalizedOriginalUrl, {
          method: "GET",
          redirect: "follow",
        });
        resolvedUrl = response.url;
      } catch (error) {
        return {
          rewrittenUrl: originalUrl,
          changed: false,
          canForward: false,
          tag,
          reason: "AMAZON_SHORT_URL_RESOLUTION_FAILED",
          error: this.readErrorMessage(error),
        };
      }
    }

    if (!AMAZON_HOSTS.has(this.readHostname(resolvedUrl))) {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        canForward: false,
        tag,
        resolvedUrl,
        reason: "INVALID_AMAZON_URL",
      };
    }

    const url = new URL(resolvedUrl);
    const normalizedSearchParams = new URLSearchParams();

    for (const [key, value] of url.searchParams.entries()) {
      if (key.trim() && value.trim()) {
        normalizedSearchParams.append(key, value);
      }
    }

    normalizedSearchParams.set("tag", tag);
    url.search = normalizedSearchParams.toString();
    const rewrittenUrl = url.toString();

    return {
      rewrittenUrl,
      changed: rewrittenUrl !== originalUrl,
      canForward: true,
      tag,
      ...(resolvedUrl !== normalizedOriginalUrl ? { resolvedUrl } : {}),
    };
  }

  private ensureProtocol(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  private readHostname(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  private readErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
