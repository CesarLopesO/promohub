import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Plan } from "@prisma/client";

import { PrismaService } from "../../prisma.service";
import { getSaoPauloDayBounds } from "../../common/time/sao-paulo-day";
import { ForwardSkipReason } from "../routes/forward-skip-reason";

export type PlanLimits = {
  maxWhatsAppSessions: number;
  maxSourceGroups: number | null;
  maxDestinationGroups: number | null;
  adsEnabled: boolean;
  dailyForwardLimit: number | null;
};

type PlanUsage = {
  whatsappSessions: number;
  sourceGroups: number;
  destinationGroups: number;
  activeRoutes: number;
  forwardsToday: number;
  dailyForwardRemaining: number | null;
};

type ActiveRouteGroups = {
  sourceGroupJid: string;
  destinationGroupJid: string;
};

export type PlanUsageDto = {
  plan: Plan;
  limits: PlanLimits;
  usage: PlanUsage;
};

export const PLAN_LIMIT_REACHED = ForwardSkipReason.PLAN_LIMIT_REACHED;

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxWhatsAppSessions: 1,
    maxSourceGroups: 3,
    maxDestinationGroups: 1,
    adsEnabled: true,
    dailyForwardLimit: 100,
  },
  BASIC: {
    maxWhatsAppSessions: 1,
    maxSourceGroups: 10,
    maxDestinationGroups: 5,
    adsEnabled: false,
    dailyForwardLimit: null,
  },
  PRO: {
    maxWhatsAppSessions: 5,
    maxSourceGroups: null,
    maxDestinationGroups: null,
    adsEnabled: false,
    dailyForwardLimit: null,
  },
};

@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  getLimits(plan: Plan): PlanLimits {
    return PLAN_LIMITS[plan];
  }

  async getUsage(userId: string): Promise<PlanUsageDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const limits = this.getLimits(user.plan);
    const [whatsappSessions, activeRoutes, sourceGroups, destinationGroups, forwardsToday] =
      await Promise.all([
        this.prisma.whatsAppSession.count({
          where: { userId, deletedAt: null },
        }),
        this.prisma.messageRoute.count({
          where: { userId, isActive: true },
        }),
        this.prisma.messageRoute.findMany({
          where: { userId, isActive: true },
          distinct: ["sourceGroupJid"],
          select: { sourceGroupJid: true },
        }),
        this.prisma.messageRoute.findMany({
          where: { userId, isActive: true },
          distinct: ["destinationGroupJid"],
          select: { destinationGroupJid: true },
        }),
        this.countForwardsToday(userId),
      ]);

    return {
      plan: user.plan,
      limits,
      usage: {
        whatsappSessions,
        sourceGroups: sourceGroups.length,
        destinationGroups: destinationGroups.length,
        activeRoutes,
        forwardsToday,
        dailyForwardRemaining:
          limits.dailyForwardLimit === null
            ? null
            : Math.max(limits.dailyForwardLimit - forwardsToday, 0),
      },
    };
  }

  async canForwardMessage(
    userId: string,
    plan: Plan,
    now = new Date(),
  ): Promise<boolean> {
    const limit = this.getLimits(plan).dailyForwardLimit;

    if (limit === null) {
      return true;
    }

    return (await this.countForwardsToday(userId, now)) < limit;
  }

  async countForwardsToday(userId: string, now = new Date()): Promise<number> {
    const { start, end } = getSaoPauloDayBounds(now);

    return this.prisma.forwardedMessage.count({
      where: {
        userId,
        status: {
          in: ["SENT", "SENT_TEXT_FALLBACK"],
        },
        sentAt: {
          gte: start,
          lt: end,
        },
      },
    });
  }

  async assertCanCreateWhatsAppSession(userId: string): Promise<void> {
    const usage = await this.getUsage(userId);

    if (usage.usage.whatsappSessions >= usage.limits.maxWhatsAppSessions) {
      const sessionLabel =
        usage.limits.maxWhatsAppSessions === 1
          ? "sessão de WhatsApp cadastrada"
          : "sessões de WhatsApp cadastradas";
      this.throwPlanLimitReached(
        `Seu plano ${usage.plan} permite no máximo ${usage.limits.maxWhatsAppSessions} ${sessionLabel}.`,
      );
    }
  }

  async assertCanCreateRoute(
    userId: string,
    sourceGroupJid: string,
    destinationGroupJid: string,
    excludeRouteId?: string,
  ): Promise<void> {
    const [user, activeRoutes] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true },
      }),
      this.prisma.messageRoute.findMany({
        where: {
          userId,
          isActive: true,
          ...(excludeRouteId ? { NOT: { id: excludeRouteId } } : {}),
        },
        select: {
          sourceGroupJid: true,
          destinationGroupJid: true,
        },
      }),
    ]);

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const limits = this.getLimits(user.plan);
    const sourceGroups = this.distinctGroupCount(
      activeRoutes,
      "sourceGroupJid",
      sourceGroupJid,
    );
    const destinationGroups = this.distinctGroupCount(
      activeRoutes,
      "destinationGroupJid",
      destinationGroupJid,
    );

    if (
      limits.maxSourceGroups !== null &&
      sourceGroups > limits.maxSourceGroups
    ) {
      const sourceLabel =
        limits.maxSourceGroups === 1
          ? "grupo de origem ativo"
          : "grupos de origem ativos";
      this.throwPlanLimitReached(
        `Seu plano ${user.plan} permite no máximo ${limits.maxSourceGroups} ${sourceLabel}.`,
      );
    }

    if (
      limits.maxDestinationGroups !== null &&
      destinationGroups > limits.maxDestinationGroups
    ) {
      const destinationLabel =
        limits.maxDestinationGroups === 1
          ? "grupo de destino ativo"
          : "grupos de destino ativos";
      this.throwPlanLimitReached(
        `Seu plano ${user.plan} permite no máximo ${limits.maxDestinationGroups} ${destinationLabel}.`,
      );
    }
  }

  private distinctGroupCount(
    routes: ActiveRouteGroups[],
    field: keyof ActiveRouteGroups,
    nextGroupJid: string,
  ): number {
    return new Set([...routes.map((route) => route[field]), nextGroupJid]).size;
  }

  private throwPlanLimitReached(message: string): never {
    throw new ForbiddenException({
      code: PLAN_LIMIT_REACHED,
      message,
    });
  }
}
