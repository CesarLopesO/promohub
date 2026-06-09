import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Plan, SubscriptionStatus } from "@prisma/client";

import { BillingController } from "./billing.controller";

function makeController() {
  const calls: Array<{ method: string; value: unknown }> = [];
  const billing = {
    checkout: async (userId: string, plan: unknown, cpfCnpj: unknown) => {
      calls.push({ method: "checkout", value: { userId, plan, cpfCnpj } });
      return {
        plan: Plan.BASIC,
        checkoutUrl: "https://sandbox.asaas.com/i/pay_1",
        subscriptionId: "billing-1",
      };
    },
    subscription: async (userId: string) => {
      calls.push({ method: "subscription", value: userId });
      return {
        plan: Plan.PRO,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date("2026-06-09T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-07-09T00:00:00.000Z"),
      };
    },
    cancel: async (userId: string) => {
      calls.push({ method: "cancel", value: userId });
      return {
        plan: Plan.FREE,
        status: SubscriptionStatus.CANCELED,
      };
    },
  };
  const controller = new BillingController(billing as never, {} as never);
  const request = { user: { id: "user-1" } } as never;

  return { controller, request, calls };
}

describe("BillingController", () => {
  it("creates checkout using the authenticated user", async () => {
    const { controller, request, calls } = makeController();

    const result = await controller.checkout(request, {
      plan: Plan.BASIC,
      cpfCnpj: "123.456.789-09",
    });

    assert.equal(result.subscriptionId, "billing-1");
    assert.deepEqual(calls[0], {
      method: "checkout",
      value: {
        userId: "user-1",
        plan: Plan.BASIC,
        cpfCnpj: "123.456.789-09",
      },
    });
  });

  it("returns GET /billing/subscription contract", async () => {
    const { controller, request } = makeController();

    const result = await controller.subscription(request);

    assert.deepEqual(result, {
      plan: Plan.PRO,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date("2026-06-09T00:00:00.000Z"),
      currentPeriodEnd: new Date("2026-07-09T00:00:00.000Z"),
    });
  });

  it("cancels the authenticated user's subscription", async () => {
    const { controller, request } = makeController();

    const result = await controller.cancelSubscription(request);

    assert.deepEqual(result, {
      plan: Plan.FREE,
      status: SubscriptionStatus.CANCELED,
    });
  });
});
