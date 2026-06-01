import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Boom } from "@hapi/boom";
import makeWASocket, {
  DEFAULT_CONNECTION_CONFIG,
  DisconnectReason,
  type ConnectionState,
  type WASocket,
} from "@whiskeysockets/baileys";
import pino from "pino";
import QRCode from "qrcode";
import { randomUUID } from "crypto";
import type { WhatsAppSession } from "@prisma/client";

import { PrismaService } from "../../prisma.service";
import { BaileysPrismaAuthStore } from "../auth/baileys-prisma-auth.store";
import type { WhatsAppSessionStatusDto } from "../dto/whatsapp-session-status.dto";
import { WhatsAppSessionCacheService } from "./whatsapp-session-cache.service";

type ManagedSession = {
  socket: WASocket;
  qrCode?: string;
  qrCodeDataUrl?: string;
};

const QR_WAIT_TIMEOUT_MS = 25_000;

@Injectable()
export class WhatsAppSessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly pendingStarts = new Map<
    string,
    Promise<WhatsAppSessionStatusDto>
  >();
  private readonly logger = pino({ level: "silent" });

  constructor(
    private readonly prisma: PrismaService,
    private readonly authStore: BaileysPrismaAuthStore,
    private readonly cache: WhatsAppSessionCacheService,
  ) {}

  async onModuleInit() {
    const sessions = await this.prisma.whatsAppSession.findMany({
      where: {
        status: {
          in: ["CONNECTING", "QR_READY", "CONNECTED"],
        },
      },
    });

    for (const session of sessions) {
      void this.startRuntime(session.sessionId).catch(() => undefined);
    }
  }

  async createSession(
    userId: string,
    requestedSessionId?: string,
  ): Promise<WhatsAppSessionStatusDto> {
    const normalizedUserId = this.normalizeRequiredString(userId, "userId");
    const sessionId =
      requestedSessionId?.trim() || `wa_${randomUUID().replace(/-/g, "")}`;

    const existing = await this.prisma.whatsAppSession.findUnique({
      where: {
        sessionId,
      },
    });

    if (existing) {
      throw new BadRequestException("sessionId already exists.");
    }

    await this.prisma.whatsAppSession.create({
      data: {
        userId: normalizedUserId,
        sessionId,
        status: "CONNECTING",
      },
    });

    return this.startRuntime(sessionId);
  }

  async readStatus(id: string): Promise<WhatsAppSessionStatusDto> {
    const session = await this.findSessionById(id);

    const status = this.toStatusDto(session);
    await this.cache.setSession(status);

    return status;
  }

  async readQr(id: string): Promise<{
    id: string;
    sessionId: string;
    status: WhatsAppSessionStatusDto["status"];
    qrCode?: string;
    qrCodeDataUrl?: string;
  }> {
    const session = await this.findSessionById(id);

    return {
      id: session.id,
      sessionId: session.sessionId,
      status: session.status,
      qrCode: session.qrCode ?? undefined,
      qrCodeDataUrl: session.qrCodeDataUrl ?? undefined,
    };
  }

  async getConnectedSocket(id: string): Promise<{
    session: WhatsAppSession;
    socket: WASocket;
  }> {
    let session = await this.findSessionById(id);

    if (session.status !== "CONNECTED") {
      throw new BadRequestException(
        "WhatsApp session is not connected yet. Scan the QR Code before syncing groups.",
      );
    }

    let managed = this.sessions.get(session.sessionId);

    if (!managed) {
      await this.startRuntime(session.sessionId);
      session = await this.findSessionById(id);
      managed = this.sessions.get(session.sessionId);
    }

    if (session.status !== "CONNECTED" || !managed) {
      throw new ServiceUnavailableException(
        "WhatsApp session is reconnecting. Try again in a few seconds.",
      );
    }

    return {
      session,
      socket: managed.socket,
    };
  }

  async deleteSession(id: string): Promise<WhatsAppSessionStatusDto> {
    const session = await this.findSessionById(id);
    const managed = this.sessions.get(session.sessionId);

    if (managed) {
      await managed.socket.logout().catch(() => undefined);
      managed.socket.end(undefined);
      this.sessions.delete(session.sessionId);
    }

    await this.authStore.clear(session.sessionId);

    const updated = await this.prisma.whatsAppSession.update({
      where: {
        id: session.id,
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

    const status = this.toStatusDto(updated);
    await this.cache.deleteSession(session.id);
    await this.cache.setSession(status);

    return status;
  }

  async onModuleDestroy() {
    for (const session of this.sessions.values()) {
      session.socket.end(undefined);
    }

    this.sessions.clear();
  }

  private async startRuntime(
    sessionId: string,
  ): Promise<WhatsAppSessionStatusDto> {
    const pending = this.pendingStarts.get(sessionId);

    if (pending) {
      return pending;
    }

    const existing = this.sessions.get(sessionId);

    if (existing) {
      return this.readStatusBySessionId(sessionId);
    }

    const startPromise = this.bootSocket(sessionId);
    this.pendingStarts.set(sessionId, startPromise);

    try {
      return await startPromise;
    } finally {
      this.pendingStarts.delete(sessionId);
    }
  }

  private async bootSocket(
    sessionId: string,
  ): Promise<WhatsAppSessionStatusDto> {
    const session = await this.prisma.whatsAppSession.update({
      where: {
        sessionId,
      },
      data: {
        status: "CONNECTING",
        disconnectedAt: null,
      },
    });

    const { state, saveCreds } = await this.authStore.getAuthState(
      session.sessionId,
    );
    const socket = makeWASocket({
      auth: state,
      logger: this.logger,
      printQRInTerminal: false,
      syncFullHistory: false,
      version: DEFAULT_CONNECTION_CONFIG.version,
    });

    this.sessions.set(session.sessionId, { socket });
    socket.ev.on("creds.update", saveCreds);
    socket.ev.on("connection.update", (update) => {
      void this.handleConnectionUpdate(session.sessionId, socket, update);
    });

    return this.waitForQrOrConnection(session.sessionId);
  }

  private async handleConnectionUpdate(
    sessionId: string,
    socket: WASocket,
    update: Partial<ConnectionState>,
  ): Promise<void> {
    const managed = this.sessions.get(sessionId);

    if (update.qr) {
      const qrCodeDataUrl = await QRCode.toDataURL(update.qr);

      if (managed) {
        managed.qrCode = update.qr;
        managed.qrCodeDataUrl = qrCodeDataUrl;
      }

      const session = await this.prisma.whatsAppSession.update({
        where: {
          sessionId,
        },
        data: {
          status: "QR_READY",
          qrCode: update.qr,
          qrCodeDataUrl,
          lastQrAt: new Date(),
        },
      });
      await this.cache.setQr(session.id, {
        qrCode: update.qr,
        qrCodeDataUrl,
      });
      await this.cache.setSession(this.toStatusDto(session));
    }

    if (update.connection === "open") {
      const session = await this.prisma.whatsAppSession.update({
        where: {
          sessionId,
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
      await this.cache.deleteSession(session.id);
      await this.cache.setSession(this.toStatusDto(session));
    }

    if (update.connection === "close") {
      const statusCode = this.readDisconnectStatusCode(update);
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      this.sessions.delete(sessionId);

      const session = await this.prisma.whatsAppSession.update({
        where: {
          sessionId,
        },
        data: {
          status: "DISCONNECTED",
          qrCode: null,
          qrCodeDataUrl: null,
          disconnectedAt: new Date(),
        },
      });
      await this.cache.deleteSession(session.id);
      await this.cache.setSession(this.toStatusDto(session));

      if (shouldReconnect) {
        void this.startRuntime(sessionId).catch(() => undefined);
      } else {
        await this.authStore.clear(sessionId);
      }
    }
  }

  private async waitForQrOrConnection(
    sessionId: string,
  ): Promise<WhatsAppSessionStatusDto> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < QR_WAIT_TIMEOUT_MS) {
      const status = await this.readStatusBySessionId(sessionId);

      if (status.status === "QR_READY" || status.status === "CONNECTED") {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return this.readStatusBySessionId(sessionId);
  }

  private async readStatusBySessionId(
    sessionId: string,
  ): Promise<WhatsAppSessionStatusDto> {
    const session = await this.prisma.whatsAppSession.findUnique({
      where: {
        sessionId,
      },
    });

    if (!session) {
      throw new NotFoundException("WhatsApp session not found.");
    }

    const status = this.toStatusDto(session);
    await this.cache.setSession(status);

    return status;
  }

  private async findSessionById(id: string) {
    const normalizedId = this.normalizeRequiredString(id, "id");
    const session = await this.prisma.whatsAppSession.findUnique({
      where: {
        id: normalizedId,
      },
    });

    if (!session) {
      throw new NotFoundException("WhatsApp session not found.");
    }

    return session;
  }

  private toStatusDto(session: {
    id: string;
    userId: string;
    sessionId: string;
    status: WhatsAppSessionStatusDto["status"];
    qrCode: string | null;
    qrCodeDataUrl: string | null;
    phoneNumber: string | null;
    connectedAt: Date | null;
    disconnectedAt: Date | null;
    updatedAt: Date;
  }): WhatsAppSessionStatusDto {
    return {
      id: session.id,
      userId: session.userId,
      sessionId: session.sessionId,
      status: session.status,
      qrCode: session.qrCode ?? undefined,
      qrCodeDataUrl: session.qrCodeDataUrl ?? undefined,
      phoneNumber: session.phoneNumber ?? undefined,
      connectedAt: session.connectedAt ?? undefined,
      disconnectedAt: session.disconnectedAt ?? undefined,
      updatedAt: session.updatedAt,
    };
  }

  private readDisconnectStatusCode(update: Partial<ConnectionState>) {
    const error = update.lastDisconnect?.error;

    if (error instanceof Boom) {
      return error.output.statusCode;
    }

    return undefined;
  }

  private normalizeRequiredString(value: string, fieldName: string): string {
    if (!value || typeof value !== "string" || !value.trim()) {
      throw new BadRequestException(`Field ${fieldName} is required.`);
    }

    return value.trim();
  }
}
