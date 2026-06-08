import { BadRequestException, Injectable } from "@nestjs/common";
import { Plan, type SubscriptionStatus } from "@prisma/client";

import { PrismaService } from "../../prisma.service";

type BillingPlanDto = {
  id: Plan;
  name: string;
  priceCents: number;
  currency: "BRL";
  interval: "month";
  description: string;
  features: string[];
};

type BillingMeDto = {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  subscription?: {
    id: string;
    plan: Plan;
    status: SubscriptionStatus;
    checkoutUrl?: string;
    currentPeriodStart?: Date;
    currentPeriodEnd?: Date;
    createdAt: Date;
  };
};

type CheckoutDto = {
  plan: Plan;
  checkoutUrl: string;
  subscriptionId: string;
  status: SubscriptionStatus;
};

const BILLING_PLANS: BillingPlanDto[] = [
  {
    id: Plan.FREE,
    name: "FREE",
    priceCents: 0,
    currency: "BRL",
    interval: "month",
    description: "Comece gratis com marca Promohub.",
    features: [
      "1 WhatsApp",
      "3 grupos origem",
      "1 grupo destino",
      "propaganda Promohub",
    ],
  },
  {
    id: Plan.BASIC,
    name: "BASIC",
    priceCents: 1990,
    currency: "BRL",
    interval: "month",
    description: "Para grupos pequenos sem propaganda.",
    features: [
      "1 WhatsApp",
      "ate 10 grupos origem",
      "ate 5 grupos destino",
      "sem propaganda",
    ],
  },
  {
    id: Plan.PRO,
    name: "PRO",
    priceCents: 3990,
    currency: "BRL",
    interval: "month",
    description: "Para operacao profissional com multiplos WhatsApps.",
    features: [
      "multiplos WhatsApps",
      "grupos ilimitados",
      "sem propaganda",
    ],
  },
];

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  plans(): BillingPlanDto[] {
    return BILLING_PLANS;
  }

  async me(userId: string): Promise<BillingMeDto> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        plan: true,
        subscriptionStatus: true,
        subscriptions: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            plan: true,
            status: true,
            checkoutUrl: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException("User not found.");
    }

    const subscription = user.subscriptions[0];

    return {
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
      subscription: subscription
        ? {
            id: subscription.id,
            plan: subscription.plan,
            status: subscription.status,
            checkoutUrl: subscription.checkoutUrl ?? undefined,
            currentPeriodStart: subscription.currentPeriodStart ?? undefined,
            currentPeriodEnd: subscription.currentPeriodEnd ?? undefined,
            createdAt: subscription.createdAt,
          }
        : undefined,
    };
  }

  async checkout(userId: string, requestedPlan: unknown): Promise<CheckoutDto> {
    const plan = this.normalizePaidPlan(requestedPlan);
    const checkoutUrl = `https://checkout.promohub.local/mock/${userId}/${plan.toLowerCase()}`;

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        plan,
        status: "PENDING",
        provider: "mock",
        checkoutUrl,
      },
      select: {
        id: true,
        plan: true,
        status: true,
        checkoutUrl: true,
      },
    });

    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        subscriptionStatus: "PENDING",
      },
    });

    return {
      plan: subscription.plan,
      checkoutUrl: subscription.checkoutUrl ?? checkoutUrl,
      subscriptionId: subscription.id,
      status: subscription.status,
    };
  }

  private normalizePaidPlan(value: unknown): Plan {
    if (value === Plan.BASIC || value === Plan.PRO) {
      return value;
    }

    throw new BadRequestException("Choose BASIC or PRO to start checkout.");
  }
}
