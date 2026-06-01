export class WhatsAppGroupDto {
  id!: string;
  sessionId!: string;
  groupJid!: string;
  name!: string;
  participantCount!: number;
  isCommunity!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}

export class WhatsAppGroupSyncResultDto {
  sessionId!: string;
  syncedCount!: number;
  groups!: WhatsAppGroupDto[];
}
