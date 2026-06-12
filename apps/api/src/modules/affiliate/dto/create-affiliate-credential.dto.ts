export class CreateAffiliateCredentialDto {
  marketplace!: string;
  affiliateId?: string;
  apiKey?: string;
  apiSecret?: string;
  trackingId?: string;
  storeSlug?: string;
  metadata?: unknown;
}
