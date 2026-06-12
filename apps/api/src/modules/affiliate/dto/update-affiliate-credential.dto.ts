export class UpdateAffiliateCredentialDto {
  marketplace?: string;
  affiliateId?: string | null;
  apiKey?: string | null;
  apiSecret?: string | null;
  trackingId?: string | null;
  storeSlug?: string | null;
  metadata?: unknown;
  isActive?: boolean;
}
