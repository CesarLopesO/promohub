export class UpsertAffiliateGeneratorConfigDto {
  method!: string;
  url!: string;
  headers?: unknown;
  bodyTemplate?: unknown;
  responsePath?: string | null;
  isActive?: boolean;
}
