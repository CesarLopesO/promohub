export class RewriteAffiliateLinkDto {
  userId!: string;
  url!: string;
}

export class RewriteAffiliateLinksBatchDto {
  userId!: string;
  urls!: string[];
}

export class RewriteCapturedMessageDto {
  userId!: string;
}
