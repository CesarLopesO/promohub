import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  Plan,
  Prisma,
  SubscriptionStatus,
  type BillingSubscription,
} from "@prisma/client";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../../prisma.service";
import { PlanLimitsService } from "../plans/plan-limits.service";
import { ReferralsService } from "../referrals/referrals.service";
import { hashReferralCpfCnpj, maskCpfCnpj } from "../referrals/referral-cpf";
import { AsaasService, type AsaasWebhook } from "./asaas.service";

type BillingPlanDto = {
  id: Plan;
  name: string;
  priceCents: number;
  currency: "BRL";
  interval: "month";
  description: string;
  features: string[];
};

type BillingSubscriptionDto = {
  id: string;
  plan: Plan;
  provider: string;
  status: SubscriptionStatus;
  checkoutUrl?: string;
  providerSubscriptionId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  canceledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

type BillingMeDto = {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  cpfCnpjMasked?: string;
  subscription?: BillingSubscriptionDto;
};

type CurrentSubscriptionDto = {
  plan: Plan;
  status: SubscriptionStatus;
  cpfCnpjMasked?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  providerSubscriptionId?: string;
};

type PaidPlan = Extract<Plan, "BASIC" | "PRO">;

type CheckoutDto = {
  plan: PaidPlan;
  checkoutUrl: string;
  subscriptionId: string;
  status: SubscriptionStatus;
};

type WebhookResult = {
  received: true;
  duplicate: boolean;
  processed: boolean;
};

const PLAN_PRICES: Record<Plan, number> = {
  FREE: 0,
  BASIC: 7990,
  PRO: 9990,
};

const PLAN_DESCRIPTIONS: Record<Plan, string> = {
  FREE: "Comece grátis com automação básica.",
  BASIC: "Para operações em crescimento sem propaganda.",
  PRO: "Para operação profissional com múltiplos WhatsApps.",
};

const ACTIVE_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
const CANCELED_EVENTS = new Set([
  "PAYMENT_DELETED",
  "PAYMENT_BANK_SLIP_CANCELLED",
  "PAYMENT_REFUNDED",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
  "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
]);

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
    private readonly referrals: ReferralsService,
  ) {}

  plans(): BillingPlanDto[] {
    return Object.values(Plan).map((plan) => ({
      id: plan,
      name: plan,
      priceCents: PLAN_PRICES[plan],
      currency: "BRL",
      interval: "month",
      description: PLAN_DESCRIPTIONS[plan],
      features: this.readPlanFeatures(plan),
    }));
  }

  async me(userId: string): Promise<BillingMeDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        plan: true,
        subscriptionStatus: true,
        cpfCnpj: true,
      },
    });

    if (!user) {
      throw new BadRequestException("User not found.");
    }

    const subscription = await this.prisma.billingSubscription.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return {
      plan: user.plan,
      subscriptionStatus: user.subscriptionStatus,
      cpfCnpjMasked: user.cpfCnpj ?? undefined,
      subscription: subscription
        ? this.toSubscriptionDto(subscription)
        : undefined,
    };
  }

  async subscription(userId: string): Promise<CurrentSubscriptionDto> {
    const billing = await this.me(userId);

    return {
      plan: billing.plan,
      status: billing.subscriptionStatus,
      cpfCnpjMasked: billing.cpfCnpjMasked,
      currentPeriodStart: billing.subscription?.currentPeriodStart,
      currentPeriodEnd: billing.subscription?.currentPeriodEnd,
      providerSubscriptionId: billing.subscription?.providerSubscriptionId,
    };
  }

  async checkout(
    userId: string,
    requestedPlan: unknown,
    requestedCpfCnpj?: unknown,
  ): Promise<CheckoutDto> {
    const plan = this.normalizePaidPlan(requestedPlan);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        cpfCnpj: true,
        cpfCnpjHash: true,
        subscriptionStatus: true,
      },
    });

    if (!user) {
      throw new BadRequestException("User not found.");
    }

    const cpfCnpj = this.normalizeCpfCnpj(requestedCpfCnpj);
    const cpfCnpjMasked = maskCpfCnpj(cpfCnpj);
    const cpfCnpjHash = hashReferralCpfCnpj(cpfCnpj, this.config);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        cpfCnpj: cpfCnpjMasked,
        cpfCnpjHash,
      },
    });

    const previous = await this.prisma.billingSubscription.findFirst({
      where: {
        userId,
        provider: "asaas",
        providerCustomerId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { providerCustomerId: true },
    });
    const pending = await this.prisma.billingSubscription.create({
      data: {
        userId,
        plan,
        provider: "asaas",
        status: SubscriptionStatus.PENDING,
      },
    });

    try {
      const checkout = await this.asaas.createSubscription(
        { ...user, cpfCnpj },
        plan,
        pending.id,
        previous?.providerCustomerId,
      );
      const subscription = await this.prisma.billingSubscription.update({
        where: { id: pending.id },
        data: {
          providerCustomerId: checkout.customerId,
          providerSubscriptionId: checkout.subscriptionId,
          providerPaymentId: checkout.paymentId,
          status: SubscriptionStatus.PENDING,
          checkoutUrl: checkout.checkoutUrl,
        },
      });

      if (user.subscriptionStatus !== SubscriptionStatus.ACTIVE) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { subscriptionStatus: SubscriptionStatus.PENDING },
        });
      }

      console.log(
        `[BILLING] checkout created userId=${userId} plan=${plan} provider=asaas`,
      );

      return {
        plan,
        checkoutUrl: subscription.checkoutUrl!,
        subscriptionId: subscription.id,
        status: subscription.status,
      };
    } catch (error) {
      await this.prisma.billingSubscription.update({
        where: { id: pending.id },
        data: {
          status: SubscriptionStatus.CANCELED,
          canceledAt: new Date(),
        },
      });
      throw error;
    }
  }

  async handleAsaasWebhook(
    token: string | undefined,
    payload: unknown,
  ): Promise<WebhookResult> {
    this.validateWebhookToken(token);
    const webhook = this.asaas.handleWebhook(payload);
    let event: { id: string; processedAt: Date | null };

    try {
      event = await this.prisma.billingWebhookEvent.create({
        data: {
          provider: "asaas",
          eventId: webhook.eventId,
          eventType: webhook.eventType,
          payload: webhook.payload as Prisma.InputJsonValue,
        },
        select: { id: true, processedAt: true },
      });
    } catch (error) {
      if (this.isUniqueConstraint(error)) {
        const existing = await this.prisma.billingWebhookEvent.findUnique({
          where: { eventId: webhook.eventId },
          select: { id: true, processedAt: true },
        });

        if (!existing || existing.processedAt) {
          return { received: true, duplicate: true, processed: false };
        }

        event = existing;
      } else {
        throw error;
      }
    }

    const subscription = await this.findWebhookSubscription(webhook);

    if (!subscription) {
      console.warn(
        `[BILLING_WEBHOOK] subscription not found event=${webhook.eventType} eventId=${webhook.eventId}`,
      );
      return { received: true, duplicate: false, processed: false };
    }

    const transition = this.readWebhookTransition(webhook.eventType);

    if (!transition) {
      await this.prisma.billingWebhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });

      return { received: true, duplicate: false, processed: false };
    }

    const canUpdateUser = await this.canUpdateUser(subscription);
    const sameActivePayment =
      subscription.status === SubscriptionStatus.ACTIVE &&
      subscription.providerPaymentId === webhook.payment.id;
    const period = this.readActivePeriod(sameActivePayment);
    const shouldUpdateUser = canUpdateUser;

    await this.prisma.$transaction([
      this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: {
          status: transition.billingStatus,
          ...(webhook.payment.id
            ? { providerPaymentId: webhook.payment.id }
            : {}),
          ...(transition.activatePlan && period
            ? {
                currentPeriodStart: period.start,
                currentPeriodEnd: period.end,
                canceledAt: null,
              }
            : {}),
          ...(transition.billingStatus === SubscriptionStatus.CANCELED
            ? { canceledAt: new Date() }
            : {}),
        },
      }),
      ...(shouldUpdateUser
        ? [
            this.prisma.user.update({
              where: { id: subscription.userId },
              data: {
                subscriptionStatus: transition.subscriptionStatus,
                ...(transition.activatePlan
                  ? { plan: subscription.plan }
                  : transition.resetPlan
                    ? { plan: Plan.FREE }
                    : {}),
              },
            }),
          ]
        : []),
    ]);

    if (webhook.eventType === "PAYMENT_CONFIRMED") {
      if (webhook.cpfCnpj) {
        await this.prisma.user.update({
          where: { id: subscription.userId },
          data: {
            cpfCnpj: maskCpfCnpj(webhook.cpfCnpj),
            cpfCnpjHash: hashReferralCpfCnpj(webhook.cpfCnpj, this.config),
          },
        });
      }

      await this.referrals.confirmPayment(subscription.userId);
    } else if (transition.resetPlan) {
      await this.referrals.resetWaitingPeriod(subscription.userId);
    }

    await this.prisma.billingWebhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date() },
    });

    console.log(
      `[BILLING_WEBHOOK] processed eventId=${webhook.eventId} eventType=${webhook.eventType} providerPaymentId=${this.redactProviderId(webhook.payment.id)}`,
    );

    return { received: true, duplicate: false, processed: true };
  }

  async cancel(userId: string): Promise<CurrentSubscriptionDto> {
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        userId,
        provider: "asaas",
        providerSubscriptionId: { not: null },
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription?.providerSubscriptionId) {
      throw new BadRequestException("No active Asaas subscription found.");
    }

    await this.asaas.cancelSubscription(subscription.providerSubscriptionId);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.CANCELED,
          canceledAt: now,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          plan: Plan.FREE,
          subscriptionStatus: SubscriptionStatus.CANCELED,
        },
      }),
    ]);
    await this.referrals.resetWaitingPeriod(userId);

    return {
      plan: Plan.FREE,
      status: SubscriptionStatus.CANCELED,
      currentPeriodStart: subscription.currentPeriodStart ?? undefined,
      currentPeriodEnd: subscription.currentPeriodEnd ?? undefined,
      providerSubscriptionId: subscription.providerSubscriptionId,
    };
  }

  private async findWebhookSubscription(webhook: AsaasWebhook) {
    const filters: Prisma.BillingSubscriptionWhereInput[] = [];

    if (webhook.payment.subscriptionId) {
      filters.push({
        providerSubscriptionId: webhook.payment.subscriptionId,
      });
    }

    if (webhook.payment.id) {
      filters.push({ providerPaymentId: webhook.payment.id });
    }

    if (webhook.payment.externalReference) {
      filters.push({ id: webhook.payment.externalReference });
    }

    if (filters.length === 0) {
      return null;
    }

    return this.prisma.billingSubscription.findFirst({
      where: {
        provider: "asaas",
        OR: filters,
      },
    });
  }

  private readWebhookTransition(eventType: string): {
    billingStatus: SubscriptionStatus;
    subscriptionStatus: SubscriptionStatus;
    activatePlan?: boolean;
    resetPlan?: boolean;
  } | null {
    if (ACTIVE_EVENTS.has(eventType)) {
      return {
        billingStatus: "ACTIVE",
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        activatePlan: true,
      };
    }

    if (eventType === "PAYMENT_OVERDUE") {
      return {
        billingStatus: SubscriptionStatus.PAST_DUE,
        subscriptionStatus: SubscriptionStatus.PAST_DUE,
        resetPlan: true,
      };
    }

    if (eventType === "PAYMENT_AWAITING_RISK_ANALYSIS") {
      return {
        billingStatus: SubscriptionStatus.PENDING,
        subscriptionStatus: SubscriptionStatus.PENDING,
      };
    }

    if (CANCELED_EVENTS.has(eventType)) {
      return {
        billingStatus: SubscriptionStatus.CANCELED,
        subscriptionStatus: SubscriptionStatus.CANCELED,
        resetPlan: true,
      };
    }

    return null;
  }

  private validateWebhookToken(receivedToken?: string): void {
    const configuredToken = this.config
      .get<string>("ASAAS_WEBHOOK_TOKEN")
      ?.trim();

    if (!configuredToken || receivedToken !== configuredToken) {
      throw new UnauthorizedException("Invalid Asaas webhook token.");
    }
  }

  private normalizePaidPlan(value: unknown): PaidPlan {
    if (value === Plan.BASIC || value === Plan.PRO) {
      return value;
    }

    throw new BadRequestException("Choose BASIC or PRO to start checkout.");
  }

  private normalizeCpfCnpj(value: unknown): string {
    if (value !== undefined && typeof value !== "string") {
      throw new BadRequestException("CPF/CNPJ must be a string.");
    }

    const normalized =
      typeof value === "string" && value.trim()
        ? value.replace(/\D/g, "")
        : undefined;

    if (!normalized) {
      throw new BadRequestException("CPF/CNPJ is required for checkout.");
    }

    if (!this.isValidCpfCnpj(normalized)) {
      throw new BadRequestException("Enter a valid CPF or CNPJ.");
    }

    return normalized;
  }

  private isValidCpfCnpj(value: string): boolean {
    if (!/^\d{11}$|^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) {
      return false;
    }

    return value.length === 11
      ? this.hasValidCpfDigits(value)
      : this.hasValidCnpjDigits(value);
  }

  private hasValidCpfDigits(value: string): boolean {
    const calculateDigit = (length: number): number => {
      const total = value
        .slice(0, length)
        .split("")
        .reduce(
          (sum, digit, index) => sum + Number(digit) * (length + 1 - index),
          0,
        );
      const remainder = (total * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };

    return (
      Number(value[9]) === calculateDigit(9) &&
      Number(value[10]) === calculateDigit(10)
    );
  }

  private hasValidCnpjDigits(value: string): boolean {
    const calculateDigit = (length: number): number => {
      const weights =
        length === 12
          ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
          : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const total = value
        .slice(0, length)
        .split("")
        .reduce(
          (sum, digit, index) => sum + Number(digit) * weights[index]!,
          0,
        );
      const remainder = total % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };

    return (
      Number(value[12]) === calculateDigit(12) &&
      Number(value[13]) === calculateDigit(13)
    );
  }

  private toSubscriptionDto(
    subscription: BillingSubscription,
  ): BillingSubscriptionDto {
    return {
      id: subscription.id,
      plan: subscription.plan,
      provider: subscription.provider,
      status: subscription.status,
      checkoutUrl: subscription.checkoutUrl ?? undefined,
      providerSubscriptionId: subscription.providerSubscriptionId ?? undefined,
      currentPeriodStart: subscription.currentPeriodStart ?? undefined,
      currentPeriodEnd: subscription.currentPeriodEnd ?? undefined,
      canceledAt: subscription.canceledAt ?? undefined,
      createdAt: subscription.createdAt,
      updatedAt: subscription.updatedAt,
    };
  }

  private redactProviderId(value: string | undefined): string {
    if (!value) {
      return "none";
    }

    return value.length <= 4 ? "[REDACTED]" : `***${value.slice(-4)}`;
  }

  private isUniqueConstraint(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private readPlanFeatures(plan: Plan): string[] {
    const limits = this.planLimits.getLimits(plan);

    return [
      `${limits.maxWhatsAppSessions} WhatsApp${
        limits.maxWhatsAppSessions === 1 ? "" : "s"
      }`,
      this.formatGroupLimit("grupos origem", limits.maxSourceGroups),
      this.formatGroupLimit("grupos destino", limits.maxDestinationGroups),
      limits.adsEnabled ? "propaganda PeppaBot" : "sem propaganda",
    ];
  }

  private formatGroupLimit(label: string, value: number | null): string {
    return value === null ? `${label} ilimitados` : `até ${value} ${label}`;
  }

  private async canUpdateUser(
    subscription: BillingSubscription,
  ): Promise<boolean> {
    const newerActive = await this.prisma.billingSubscription.findFirst({
      where: {
        userId: subscription.userId,
        provider: subscription.provider,
        status: SubscriptionStatus.ACTIVE,
        createdAt: { gt: subscription.createdAt },
      },
      select: { id: true },
    });

    return !newerActive;
  }

  private readActivePeriod(
    preserveCurrentPeriod: boolean,
  ): { start: Date; end: Date } | null {
    if (preserveCurrentPeriod) {
      return null;
    }

    const start = new Date();
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 30);

    return { start, end };
  }
}
