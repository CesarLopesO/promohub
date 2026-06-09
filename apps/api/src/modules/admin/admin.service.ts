import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Plan, Prisma, SubscriptionStatus } from "@prisma/client";

import { PrismaService } from "../../prisma.service";
import { hasSessionToken } from "../affiliate/affiliate-credential-secrets";

const SENT_STATUSES = ["SENT", "SENT_TEXT_FALLBACK"];
const ROLE_VALUES = ["USER", "ADMIN"];
const SUBSCRIPTION_STATUS_VALUES = Object.values(SubscriptionStatus);
const PLAN_VALUES = Object.values(Plan);

type AdminUserFilters = {
  search?: string;
  plan?: string;
  subscriptionStatus?: string;
};

type AdminForwardFilters = {
  userId?: string;
  status?: string;
  mode?: string;
};

type AdminUserUpdate = {
  name?: unknown;
  plan?: unknown;
  subscriptionStatus?: unknown;
  isActive?: unknown;
  role?: unknown;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [
      totalUsers,
      freeUsers,
      basicUsers,
      proUsers,
      activeUsers,
      inactiveUsers,
      totalSessions,
      connectedSessions,
      disconnectedSessions,
      totalRoutes,
      activeRoutes,
      messages,
      imageMessages,
      totalForwards,
      sentForwards,
      failedForwards,
      autoForwards,
      manualForwards,
      imageForwards,
      fallbackForwards,
      totalSubscriptions,
      pendingSubscriptions,
      activeSubscriptions,
      overdueSubscriptions,
      canceledSubscriptions,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { plan: "FREE" } }),
      this.prisma.user.count({ where: { plan: "BASIC" } }),
      this.prisma.user.count({ where: { plan: "PRO" } }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: false } }),
      this.prisma.whatsAppSession.count({ where: { deletedAt: null } }),
      this.prisma.whatsAppSession.count({
        where: { deletedAt: null, status: "CONNECTED" },
      }),
      this.prisma.whatsAppSession.count({
        where: { deletedAt: null, status: "DISCONNECTED" },
      }),
      this.prisma.messageRoute.count(),
      this.prisma.messageRoute.count({ where: { isActive: true } }),
      this.prisma.whatsAppMessage.findMany({ select: { links: true } }),
      this.prisma.whatsAppMessage.count({ where: { messageType: "image" } }),
      this.prisma.forwardedMessage.count(),
      this.prisma.forwardedMessage.count({
        where: { status: { in: SENT_STATUSES } },
      }),
      this.prisma.forwardedMessage.count({ where: { status: "FAILED" } }),
      this.prisma.forwardedMessage.count({ where: { mode: "AUTO" } }),
      this.prisma.forwardedMessage.count({ where: { mode: "MANUAL" } }),
      this.prisma.forwardedMessage.count({ where: { mediaForwarded: true } }),
      this.prisma.forwardedMessage.count({
        where: { sentMessageType: "text_fallback" },
      }),
      this.prisma.billingSubscription.count(),
      this.prisma.billingSubscription.count({ where: { status: "PENDING" } }),
      this.prisma.billingSubscription.count({ where: { status: "ACTIVE" } }),
      this.prisma.billingSubscription.count({
        where: { status: { in: ["PAST_DUE", "OVERDUE"] } },
      }),
      this.prisma.billingSubscription.count({
        where: { status: "CANCELED" },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        free: freeUsers,
        basic: basicUsers,
        pro: proUsers,
        active: activeUsers,
        inactive: inactiveUsers,
      },
      sessions: {
        total: totalSessions,
        connected: connectedSessions,
        disconnected: disconnectedSessions,
      },
      routes: {
        total: totalRoutes,
        active: activeRoutes,
      },
      messages: {
        total: messages.length,
        withLinks: messages.filter((message) => this.hasLinks(message.links))
          .length,
        images: imageMessages,
      },
      forwards: {
        total: totalForwards,
        sent: sentForwards,
        failed: failedForwards,
        auto: autoForwards,
        manual: manualForwards,
        images: imageForwards,
        fallbacks: fallbackForwards,
      },
      subscriptions: {
        total: totalSubscriptions,
        pending: pendingSubscriptions,
        active: activeSubscriptions,
        overdue: overdueSubscriptions,
        canceled: canceledSubscriptions,
      },
    };
  }

  async users(filters: AdminUserFilters) {
    const where: Prisma.UserWhereInput = {
      ...(filters.search?.trim()
        ? { email: { contains: filters.search.trim(), mode: "insensitive" } }
        : {}),
      ...(this.isPlan(filters.plan) ? { plan: filters.plan } : {}),
      ...(this.isSubscriptionStatus(filters.subscriptionStatus)
        ? { subscriptionStatus: filters.subscriptionStatus }
        : {}),
    };
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        subscriptionStatus: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const counts = await this.readUserCounts(users.map((user) => user.id));

    return users.map((user) => ({
      ...user,
      _count: counts[user.id] ?? this.emptyCounts(),
    }));
  }

  async user(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        subscriptionStatus: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        billingSubscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            plan: true,
            status: true,
            provider: true,
            checkoutUrl: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            canceledAt: true,
            providerCustomerId: true,
            providerSubscriptionId: true,
            providerPaymentId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const [sessions, routes, credentials, forwards, messages] =
      await Promise.all([
        this.prisma.whatsAppSession.findMany({
          where: { userId: id, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: 20,
          select: {
            id: true,
            sessionId: true,
            status: true,
            phoneNumber: true,
            connectedAt: true,
            disconnectedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.messageRoute.findMany({
          where: { userId: id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            id: true,
            sessionId: true,
            sourceGroupJid: true,
            destinationGroupJid: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.affiliateCredential.findMany({
          where: { userId: id },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            marketplace: true,
            affiliateId: true,
            trackingId: true,
            metadata: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.forwardedMessage.findMany({
          where: { userId: id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: this.forwardSelect(),
        }),
        this.readRecentMessagesForUser(id),
      ]);

    return {
      ...user,
      subscription: user.billingSubscriptions[0] ?? null,
      billingSubscriptions: undefined,
      sessions,
      routes,
      credentials: credentials.map(({ metadata, ...credential }) => ({
        ...credential,
        hasSessionToken: hasSessionToken(metadata),
      })),
      forwards,
      messages,
    };
  }

  async updateUser(id: string, body: AdminUserUpdate) {
    await this.ensureUser(id);
    const data: Prisma.UserUpdateInput = {};

    if (body.name !== undefined) {
      data.name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim()
          : null;
    }

    if (body.plan !== undefined) {
      data.plan = this.normalizePlan(body.plan);
    }

    if (body.subscriptionStatus !== undefined) {
      data.subscriptionStatus = this.normalizeSubscriptionStatus(
        body.subscriptionStatus,
      );
    }

    if (body.isActive !== undefined) {
      if (typeof body.isActive !== "boolean") {
        throw new BadRequestException("isActive must be boolean.");
      }

      data.isActive = body.isActive;
    }

    if (body.role !== undefined) {
      data.role = this.normalizeRole(body.role);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        plan: true,
        subscriptionStatus: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  pauseUser(id: string) {
    return this.updateUser(id, { isActive: false });
  }

  resumeUser(id: string) {
    return this.updateUser(id, { isActive: true });
  }

  async forwards(filters: AdminForwardFilters) {
    const rows = await this.prisma.forwardedMessage.findMany({
      where: {
        ...(filters.userId?.trim() ? { userId: filters.userId.trim() } : {}),
        ...(filters.status?.trim() ? { status: filters.status.trim() } : {}),
        ...(filters.mode?.trim() ? { mode: filters.mode.trim() } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: this.forwardSelect(),
    });
    const userEmailById = await this.readUserEmailMap(
      rows.map((row) => row.userId),
    );

    return rows.map((row) => ({
      ...row,
      userEmail: userEmailById[row.userId] ?? "unknown",
    }));
  }

  async errors() {
    const rows = await this.prisma.forwardedMessage.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        userId: true,
        error: true,
        sourceMessageId: true,
        destinationGroupJid: true,
        createdAt: true,
      },
    });
    const userEmailById = await this.readUserEmailMap(
      rows.map((row) => row.userId),
    );

    return rows.map((row) => ({
      ...row,
      userEmail: userEmailById[row.userId] ?? "unknown",
    }));
  }

  async sessions() {
    const rows = await this.prisma.whatsAppSession.findMany({
      where: { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        userId: true,
        sessionId: true,
        status: true,
        phoneNumber: true,
        connectedAt: true,
        updatedAt: true,
      },
    });
    const userEmailById = await this.readUserEmailMap(
      rows.map((row) => row.userId),
    );

    return rows.map((row) => ({
      ...row,
      userEmail: userEmailById[row.userId] ?? "unknown",
      label: row.phoneNumber ?? row.sessionId,
    }));
  }

  private async ensureUser(id: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }
  }

  private async readRecentMessagesForUser(userId: string) {
    const sessions = await this.prisma.whatsAppSession.findMany({
      where: { userId, deletedAt: null },
      select: { sessionId: true },
    });
    const sessionIds = sessions.map((session) => session.sessionId);

    if (sessionIds.length === 0) {
      return [];
    }

    return this.prisma.whatsAppMessage.findMany({
      where: { sessionId: { in: sessionIds } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        sessionId: true,
        groupJid: true,
        messageType: true,
        text: true,
        hasMedia: true,
        links: true,
        marketplaces: true,
        createdAt: true,
      },
    });
  }

  private async readUserCounts(userIds: string[]) {
    const counts: Record<string, ReturnType<AdminService["emptyCounts"]>> = {};

    for (const userId of userIds) {
      counts[userId] = this.emptyCounts();
    }

    if (userIds.length === 0) {
      return counts;
    }

    const [sessions, routes, forwardedMessages] = await Promise.all([
      this.prisma.whatsAppSession.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds }, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.messageRoute.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds } },
        _count: { _all: true },
      }),
      this.prisma.forwardedMessage.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds } },
        _count: { _all: true },
      }),
    ]);

    for (const row of sessions) {
      counts[row.userId].sessions = row._count._all;
    }

    for (const row of routes) {
      counts[row.userId].routes = row._count._all;
    }

    for (const row of forwardedMessages) {
      counts[row.userId].forwardedMessages = row._count._all;
    }

    return counts;
  }

  private emptyCounts() {
    return {
      sessions: 0,
      routes: 0,
      forwardedMessages: 0,
    };
  }

  private async readUserEmailMap(userIds: string[]) {
    const uniqueIds = [...new Set(userIds)];

    if (uniqueIds.length === 0) {
      return {};
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, email: true },
    });

    return Object.fromEntries(users.map((user) => [user.id, user.email]));
  }

  private forwardSelect() {
    return {
      id: true,
      userId: true,
      sourceMessageId: true,
      sourceGroupJid: true,
      destinationGroupJid: true,
      status: true,
      mode: true,
      sentMessageType: true,
      mediaForwarded: true,
      error: true,
      createdAt: true,
    } satisfies Prisma.ForwardedMessageSelect;
  }

  private hasLinks(value: Prisma.JsonValue | null): boolean {
    return (
      Array.isArray(value) && value.some((item) => typeof item === "string")
    );
  }

  private normalizePlan(value: unknown): Plan {
    if (this.isPlan(value)) {
      return value;
    }

    throw new BadRequestException("Invalid plan.");
  }

  private normalizeSubscriptionStatus(value: unknown): SubscriptionStatus {
    if (this.isSubscriptionStatus(value)) {
      return value;
    }

    throw new BadRequestException("Invalid subscriptionStatus.");
  }

  private normalizeRole(value: unknown): string {
    if (typeof value === "string" && ROLE_VALUES.includes(value)) {
      return value;
    }

    throw new BadRequestException("Invalid role.");
  }

  private isPlan(value: unknown): value is Plan {
    return typeof value === "string" && PLAN_VALUES.includes(value as Plan);
  }

  private isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
    return (
      typeof value === "string" &&
      SUBSCRIPTION_STATUS_VALUES.includes(value as SubscriptionStatus)
    );
  }
}
