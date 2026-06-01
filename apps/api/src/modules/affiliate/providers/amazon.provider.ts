import type { AffiliateCredential } from "@prisma/client";

import type { AffiliateProvider } from "./affiliate-provider.interface";
import { addQueryParam } from "./url-query-param";

export class AmazonAffiliateProvider implements AffiliateProvider {
  async rewriteLink(
    originalUrl: string,
    credential: AffiliateCredential,
  ): Promise<string> {
    return addQueryParam(
      originalUrl,
      "tag",
      credential.trackingId ?? credential.affiliateId,
    );
  }
}
