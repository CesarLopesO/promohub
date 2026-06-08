import type { AffiliateCredential } from "@prisma/client";

import type { AffiliateProvider } from "./affiliate-provider.interface";
import { addQueryParam } from "./url-query-param";

export class ShopeeAffiliateProvider implements AffiliateProvider {
  async rewriteLink(
    originalUrl: string,
    credential: AffiliateCredential,
  ) {
    const rewrittenUrl = addQueryParam(
      originalUrl,
      "affiliate",
      credential.affiliateId ?? credential.apiKey,
    );

    return {
      rewrittenUrl,
      changed: rewrittenUrl !== originalUrl,
    };
  }
}
