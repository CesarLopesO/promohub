export class CreateAffiliateCredentialDto {
  userId!: string;
  marketplace!: string;
  affiliateId?: string;
  apiKey?: string;
  apiSecret?: string;
  trackingId?: string;
  metadata?: unknown;
}
