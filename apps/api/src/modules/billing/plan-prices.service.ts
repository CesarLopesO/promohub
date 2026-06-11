import { BadRequestException, Injectable } from "@nestjs/common";
import { Plan } from "@prisma/client";

import { AdminAuditService } from "../../common/security/admin-audit.service";
import { PrismaService } from "../../prisma.service";

export type PaidPlan = Extract<Plan, "BASIC" | "PRO">;

export type PlanPricesDto = Record<Plan, number>;

export type UpdatePlanPricesInput = Partial<Record<Plan, unknown>>;

const PAID_PLANS: readonly PaidPlan[] = [Plan.BASIC, Plan.PRO];
const MAX_PRICE_CENTS = 999_900;

export const DEFAULT_PLAN_PRICES: PlanPricesDto = {
  FREE: 0,
  BASIC: 7_990,
  PRO: 9_990,
};

@Injectable()
export class PlanPricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async getPrices(): Promise<PlanPricesDto> {
    const overrides = await this.prisma.planPriceOverride.findMany({
      where: { plan: { in: [...PAID_PLANS] } },
      select: { plan: true, priceCents: true },
    });
    const prices = { ...DEFAULT_PLAN_PRICES };

    for (const override of overrides) {
      if (this.isPaidPlan(override.plan)) {
        prices[override.plan] = override.priceCents;
      }
    }

    prices.FREE = 0;
    return prices;
  }

  async updatePrices(
    input: UpdatePlanPricesInput,
    adminUserId: string,
  ): Promise<PlanPricesDto> {
    this.assertPlainObject(input);

    if (Object.prototype.hasOwnProperty.call(input, Plan.FREE)) {
      throw new BadRequestException("FREE is always free and cannot be changed.");
    }

    const updates = PAID_PLANS.flatMap((plan) => {
      if (!Object.prototype.hasOwnProperty.call(input, plan)) {
        return [];
      }

      return [
        {
          plan,
          priceCents: this.normalizePriceCents(input[plan], plan),
        },
      ];
    });

    const unknownPlans = Object.keys(input).filter(
      (key) => key !== Plan.BASIC && key !== Plan.PRO,
    );

    if (unknownPlans.length > 0) {
      throw new BadRequestException("Only BASIC and PRO prices can be changed.");
    }

    if (updates.length === 0) {
      throw new BadRequestException("Provide BASIC or PRO priceCents.");
    }

    await this.prisma.$transaction(
      updates.map((update) =>
        this.prisma.planPriceOverride.upsert({
          where: { plan: update.plan },
          create: {
            plan: update.plan,
            priceCents: update.priceCents,
            updatedByUserId: adminUserId,
          },
          update: {
            priceCents: update.priceCents,
            updatedByUserId: adminUserId,
          },
        }),
      ),
    );

    await this.audit.record({
      adminUserId,
      action: "PLAN_PRICE_UPDATED",
      targetType: "planPriceOverride",
      metadata: {
        prices: Object.fromEntries(
          updates.map((update) => [update.plan, update.priceCents]),
        ),
      },
    });

    return this.getPrices();
  }

  async getPaidPlanPrice(plan: PaidPlan): Promise<number> {
    return (await this.getPrices())[plan];
  }

  private normalizePriceCents(value: unknown, plan: PaidPlan): number {
    if (!Number.isInteger(value)) {
      throw new BadRequestException(`${plan} priceCents must be an integer.`);
    }

    const priceCents = value as number;
    const minimum = process.env.NODE_ENV === "production" ? 100 : 1;

    if (priceCents < minimum) {
      throw new BadRequestException(
        `${plan} priceCents must be at least ${minimum}.`,
      );
    }

    if (priceCents > MAX_PRICE_CENTS) {
      throw new BadRequestException(
        `${plan} priceCents must be at most ${MAX_PRICE_CENTS}.`,
      );
    }

    return priceCents;
  }

  private assertPlainObject(
    input: unknown,
  ): asserts input is Record<string, unknown> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new BadRequestException("Invalid plan prices payload.");
    }
  }

  private isPaidPlan(value: string): value is PaidPlan {
    return value === Plan.BASIC || value === Plan.PRO;
  }
}
