export class CreateAffiliateCredentialDto {
  marketplace!: string;
  affiliateId?: string;
  apiKey?: string;
  apiSecret?: string;
  appId?: string;
  appSecret?: string;
  password?: string;
  trackingId?: string;
  storeSlug?: string;
  metadata?: unknown;
}
