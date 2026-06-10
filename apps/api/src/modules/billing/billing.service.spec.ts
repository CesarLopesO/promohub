import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { Plan, Prisma, SubscriptionStatus } from "@prisma/client";

import { BillingService } from "./billing.service";

type StoredBillingSubscription = {
  id: string;
  userId: string;
  plan: Plan;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerPaymentId: string | null;
  status: SubscriptionStatus;
  checkoutUrl: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type StoredWebhookEvent = {
  id: string;
  eventId: string;
  eventType: string;
  processedAt: Date | null;
};

function makeService(options?: {
  webhookToken?: string;
  duplicateEvent?: boolean;
  duplicateProcessed?: boolean;
  cpfCnpj?: string | null;
}) {
  const user: {
    id: string;
    name: string;
    email: string;
    cpfCnpj: string | null;
    plan: Plan;
    subscriptionStatus: SubscriptionStatus;
  } = {
    id: "user-1",
    name: "User",
    email: "user@example.com",
    cpfCnpj: options?.cpfCnpj === undefined ? "12345678909" : options.cpfCnpj,
    plan: Plan.FREE,
    subscriptionStatus: SubscriptionStatus.NONE,
  };
  const subscriptions: StoredBillingSubscription[] = [];
  const events: StoredWebhookEvent[] = [];
  const asaasCalls: Array<{
    user: typeof user;
    plan: Plan;
    localSubscriptionId: string;
    existingCustomerId?: string | null;
  }> = [];
  const prisma = {
    user: {
      findUnique: async () => user,
      update: async ({ data }: { data: Partial<typeof user> }) => {
        Object.assign(user, data);
        return user;
      },
    },
    billingSubscription: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: {
          userId?: string;
          provider?: string;
          createdAt?: { gt: Date };
          providerCustomerId?: { not: null };
          providerSubscriptionId?: { not: null };
          status?: SubscriptionStatus | { in: SubscriptionStatus[] };
          OR?: Array<Record<string, string>>;
        };
        orderBy?: { createdAt: "desc" };
      }) => {
        const matching = subscriptions.filter((subscription) => {
          if (where.userId && subscription.userId !== where.userId) {
            return false;
          }

          if (where.provider && subscription.provider !== where.provider) {
            return false;
          }

          if (
            typeof where.status === "string" &&
            subscription.status !== where.status
          ) {
            return false;
          }

          if (
            typeof where.status === "object" &&
            !where.status.in.includes(subscription.status)
          ) {
            return false;
          }

          if (
            where.createdAt?.gt &&
            subscription.createdAt <= where.createdAt.gt
          ) {
            return false;
          }

          if (where.providerCustomerId && !subscription.providerCustomerId) {
            return false;
          }

          if (
            where.providerSubscriptionId &&
            !subscription.providerSubscriptionId
          ) {
            return false;
          }

          return !where.OR
            ? true
            : where.OR.some((filter) =>
                Object.entries(filter).every(
                  ([key, value]) =>
                    subscription[key as keyof StoredBillingSubscription] ===
                    value,
                ),
              );
        });

        return (orderBy ? matching.at(-1) : matching[0]) ?? null;
      },
      create: async ({
        data,
      }: {
        data: Pick<
          StoredBillingSubscription,
          "userId" | "plan" | "provider" | "status"
        >;
      }) => {
        const subscription: StoredBillingSubscription = {
          id: `billing-${subscriptions.length + 1}`,
          providerCustomerId: null,
          providerSubscriptionId: null,
          providerPaymentId: null,
          checkoutUrl: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          canceledAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        subscriptions.push(subscription);
        return subscription;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<StoredBillingSubscription>;
      }) => {
        const subscription = subscriptions.find(
          (item) => item.id === where.id,
        )!;
        Object.assign(subscription, data, { updatedAt: new Date() });
        return subscription;
      },
    },
    billingWebhookEvent: {
      create: async ({
        data,
      }: {
        data: { eventId: string; eventType: string };
      }) => {
        if (
          options?.duplicateEvent ||
          events.some((event) => event.eventId === data.eventId)
        ) {
          if (!events.some((event) => event.eventId === data.eventId)) {
            events.push({
              id: "event-existing",
              eventId: data.eventId,
              eventType: data.eventType,
              processedAt: options?.duplicateProcessed ? new Date() : null,
            });
          }

          throw new Prisma.PrismaClientKnownRequestError("duplicate", {
            code: "P2002",
            clientVersion: "test",
          });
        }

        const event = {
          id: `event-${events.length + 1}`,
          eventId: data.eventId,
          eventType: data.eventType,
          processedAt: null,
        };
        events.push(event);
        return event;
      },
      findUnique: async ({ where }: { where: { eventId: string } }) =>
        events.find((event) => event.eventId === where.eventId) ?? null,
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { processedAt: Date };
      }) => {
        const event = events.find((item) => item.id === where.id)!;
        event.processedAt = data.processedAt;
        return event;
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
  };
  const asaas = {
    createSubscription: async (
      asaasUser: typeof user,
      plan: Plan,
      localSubscriptionId: string,
      existingCustomerId?: string | null,
    ) => {
      asaasCalls.push({
        user: { ...asaasUser },
        plan,
        localSubscriptionId,
        existingCustomerId,
      });
      return {
        customerId: "cus_1",
        subscriptionId: "sub_1",
        paymentId: "pay_1",
        checkoutUrl: "https://sandbox.asaas.com/i/pay_1",
        status: "PENDING",
      };
    },
    cancelSubscription: async () => undefined,
    handleWebhook: (payload: {
      id: string;
      event: string;
      payment: {
        id: string;
        subscription: string;
        externalReference?: string;
      };
    }) => ({
      eventId: payload.id,
      eventType: payload.event,
      payment: {
        id: payload.payment.id,
        subscriptionId: payload.payment.subscription,
        externalReference: payload.payment.externalReference,
      },
      payload,
    }),
  };
  const service = new BillingService(
    prisma as never,
    asaas as never,
    {
      get: (key: string) =>
        key === "ASAAS_WEBHOOK_TOKEN"
          ? (options?.webhookToken ?? "secret")
          : undefined,
    } as never,
    {
      getLimits: (plan: Plan) => ({
        maxWhatsAppSessions: plan === Plan.PRO ? 5 : 1,
        maxSourceGroups:
          plan === Plan.FREE ? 3 : plan === Plan.BASIC ? 10 : null,
        maxDestinationGroups:
          plan === Plan.FREE ? 1 : plan === Plan.BASIC ? 5 : null,
        adsEnabled: plan === Plan.FREE,
      }),
    } as never,
  );

  return { service, user, subscriptions, asaasCalls };
}

