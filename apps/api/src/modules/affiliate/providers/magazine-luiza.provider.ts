import type { AffiliateCredential } from "@prisma/client";

import type { AffiliateProvider } from "./affiliate-provider.interface";

const MAGAZINE_VOCE_HOST = "magazinevoce.com.br";
const MAGALU_HOSTS = new Set([
  "magazineluiza.com.br",
  "magalu.com.br",
  "magalu.com",
]);

export class MagazineLuizaAffiliateProvider implements AffiliateProvider {
  async rewriteLink(originalUrl: string, credential: AffiliateCredential) {
    const storeSlug = credential.storeSlug?.trim().toLowerCase();

    if (!storeSlug) {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        canForward: false,
        reason: "MAGALU_CREDENTIAL_MISSING",
        warning:
          "Configure sua tag Magazine Luiza para converter links Magalu.",
      };
    }

    try {
      const url = new URL(this.ensureProtocol(originalUrl));
      const hostname = url.hostname.replace(/^www\./, "").toLowerCase();

      if (hostname === MAGAZINE_VOCE_HOST) {
        const pathParts = url.pathname.split("/").filter(Boolean);
        const remainingPath = pathParts.slice(1).join("/");
        url.pathname = this.buildPath(storeSlug, remainingPath);
      } else if (MAGALU_HOSTS.has(hostname)) {
        url.pathname = this.buildPath(
          storeSlug,
          url.pathname.replace(/^\/+/, ""),
        );
      } else {
        return {
          rewrittenUrl: originalUrl,
          changed: false,
          canForward: false,
          reason: "MAGALU_REWRITE_FAILED",
        };
      }

      url.protocol = "https:";
      url.hostname = `www.${MAGAZINE_VOCE_HOST}`;
      url.port = "";
      const rewrittenUrl = url.toString();

      return {
        rewrittenUrl,
        changed: rewrittenUrl !== originalUrl,
        canForward: true,
      };
    } catch {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        canForward: false,
        reason: "MAGALU_REWRITE_FAILED",
      };
    }
  }

  private buildPath(storeSlug: string, productPath: string): string {
    const normalizedPath = productPath.replace(/\/+/g, "/");
    return `/${storeSlug}/${normalizedPath}`.replace(/\/+/g, "/");
  }

  private ensureProtocol(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }
}
