export class CreateAffiliateCredentialDto {
  marketplace!: string;
  affiliateId?: string;
  apiKey?: string;
  apiSecret?: string;
  trackingId?: string;
  metadata?: unknown;
}
