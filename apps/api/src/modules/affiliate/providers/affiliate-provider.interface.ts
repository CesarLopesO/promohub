import type { AffiliateCredential } from "@prisma/client";

export interface AffiliateProvider {
  rewriteLink(
    originalUrl: string,
    credential: AffiliateCredential,
  ): Promise<string>;
}
