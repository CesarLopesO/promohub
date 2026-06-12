import type { AffiliateCredential } from "@prisma/client";

import type { AffiliateProvider } from "./affiliate-provider.interface";

export class ShopeeAffiliateProvider implements AffiliateProvider {
  async rewriteLink(originalUrl: string, credential: AffiliateCredential) {
    if (!credential.apiKey || !credential.apiSecret) {
      return {
        rewrittenUrl: originalUrl,
        changed: false,
        canForward: true,
        reason: "SHOPEE_CREDENTIAL_MISSING",
      };
    }

    return {
      rewrittenUrl: originalUrl,
      changed: false,
      canForward: true,
      reason: "SHOPEE_GENERATOR_NOT_IMPLEMENTED",
      warning:
        "Shopee está com credenciais salvas, mas a geração automática ainda não foi ativada.",
    };
  }
}
