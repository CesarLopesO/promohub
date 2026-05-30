import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from "@nestjs/common";
import makeWASocket, {
  DEFAULT_CONNECTION_CONFIG,
  DisconnectReason,
  type ConnectionState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import QRCode from "qrcode";

import { PrismaService } from "../../prisma.service";
import { BaileysPrismaAuthStore } from "../auth/baileys-prisma-auth.store";
import type { WhatsAppSessionStatusDto } from "../dto/whatsapp-session-status.dto";

type ManagedSession = {
  socket: WASocket;
  qrCode?: string;
  qrCodeDataUrl?: string;
};

const QR_WAIT_TIMEOUT_MS = 25_000;

@Injectable()
export class WhatsAppSessionManager implements OnModuleDestroy {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly pendingStarts = new Map<
    string,
    Promise<WhatsAppSessionStatusDto>
  >();
  private readonly logger = pino({ level: "silent" });

  constructor(
    private readonly prisma: PrismaService,
    private readonly authStore: BaileysPrismaAuthStore,
  ) {}

  async connect(userId: string): Promise<WhatsAppSessionStatusDto> {
    const normalizedUserId = this.normalizeUserId(userId);
    const existing = this.sessions.get(normalizedUserId);

    if (existing) {
      return this.readStatus(normalizedUserId);
    }

    const pending = this.pendingStarts.get(normalizedUserId);

    if (pending) {
      return pending;
    }

    const startPromise = this.startSession(normalizedUserId);
    this.pendingStarts.set(normalizedUserId, startPromise);

    try {
      return await startPromise;
    } finally {
      this.pendingStarts.delete(normalizedUserId);
    }
  }

  async readStatus(userId: string): Promise<WhatsAppSessionStatusDto> {
    const normalizedUserId = this.normalizeUserId(userId);
    const session = await this.prisma.whatsAppSession.findUnique({
      where: {
        userId: normalizedUserId,
      },
    });

    if (!session) {
      return {
        userId: normalizedUserId,
        status: "DISCONNECTED",
      };
    }

    return {
      userId: session.userId,
      status: session.status,
      qrCodeDataUrl: session.qrCodeDataUrl ?? undefined,
      phoneNumber: session.phoneNumber ?? undefined,
      connectedAt: session.connectedAt ?? undefined,
      disconnectedAt: session.disconnectedAt ?? undefined,
      updatedAt: session.updatedAt,
    };
  }

  async disconnect(userId: string): Promise<WhatsAppSessionStatusDto> {
    const normalizedUserId = this.normalizeUserId(userId);
    const managed = this.sessions.get(normalizedUserId);

    if (managed) {
      await managed.socket.logout().catch(() => undefined);
      managed.socket.end(undefined);
      this.sessions.delete(normalizedUserId);
    }

    await this.authStore.clear(normalizedUserId);

    const session = await this.prisma.whatsAppSession.findUnique({
      where: {
        userId: normalizedUserId,
      },
    });

    if (!session) {
      throw new NotFoundException("WhatsApp session not found.");
    }

    await this.prisma.whatsAppSession.update({
      where: {
        userId: normalizedUserId,
      },
      data: {
        status: "DISCONNECTED",
        qrCode: null,
        qrCodeDataUrl: null,
        phoneNumber: null,
        connectedAt: null,
        disconnectedAt: new Date(),
      },
    });

    return this.readStatus(normalizedUserId);
  }

  async onModuleDestroy() {
    for (const session of this.sessions.values()) {
      session.socket.end(undefined);
    }

    this.sessions.clear();
  }

  private async startSession(
    userId: string,
  ): Promise<WhatsAppSessionStatusDto> {
    await this.prisma.whatsAppSession.upsert({
      where: {
        userId,
      },
      create: {
        userId,
        status: "CONNECTING",
      },
      update: {
        status: "CONNECTING",
        disconnectedAt: null,
      },
    });

    const { state, saveCreds } = await this.authStore.getAuthState(userId);
    const socket = makeWASocket({
      auth: state,
      logger: this.logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      version: DEFAULT_CONNECTION_CONFIG.version,
    });

    this.sessions.set(userId, { socket });
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", (update) => {
      void this.handleConnectionUpdate(userId, socket, update);
    });

    return this.waitForQrOrConnection(userId);
  }

  private async handleConnectionUpdate(
    userId: string,
    socket: WASocket,
    update: Partial<ConnectionState>,
  ): Promise<void> {
    const managed = this.sessions.get(userId);

    if (update.qr) {
      const qrCodeDataUrl = await QRCode.toDataURL(update.qr);

      if (managed) {
        managed.qrCode = update.qr;
        managed.qrCodeDataUrl = qrCodeDataUrl;
      }

      await this.prisma.whatsAppSession.update({
        where: {
          userId,
        },
        data: {
          status: "QR_READY",
          qrCode: update.qr,
          qrCodeDataUrl,
          lastQrAt: new Date(),
        },
      });
    }

    if (update.connection === "open") {
      await this.prisma.whatsAppSession.update({
        where: {
          userId,
        },
        data: {
          status: "CONNECTED",
          qrCode: null,
          qrCodeDataUrl: null,
          phoneNumber: socket.user?.id,
          connectedAt: new Date(),
          disconnectedAt: null,
        },
      });
    }

    if (update.connection === "close") {
      const statusCode = this.readDisconnectStatusCode(update);
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      this.sessions.delete(userId);

      await this.prisma.whatsAppSession.update({
        where: {
          userId,
        },
        data: {
          status: "DISCONNECTED",
          qrCode: null,
          qrCodeDataUrl: null,
          disconnectedAt: new Date(),
        },
      });

      if (shouldReconnect) {
        void this.connect(userId).catch(() => undefined);
      } else {
        await this.authStore.clear(userId);
      }
    }
  }

  private async waitForQrOrConnection(
    userId: string,
  ): Promise<WhatsAppSessionStatusDto> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < QR_WAIT_TIMEOUT_MS) {
      const status = await this.readStatus(userId);

      if (status.status === "QR_READY" || status.status === "CONNECTED") {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return this.readStatus(userId);
  }

  private readDisconnectStatusCode(update: Partial<ConnectionState>) {
    const error = update.lastDisconnect?.error;

    if (error instanceof Boom) {
      return error.output.statusCode;
    }

    return undefined;
  }

  private normalizeUserId(userId: string): string {
    if (!userId || typeof userId !== "string" || !userId.trim()) {
      throw new BadRequestException("Field userId is required.");
    }

    return userId.trim();
  }
}
