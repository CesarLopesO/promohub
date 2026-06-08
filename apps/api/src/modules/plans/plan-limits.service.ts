import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Plan } from "@prisma/client";

import { PrismaService } from "../../prisma.service";

type PlanLimits = {
  maxWhatsAppSessions: number;
  maxSourceGroups: number | null;
  maxDestinationGroups: number | null;
  adsEnabled: boolean;
};

type PlanUsage = {
  whatsappSessions: number;
  sourceGroups: number;
  destinationGroups: number;
  activeRoutes: number;
};

export type PlanUsageDto = {
  plan: Plan;
  limits: PlanLimits;
  usage: PlanUsage;
};

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxWhatsAppSessions: 1,
    maxSourceGroups: 3,
    maxDestinationGroups: 1,
    adsEnabled: true,
  },
  BASIC: {
    maxWhatsAppSessions: 1,
    maxSourceGroups: 10,
    maxDestinationGroups: 5,
    adsEnabled: false,
  },
  PRO: {
    maxWhatsAppSessions: 5,
    maxSourceGroups: null,
    maxDestinationGroups: null,
    adsEnabled: false,
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

    const [whatsappSessions, activeRoutes, sourceGroups, destinationGroups] =
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
      ]);

    return {
      plan: user.plan,
      limits: this.getLimits(user.plan),
      usage: {
        whatsappSessions,
        sourceGroups: sourceGroups.length,
        destinationGroups: destinationGroups.length,
        activeRoutes,
      },
    };
  }

  async assertCanCreateWhatsAppSession(userId: string): Promise<void> {
    const usage = await this.getUsage(userId);

    if (usage.usage.whatsappSessions >= usage.limits.maxWhatsAppSessions) {
      throw new ForbiddenException(
        `Limite do plano ${usage.plan} atingido: máximo de ${usage.limits.maxWhatsAppSessions} WhatsApp.`,
      );
    }
  }

  async assertCanCreateRoute(
    userId: string,
    sourceGroupJid: string,
    destinationGroupJid: string,
  ): Promise<void> {
    const usage = await this.getUsage(userId);
    const [sourceExists, destinationExists] = await Promise.all([
      this.prisma.messageRoute.findFirst({
        where: { userId, isActive: true, sourceGroupJid },
        select: { id: true },
      }),
      this.prisma.messageRoute.findFirst({
        where: { userId, isActive: true, destinationGroupJid },
        select: { id: true },
      }),
    ]);
    const nextSourceGroups =
      usage.usage.sourceGroups + (sourceExists ? 0 : 1);
    const nextDestinationGroups =
      usage.usage.destinationGroups + (destinationExists ? 0 : 1);

    if (
      usage.limits.maxSourceGroups !== null &&
      nextSourceGroups > usage.limits.maxSourceGroups
    ) {
      throw new ForbiddenException(
        `Limite do plano ${usage.plan} atingido: máximo de ${usage.limits.maxSourceGroups} grupos origem.`,
      );
    }

    if (
      usage.limits.maxDestinationGroups !== null &&
      nextDestinationGroups > usage.limits.maxDestinationGroups
    ) {
      throw new ForbiddenException(
        `Limite do plano ${usage.plan} atingido: máximo de ${usage.limits.maxDestinationGroups} grupo destino.`,
      );
    }
  }
}
