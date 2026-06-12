export class UpdateAffiliateCredentialDto {
  marketplace?: string;
  affiliateId?: string | null;
  apiKey?: string | null;
  apiSecret?: string | null;
  appId?: string | null;
  appSecret?: string | null;
  password?: string | null;
  trackingId?: string | null;
  storeSlug?: string | null;
  metadata?: unknown;
  isActive?: boolean;
}
