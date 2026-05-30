export class WhatsAppSessionStatusDto {
  userId!: string;
  status!: "DISCONNECTED" | "CONNECTING" | "QR_READY" | "CONNECTED";
  qrCodeDataUrl?: string;
  phoneNumber?: string;
  connectedAt?: Date;
  disconnectedAt?: Date;
  updatedAt?: Date;
}
