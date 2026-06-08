import type { AffiliateCredential } from "@prisma/client";

export type AffiliateProviderResult = {
  rewrittenUrl: string;
  changed: boolean;
  mode?: "real" | "legacy" | "disabled";
  reason?: string;
  error?: string;
  warning?: string;
  resolvedUrl?: string;
  itemId?: string;
};

export interface AffiliateProvider {
  rewriteLink(
    originalUrl: string,
    credential: AffiliateCredential,
  ): Promise<AffiliateProviderResult>;
}