function createCheckout(
  service: BillingService,
  plan: Extract<Plan, "BASIC" | "PRO">,
) {
  return service.checkout("user-1", plan);
}

function webhook(event: string) {
  return {
    id: `evt_${event}`,
    event,
    payment: {
      id: "pay_1",
      subscription: "sub_1",
      externalReference: "billing-1",
    },
  };
}

describe("BillingService", () => {
  it("rejects checkout without CPF/CNPJ", async () => {
    const { service, subscriptions } = makeService({ cpfCnpj: null });

    await assert.rejects(
      service.checkout("user-1", Plan.PRO, undefined),
      (error) =>
        error instanceof BadRequestException &&
        error.message === "CPF/CNPJ is required for checkout.",
    );
    assert.equal(subscriptions.length, 0);
  });

  it("normalizes, saves, and sends CPF/CNPJ to Asaas", async () => {
    const { service, user, asaasCalls } = makeService({ cpfCnpj: null });

    await service.checkout("user-1", Plan.PRO, "123.456.789-09");

    assert.equal(user.cpfCnpj, "12345678909");
    assert.equal(asaasCalls[0]?.user.cpfCnpj, "12345678909");
  });

  it("accepts and normalizes a valid CNPJ", async () => {
    const { service, user } = makeService({ cpfCnpj: null });

    await service.checkout("user-1", Plan.BASIC, "11.222.333/0001-81");

    assert.equal(user.cpfCnpj, "11222333000181");
  });

  it("returns only the masked CPF/CNPJ in subscription", async () => {
    const { service } = makeService();

    const result = await service.subscription("user-1");

    assert.equal(result.cpfCnpjMasked, "***.***.***-09");
    assert.equal("cpfCnpj" in result, false);
  });

  it("creates a pending Asaas checkout", async () => {
    const { service, user, subscriptions } = makeService();

    const result = await createCheckout(service, Plan.BASIC);

    assert.deepEqual(result, {
      plan: Plan.BASIC,
      checkoutUrl: "https://sandbox.asaas.com/i/pay_1",
      subscriptionId: "billing-1",
      status: SubscriptionStatus.PENDING,
    });
    assert.equal(subscriptions[0]?.providerSubscriptionId, "sub_1");
    assert.equal(user.subscriptionStatus, SubscriptionStatus.PENDING);
  });

  it("derives displayed features from PlanLimitsService", () => {
    const { service } = makeService();
    const plans = service.plans();
    const free = plans.find((plan) => plan.id === Plan.FREE)!;
    const basic = plans.find((plan) => plan.id === Plan.BASIC)!;
    const pro = plans.find((plan) => plan.id === Plan.PRO)!;

    assert.equal(free.priceCents, 0);
    assert.equal(basic.priceCents, 7990);
    assert.equal(pro.priceCents, 9990);
    assert.ok(free.features.includes("propaganda Promohub"));
    assert.ok(free.features.includes("até 3 grupos origem"));
  });

  it("activates the contracted plan for 30 days", async () => {
    const { service, user, subscriptions } = makeService();
    await createCheckout(service, Plan.PRO);

    const result = await service.handleAsaasWebhook(
      "secret",
      webhook("PAYMENT_CONFIRMED"),
    );

    assert.equal(result.processed, true);
    assert.equal(user.plan, Plan.PRO);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.ACTIVE);
    assert.ok(subscriptions[0]?.currentPeriodStart);
    assert.ok(subscriptions[0]?.currentPeriodEnd);
    assert.equal(
      subscriptions[0]!.currentPeriodEnd!.getTime() -
        subscriptions[0]!.currentPeriodStart!.getTime(),
      30 * 24 * 60 * 60 * 1000,
    );
  });

  it("returns to FREE immediately when a payment is overdue", async () => {
    const { service, user, subscriptions } = makeService();
    await createCheckout(service, Plan.BASIC);
    user.plan = Plan.BASIC;

    await service.handleAsaasWebhook("secret", webhook("PAYMENT_OVERDUE"));

    assert.equal(user.plan, Plan.FREE);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.PAST_DUE);
    assert.equal(subscriptions[0]?.status, SubscriptionStatus.PAST_DUE);
  });

  it("returns to FREE immediately after a refund", async () => {
    const { service, user } = makeService();
    await createCheckout(service, Plan.BASIC);
    user.plan = Plan.BASIC;

    await service.handleAsaasWebhook("secret", webhook("PAYMENT_REFUNDED"));

    assert.equal(user.plan, Plan.FREE);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.CANCELED);
  });

  it("rejects an invalid configured webhook token", async () => {
    const { service } = makeService();

    await assert.rejects(
      () => service.handleAsaasWebhook("wrong", webhook("PAYMENT_CONFIRMED")),
      UnauthorizedException,
    );
  });

  it("rejects webhooks when no token is configured", async () => {
    const { service } = makeService({ webhookToken: "" });

    await assert.rejects(
      () => service.handleAsaasWebhook(undefined, webhook("PAYMENT_CONFIRMED")),
      UnauthorizedException,
    );
  });

  it("ignores an already processed duplicate webhook event", async () => {
    const { service } = makeService({
      duplicateEvent: true,
      duplicateProcessed: true,
    });

    const result = await service.handleAsaasWebhook(
      "secret",
      webhook("PAYMENT_CONFIRMED"),
    );

    assert.deepEqual(result, {
      received: true,
      duplicate: true,
      processed: false,
    });
  });

  it("retries a duplicate event that was not processed", async () => {
    const { service, user } = makeService({ duplicateEvent: true });
    await createCheckout(service, Plan.BASIC);

    const result = await service.handleAsaasWebhook(
      "secret",
      webhook("PAYMENT_CONFIRMED"),
    );

    assert.equal(result.processed, true);
    assert.equal(user.plan, Plan.BASIC);
  });

  it("returns the current subscription contract", async () => {
    const { service } = makeService();
    await createCheckout(service, Plan.PRO);
    await service.handleAsaasWebhook("secret", webhook("PAYMENT_CONFIRMED"));

    const result = await service.subscription("user-1");

    assert.equal(result.plan, Plan.PRO);
    assert.equal(result.status, SubscriptionStatus.ACTIVE);
    assert.ok(result.currentPeriodStart);
    assert.ok(result.currentPeriodEnd);
    assert.equal(result.providerSubscriptionId, "sub_1");
  });

  it("cancels the Asaas subscription and downgrades immediately", async () => {
    const { service, user, subscriptions } = makeService();
    await createCheckout(service, Plan.BASIC);
    user.plan = Plan.BASIC;
    user.subscriptionStatus = SubscriptionStatus.ACTIVE;
    subscriptions[0]!.status = SubscriptionStatus.ACTIVE;

    const result = await service.cancel("user-1");

    assert.equal(result.plan, Plan.FREE);
    assert.equal(result.status, SubscriptionStatus.CANCELED);
    assert.equal(user.plan, Plan.FREE);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.CANCELED);
    assert.equal(subscriptions[0]?.status, SubscriptionStatus.CANCELED);
  });
});
