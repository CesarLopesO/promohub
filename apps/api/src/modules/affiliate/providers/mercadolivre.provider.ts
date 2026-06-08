import { Injectable } from "@nestjs/common";
import type { AffiliateCredential } from "@prisma/client";
import axios from "axios";

import {
  MercadoLivreGeneratorConfigMissingError,
  MercadoLivreLinkGeneratorService,
  MercadoLivreSessionInvalidError,
} from "../services/mercadolivre-link-generator.service";
import type { AffiliateProvider } from "./affiliate-provider.interface";
import { addQueryParam } from "./url-query-param";

@Injectable()
export class MercadoLivreAffiliateProvider implements AffiliateProvider {
  constructor(
    private readonly linkGenerator: MercadoLivreLinkGeneratorService,
  ) {}

  async rewriteLink(
    originalUrl: string,
    credential: AffiliateCredential,
  ) {
    const mode = this.readMode();
    const affiliateId = (
      credential.affiliateId ?? credential.trackingId
    )?.trim();
    const ssid = this.readSsid(credential.metadata);
    const csrfToken = this.readMetadataString(
      credential.metadata,
      "csrfToken",
    );

    if (mode === "disabled") {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        mode,
        reason: "MERCADO_LIVRE_DISABLED",
      };
    }

    if (!ssid) {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        mode,
        reason: "MISSING_MERCADO_LIVRE_SESSION",
      };
    }

    if (!affiliateId) {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        mode,
        reason: "MISSING_AFFILIATE_VALUE",
      };
    }

    console.log("[ML_AFFILIATE] resolving url");
    const resolvedUrl = await this.resolveUrl(originalUrl);
    let generatorUrl = resolvedUrl ?? originalUrl;
    console.log("[ML_AFFILIATE] resolved url");

    if (this.isSocialUrl(generatorUrl)) {
      console.log("[ML_AFFILIATE] social link detected");
      const originProductUrl = await this.findSocialOriginProductUrl(
        generatorUrl,
        ssid,
      );

      if (!originProductUrl) {
        console.log("[ML_AFFILIATE] origin product not found");

        return {
          rewrittenUrl: originalUrl,
          changed: false,
          mode,
          resolvedUrl,
          reason: "MERCADO_LIVRE_SOCIAL_ORIGIN_NOT_FOUND",
        };
      }

      generatorUrl = originProductUrl;
      console.log("[ML_AFFILIATE] origin product found");
    }

    const itemId = this.extractItemId(generatorUrl);

    if (mode === "legacy") {
      const rewrittenUrl = addQueryParam(originalUrl, "aff_id", affiliateId);

      return {
        rewrittenUrl,
        changed: rewrittenUrl !== originalUrl,
        mode,
        resolvedUrl,
        itemId,
        warning: "Modo legado não garante comissão.",
      };
    }

    try {
      console.log("[ML_AFFILIATE] generating affiliate link");
      const rewrittenUrl = await this.linkGenerator.generateAffiliateLink({
        originalUrl,
        resolvedUrl: generatorUrl,
        itemId,
        affiliateId,
        ssid,
        csrfToken,
      });
      console.log("[ML_AFFILIATE] success");

      return {
        rewrittenUrl,
        changed: rewrittenUrl !== originalUrl,
        mode,
        resolvedUrl,
        itemId,
      };
    } catch (error) {
      const errorMessage = this.summarizeError(error);
      const reason =
        error instanceof MercadoLivreGeneratorConfigMissingError
          ? error.code
          : error instanceof MercadoLivreSessionInvalidError
            ? error.code
          : "MERCADO_LIVRE_GENERATION_FAILED";
      console.log(
        `[ML_AFFILIATE] failed reason=${reason}`,
      );

      return {
        rewrittenUrl: originalUrl,
        changed: false,
        mode,
        resolvedUrl,
        itemId,
        reason,
        error: errorMessage,
      };
    }
  }

  async resolveUrl(originalUrl: string): Promise<string | undefined> {
    const hostname = this.readHostname(originalUrl);

    if (hostname !== "meli.la" && !hostname.endsWith(".meli.la")) {
      return originalUrl;
    }

    for (const method of ["HEAD", "GET"] as const) {
      try {
        const response = await fetch(originalUrl, {
          method,
          redirect: "follow",
          headers: {
            "User-Agent": "PromoHub/1.0",
          },
        });

        if (response.url && response.url !== originalUrl) {
          return response.url;
        }
      } catch {
        // GET is attempted when HEAD is unavailable.
      }
    }

    return originalUrl;
  }

  extractItemId(url: string): string | undefined {
    const match = url.match(/\b(MLB)[-_]?(\d{6,})\b/i);

    return match ? `${match[1].toUpperCase()}${match[2]}` : undefined;
  }

  private async findSocialOriginProductUrl(
    socialUrl: string,
    ssid: string,
  ): Promise<string | undefined> {
    try {
      const response = await axios.get(socialUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/json",
          "Accept-Language": "pt-BR,pt;q=0.9",
          Referer: "https://www.mercadolivre.com.br/",
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
          Cookie: this.buildSsidCookie(ssid),
        },
        validateStatus: () => true,
        maxRedirects: 5,
        responseType: "text",
      });
      const body =
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data);

      return this.extractProductUrlFromSocialPage(body);
    } catch {
      return undefined;
    }
  }

  extractProductUrlFromSocialPage(body: string): string | undefined {
    const normalizedBody = this.decodeEscapedText(body);
    const candidates: string[] = [];
    const patterns = [
      /["']origin_url["']\s*:\s*["']([^"']+)["']/gi,
      /["']originUrl["']\s*:\s*["']([^"']+)["']/gi,
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi,
      /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/gi,
      /https?:\/\/(?:produto\.)?mercadolivre\.com\.br\/[^"'<>\\\s]*MLB[-_]?\d+[^"'<>\\\s]*/gi,
    ];

    for (const pattern of patterns) {
      for (const match of normalizedBody.matchAll(pattern)) {
        candidates.push(match[1] ?? match[0]);
      }
    }

    const relativeItem = normalizedBody.match(
      /\/(?:[^"'<>\\\s/]+\/)*MLB[-_]?\d+[^"'<>\\\s]*/i,
    )?.[0];

    if (relativeItem) {
      candidates.push(
        new URL(relativeItem, "https://produto.mercadolivre.com.br").toString(),
      );
    }

    for (const candidate of candidates) {
      const productUrl = this.normalizeProductUrl(candidate);

      if (productUrl) {
        return productUrl;
      }
    }

    return undefined;
  }

  private normalizeProductUrl(value: string): string | undefined {
    let normalized = this.decodeEscapedText(value).trim();

    try {
      normalized = decodeURIComponent(normalized);
    } catch {
      // The candidate may already be decoded.
    }

    try {
      const url = new URL(normalized);
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

      if (
        !(
          hostname === "mercadolivre.com.br" ||
          hostname.endsWith(".mercadolivre.com.br")
        ) ||
        this.isSocialUrl(url.toString()) ||
        !this.extractItemId(url.toString())
      ) {
        return undefined;
      }

      return url.toString();
    } catch {
      return undefined;
    }
  }

  private decodeEscapedText(value: string): string {
    return value
      .replace(/\\u002F/gi, "/")
      .replace(/\\u003A/gi, ":")
      .replace(/\\\//g, "/")
      .replace(/&quot;/gi, '"')
      .replace(/&amp;/gi, "&");
  }

  private isSocialUrl(url: string): boolean {
    try {
      return new URL(url).pathname.toLowerCase().includes("/social/");
    } catch {
      return false;
    }
  }

  private buildSsidCookie(ssid: string): string {
    return /(?:^|;\s*)ssid=/i.test(ssid) ? ssid : `ssid=${ssid}`;
  }

  private readSsid(metadata: AffiliateCredential["metadata"]): string | undefined {
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

  private readMetadataString(
    metadata: AffiliateCredential["metadata"],
    key: string,
  ): string | undefined {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return undefined;
    }

    const value = metadata[key];

    return typeof value === "string" && value.trim()
      ? value.trim()
      : undefined;
  }

  private readHostname(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  }

  private readMode(): "real" | "legacy" | "disabled" {
    const mode = process.env.MERCADO_LIVRE_MODE?.trim().toLowerCase();

    return mode === "legacy" || mode === "disabled" ? mode : "real";
  }

  private summarizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : "Unknown error";

    return message.replace(/ssid=[^;\s]+/gi, "ssid=[REDACTED]").slice(0, 240);
  }
}
