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
import { PlanLimitsService } from "../../modules/plans/plan-limits.service";
import { ForwardSkipReason } from "../../modules/routes/forward-skip-reason";
import { WorkerLeaseService } from "../../modules/workers/worker-lease.service";
import { WorkerNodesService } from "../../modules/workers/worker-nodes.service";
import { BaileysPrismaAuthStore } from "../auth/baileys-prisma-auth.store";
import type { WhatsAppSessionStatusDto } from "../dto/whatsapp-session-status.dto";
import { WhatsAppMessagesService } from "../messages/whatsapp-messages.service";
import { WhatsAppSessionCacheService } from "./whatsapp-session-cache.service";

type ManagedSession = {
  socket: WASocket;
  listenerRegistered: boolean;
  leaseToken: string;
  qrCode?: string;
  qrCodeDataUrl?: string;
};

export type WhatsAppSessionDebugDto = {
  id: string;
  sessionId: string;
  status: string;
  hasSocket: boolean;
  listenerRegistered: boolean;
  groupsCount: number;
  messagesCount: number;
  lastMessageAt: Date | null;
  routesCount: number;
};

const QR_WAIT_TIMEOUT_MS = 25_000;

@Injectable()
export class WhatsAppSessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly pendingStarts = new Map<
    string,
    Promise<WhatsAppSessionStatusDto>
  >();
  private readonly retiredSockets = new WeakSet<WASocket>();
  private readonly logger = pino({ level: "silent" });
  private leaseRenewalTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authStore: BaileysPrismaAuthStore,
    private readonly cache: WhatsAppSessionCacheService,
    private readonly messagesService: WhatsAppMessagesService,
    private readonly planLimits: PlanLimitsService,
    private readonly workers: WorkerNodesService,
    private readonly leases: WorkerLeaseService,
  ) {}

  async onModuleInit() {
    await this.workers.registerEmbeddedWorker();
    this.leaseRenewalTimer = setInterval(() => {
      void this.renewActiveLeases();
    }, this.workers.heartbeatIntervalMs());
    this.leaseRenewalTimer.unref();

    const sessions = await this.prisma.whatsAppSession.findMany({
      where: {
        deletedAt: null,
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

    await this.planLimits.assertCanCreateWhatsAppSession(normalizedUserId);

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

  async listSessions(userId: string): Promise<WhatsAppSessionStatusDto[]> {
    const normalizedUserId = this.normalizeRequiredString(userId, "userId");
    const sessions = await this.prisma.whatsAppSession.findMany({
      where: {
        userId: normalizedUserId,
        deletedAt: null,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return sessions.map((session) => this.toStatusDto(session));
  }

  async readStatus(
    id: string,
    userId?: string,
  ): Promise<WhatsAppSessionStatusDto> {
    const session = await this.findSessionById(id, userId);

    const status = this.toStatusDto(session);
    await this.cache.setSession(status);

    return status;
  }

  async readQr(
    id: string,
    userId?: string,
  ): Promise<{
    id: string;
    sessionId: string;
    status: WhatsAppSessionStatusDto["status"];
    qrCode?: string;
    qrCodeDataUrl?: string;
  }> {
    const session = await this.findSessionById(id, userId);

    return {
      id: session.id,
      sessionId: session.sessionId,
      status: session.status,
      qrCode: session.qrCode ?? undefined,
      qrCodeDataUrl: session.qrCodeDataUrl ?? undefined,
    };
  }

  async getConnectedSocket(
    id: string,
    userId?: string,
  ): Promise<{
    session: WhatsAppSession;
    socket: WASocket;
  }> {
    let session = await this.findSessionById(id, userId);

    if (session.status !== "CONNECTED") {
      throw new BadRequestException(
        "WhatsApp session is not connected yet. Scan the QR Code before syncing groups.",
      );
    }

    let managed = this.sessions.get(session.sessionId);

    if (!managed) {
      await this.startRuntime(session.sessionId);
      session = await this.findSessionById(id, userId);
      managed = this.sessions.get(session.sessionId);
    }

    if (session.status !== "CONNECTED" || !managed) {
      throw new ServiceUnavailableException(
        "WhatsApp session is reconnecting. Try again in a few seconds.",
      );
    }

    this.registerMessageListener(session.sessionId, managed.socket);

    return {
      session,
      socket: managed.socket,
    };
  }

  async readDebug(
    id: string,
    userId?: string,
  ): Promise<WhatsAppSessionDebugDto> {
    const session = await this.findSessionById(id, userId);
    const managed = this.sessions.get(session.sessionId);
    const [groupsCount, messagesCount, lastMessage, routesCount] =
      await Promise.all([
        this.prisma.whatsAppGroup.count({
          where: { sessionId: session.sessionId },
        }),
        this.prisma.whatsAppMessage.count({
          where: { sessionId: session.sessionId },
        }),
        this.prisma.whatsAppMessage.findFirst({
          where: { sessionId: session.sessionId },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        }),
        this.prisma.messageRoute.count({
          where: {
            userId: session.userId,
            sessionId: session.sessionId,
          },
        }),
      ]);

    return {
      id: session.id,
      sessionId: session.sessionId,
      status: session.status,
      hasSocket: Boolean(managed),
      listenerRegistered: Boolean(managed?.listenerRegistered),
      groupsCount,
      messagesCount,
      lastMessageAt: lastMessage?.createdAt ?? null,
      routesCount,
    };
  }

  async reconnectSession(
    id: string,
    userId?: string,
  ): Promise<WhatsAppSessionStatusDto> {
    const session = await this.findSessionById(id, userId);
    const managed = this.sessions.get(session.sessionId);

    if (managed) {
      this.retiredSockets.add(managed.socket);
      this.sessions.delete(session.sessionId);
      managed.socket.end(undefined);
      await this.leases.releaseSessionLease(
        session.sessionId,
        managed.leaseToken,
      );
    }

    return this.startRuntime(session.sessionId);
  }

  async deleteSession(
    id: string,
    userId?: string,
  ): Promise<WhatsAppSessionStatusDto> {
    const session = await this.findSessionById(id, userId);
    const managed = this.sessions.get(session.sessionId);

    if (managed) {
      this.retiredSockets.add(managed.socket);
      await managed.socket.logout().catch(() => undefined);
      managed.socket.end(undefined);
      this.sessions.delete(session.sessionId);
      await this.leases.releaseSessionLease(
        session.sessionId,
        managed.leaseToken,
      );
    }

    await this.authStore.clear(session.sessionId);

    const updated = await this.prisma.whatsAppSession.update({
      where: {
        id: session.id,
      },
      data: {
        deletedAt: new Date(),
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

    return status;
  }

  async onModuleDestroy() {
    if (this.leaseRenewalTimer) {
      clearInterval(this.leaseRenewalTimer);
      this.leaseRenewalTimer = undefined;
    }

    const releases = [...this.sessions.entries()].map(
      async ([sessionId, session]) => {
        this.retiredSockets.add(session.socket);
        session.socket.end(undefined);
        await this.leases.releaseSessionLease(sessionId, session.leaseToken);
      },
    );
    this.sessions.clear();
    await Promise.allSettled(releases);
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
      this.registerMessageListener(sessionId, existing.socket);
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
    const current = await this.findSessionBySessionId(sessionId);
    const lease = await this.leases.acquireSessionLease(sessionId);

    if (!lease) {
      throw new ServiceUnavailableException(
        "WhatsApp session is owned by another worker.",
      );
    }

    let session: WhatsAppSession;
    let socket: WASocket;
    let saveCreds: () => Promise<void>;

    try {
      session = await this.prisma.whatsAppSession.update({
        where: {
          id: current.id,
        },
        data: {
          status: "CONNECTING",
          disconnectedAt: null,
        },
      });
      const authState = await this.authStore.getAuthState(session.sessionId);
      saveCreds = authState.saveCreds;
      socket = makeWASocket({
        auth: authState.state,
        logger: this.logger,
        printQRInTerminal: false,
        syncFullHistory: false,
        version: DEFAULT_CONNECTION_CONFIG.version,
      });
    } catch (error) {
      await this.leases.releaseSessionLease(sessionId, lease.leaseToken);
      throw error;
    }

    this.sessions.set(session.sessionId, {
      socket,
      listenerRegistered: false,
      leaseToken: lease.leaseToken,
    });
    socket.ev.on("creds.update", saveCreds);
    this.registerMessageListener(session.sessionId, socket);
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
    if (this.retiredSockets.has(socket)) {
      return;
    }

    const managed = this.sessions.get(sessionId);

    if (managed && managed.socket !== socket) {
      return;
    }

    if (await this.isSessionDeleted(sessionId)) {
      socket.end(undefined);
      this.sessions.delete(sessionId);
      if (managed) {
        await this.leases.releaseSessionLease(sessionId, managed.leaseToken);
      }
      return;
    }

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
      if (await this.isSessionDeleted(sessionId)) {
        socket.end(undefined);
        this.sessions.delete(sessionId);
        if (managed) {
          await this.leases.releaseSessionLease(sessionId, managed.leaseToken);
        }
        return;
      }

      this.registerMessageListener(sessionId, socket);
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
      if (managed) {
        await this.leases.releaseSessionLease(sessionId, managed.leaseToken);
      }

      if (await this.isSessionDeleted(sessionId)) {
        await this.authStore.clear(sessionId);
        return;
      }

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

  private registerMessageListener(sessionId: string, socket: WASocket): void {
    const managed = this.sessions.get(sessionId);

    if (!managed || managed.socket !== socket || managed.listenerRegistered) {
      return;
    }

    const worker = this.workers.getCurrentWorker();
    const workerContext = worker
      ? ` workerId=${worker.id} workerName=${worker.name}`
      : "";

    socket.ev.on("messages.upsert", ({ messages, type }) => {
      console.log(
        `[WA_MESSAGE] upsert sessionId=${sessionId}${workerContext} type=${type} count=${messages.length}`,
      );

      for (const message of messages) {
        void this.messagesService
          .recordIncomingGroupMessage(sessionId, message)
          .catch(() => {
            console.log(
              `[WA_MESSAGE] failed sessionId=${sessionId}${workerContext}${message.key.remoteJid ? ` sourceGroupJid=${message.key.remoteJid}` : ""}${message.key.id ? ` messageId=${message.key.id}` : ""} reason=${ForwardSkipReason.SEND_FAILED}`,
            );
          });
      }
    });
    managed.listenerRegistered = true;
    console.log(
      `[WA_LISTENER] registered sessionId=${sessionId}${workerContext}`,
    );
  }

  private async renewActiveLeases(): Promise<void> {
    for (const [sessionId, managed] of this.sessions) {
      const renewed = await this.leases
        .renewSessionLease(sessionId, managed.leaseToken)
        .catch(() => false);

      if (renewed) {
        continue;
      }

      this.retiredSockets.add(managed.socket);
      managed.socket.end(undefined);
      this.sessions.delete(sessionId);
      console.log(
        `[WORKER_LEASE] refused sessionId=${sessionId} reason=LEASE_LOST`,
      );
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

    if (!session || session.deletedAt) {
      throw new NotFoundException("WhatsApp session not found.");
    }

    const status = this.toStatusDto(session);
    await this.cache.setSession(status);

    return status;
  }

  private async findSessionById(id: string, userId?: string) {
    const normalizedId = this.normalizeRequiredString(id, "id");
    const normalizedUserId = userId
      ? this.normalizeRequiredString(userId, "userId")
      : undefined;
    const session = normalizedUserId
      ? await this.prisma.whatsAppSession.findFirst({
          where: {
            id: normalizedId,
            userId: normalizedUserId,
            deletedAt: null,
          },
        })
      : await this.prisma.whatsAppSession.findFirst({
          where: {
            id: normalizedId,
            deletedAt: null,
          },
        });

    if (!session) {
      throw new NotFoundException("WhatsApp session not found.");
    }

    return session;
  }

  private async findSessionBySessionId(sessionId: string) {
    const normalizedSessionId = this.normalizeRequiredString(
      sessionId,
      "sessionId",
    );
    const session = await this.prisma.whatsAppSession.findFirst({
      where: {
        sessionId: normalizedSessionId,
        deletedAt: null,
      },
    });

    if (!session) {
      throw new NotFoundException("WhatsApp session not found.");
    }

    return session;
  }

  private async isSessionDeleted(sessionId: string): Promise<boolean> {
    const session = await this.prisma.whatsAppSession.findUnique({
      where: {
        sessionId,
      },
      select: {
        deletedAt: true,
      },
    });

    return !session || Boolean(session.deletedAt);
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
