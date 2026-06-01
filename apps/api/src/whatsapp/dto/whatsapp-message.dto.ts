export class WhatsAppMessageDto {
  id!: string;
  sessionId!: string;
  groupJid!: string;
  senderJid?: string;
  messageId!: string;
  messageType!: string;
  text?: string;
  hasMedia!: boolean;
  links!: string[];
  marketplaces!: string[];
  rawMessage?: unknown;
  createdAt!: Date;
}

export class WhatsAppMessageListDto {
  sessionId!: string;
  page!: number;
  limit!: number;
  total!: number;
  messages!: WhatsAppMessageDto[];
}
