import type { AffiliateCredential } from "@prisma/client";

import type { AffiliateProvider } from "./affiliate-provider.interface";
import { addQueryParam } from "./url-query-param";

export class MercadoLivreAffiliateProvider implements AffiliateProvider {
  async rewriteLink(
    originalUrl: string,
    credential: AffiliateCredential,
  ): Promise<string> {
    return addQueryParam(
      originalUrl,
      "aff_id",
      credential.affiliateId ?? credential.trackingId,
    );
  }
}
