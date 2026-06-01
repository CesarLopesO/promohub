export class WhatsAppSessionStatusDto {
  id!: string;
  userId!: string;
  sessionId!: string;
  status!: "DISCONNECTED" | "CONNECTING" | "QR_READY" | "CONNECTED";
  qrCode?: string;
  qrCodeDataUrl?: string;
  phoneNumber?: string;
  connectedAt?: Date;
  disconnectedAt?: Date;
  updatedAt?: Date;
}
