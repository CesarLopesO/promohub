import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import {
  BillingPaymentMethod,
  Plan,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";

import { BillingService, CPF_CNPJ_INVALID } from "./billing.service";

type StoredBillingSubscription = {
  id: string;
  userId: string;
  plan: Plan;
  paymentMethod: BillingPaymentMethod;
  provider: string;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  providerPaymentId: string | null;
  status: SubscriptionStatus;
  checkoutUrl: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  cancelAtPeriodEnd: boolean;
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
  prices?: Partial<Record<Plan, number>>;
  cancelError?: Error;
}) {
  const user: {
    id: string;
    name: string;
    email: string;
    cpfCnpj: string | null;
    cpfCnpjHash: string | null;
    plan: Plan;
    subscriptionStatus: SubscriptionStatus;
  } = {
    id: "user-1",
    name: "User",
    email: "user@example.com",
    cpfCnpj:
      options?.cpfCnpj === undefined ? "***.***.***-09" : options.cpfCnpj,
    cpfCnpjHash: null,
    plan: Plan.FREE,
    subscriptionStatus: SubscriptionStatus.NONE,
  };
  const subscriptions: StoredBillingSubscription[] = [];
  const events: StoredWebhookEvent[] = [];
  const asaasCalls: Array<{
    method: BillingPaymentMethod;
    user: typeof user;
    plan: Plan;
    priceCents: number;
    localSubscriptionId: string;
    existingCustomerId?: string | null;
  }> = [];
  const referralConfirmations: string[] = [];
  const referralResets: string[] = [];
  const canceledProviderSubscriptions: string[] = [];
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
          id?: string;
          provider?: string;
          createdAt?: { gt: Date };
          providerCustomerId?: { not: null };
          providerSubscriptionId?: string | { not: null | string };
          providerPaymentId?: string;
          status?: SubscriptionStatus | { in: SubscriptionStatus[] };
          cancelAtPeriodEnd?: boolean;
          currentPeriodEnd?: { lte: Date };
          OR?: Array<Record<string, string>>;
        };
        orderBy?: { createdAt: "desc" };
      }) => {
        const matching = subscriptions.filter((subscription) => {
          if (where.userId && subscription.userId !== where.userId) {
            return false;
          }

          if (where.id && subscription.id !== where.id) {
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
            where.cancelAtPeriodEnd !== undefined &&
            subscription.cancelAtPeriodEnd !== where.cancelAtPeriodEnd
          ) {
            return false;
          }

          if (
            where.currentPeriodEnd?.lte &&
            (!subscription.currentPeriodEnd ||
              subscription.currentPeriodEnd > where.currentPeriodEnd.lte)
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

          if (where.providerSubscriptionId) {
            if (typeof where.providerSubscriptionId === "string") {
              return (
                subscription.providerSubscriptionId ===
                where.providerSubscriptionId
              );
            }

            const excluded = where.providerSubscriptionId.not;

            if (excluded === null && !subscription.providerSubscriptionId) {
              return false;
            }

            if (
              typeof excluded === "string" &&
              subscription.providerSubscriptionId === excluded
            ) {
              return false;
            }
          }

          if (
            where.providerPaymentId &&
            subscription.providerPaymentId !== where.providerPaymentId
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
          "userId" | "plan" | "paymentMethod" | "provider" | "status"
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
          cancelAtPeriodEnd: false,
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
      priceCents: number,
      localSubscriptionId: string,
      existingCustomerId?: string | null,
    ) => {
      asaasCalls.push({
        method: BillingPaymentMethod.FLEXIBLE,
        user: { ...asaasUser },
        plan,
        priceCents,
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
    createRecurringCardCheckout: async (
      asaasUser: typeof user,
      plan: Plan,
      priceCents: number,
      localSubscriptionId: string,
      existingCustomerId?: string | null,
    ) => {
      asaasCalls.push({
        method: BillingPaymentMethod.CREDIT_CARD_RECURRING,
        user: { ...asaasUser },
        plan,
        priceCents,
        localSubscriptionId,
        existingCustomerId,
      });
      return {
        customerId: "cus_1",
        checkoutUrl:
          "https://asaas.com/checkoutSession/show?id=checkout-recurring-1",
        status: "PENDING",
      };
    },
    cancelSubscription: async (subscriptionId: string) => {
      if (options?.cancelError) {
        throw options.cancelError;
      }

      canceledProviderSubscriptions.push(subscriptionId);
    },
    handleWebhook: (payload: {
      id: string;
      event: string;
      payment?: {
        id: string;
        subscription: string;
        externalReference?: string;
        cpfCnpj?: string;
      };
      subscription?: {
        id: string;
        externalReference?: string;
      };
    }) => ({
      eventId: payload.id,
      eventType: payload.event,
      ...(payload.payment?.cpfCnpj
        ? { cpfCnpj: payload.payment.cpfCnpj.replace(/\D/g, "") }
        : {}),
      payment: {
        id: payload.payment?.id,
        subscriptionId:
          payload.payment?.subscription ?? payload.subscription?.id,
        externalReference:
          payload.payment?.externalReference ??
          payload.subscription?.externalReference,
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
          : key === "REFERRAL_CPF_HASH_PEPPER"
            ? "test-pepper"
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
    {
      confirmPayment: async (userId: string) => {
        referralConfirmations.push(userId);
      },
      resetWaitingPeriod: async (userId: string) => {
        referralResets.push(userId);
      },
    } as never,
    {
      getPrices: async () => ({
        FREE: 0,
        BASIC: 7_990,
        PRO: 9_990,
        ...options?.prices,
      }),
      getPaidPlanPrice: async (plan: Plan) =>
        ({
          FREE: 0,
          BASIC: 7_990,
          PRO: 9_990,
          ...options?.prices,
        })[plan],
    } as never,
  );

  return {
    service,
    user,
    subscriptions,
    asaasCalls,
    referralConfirmations,
    referralResets,
    canceledProviderSubscriptions,
  };
}

function createCheckout(
  service: BillingService,
  plan: Extract<Plan, "BASIC" | "PRO">,
  paymentMethod: BillingPaymentMethod = BillingPaymentMethod.FLEXIBLE,
) {
  return service.checkout("user-1", plan, "123.456.789-09", paymentMethod);
}

function webhook(event: string, cpfCnpj?: string) {
  return {
    id: `evt_${event}`,
    event,
    payment: {
      id: "pay_1",
      subscription: "sub_1",
      externalReference: "billing-1",
      ...(cpfCnpj ? { cpfCnpj } : {}),
    },
  };
}

describe("BillingService", () => {
  it("rejects checkout without CPF/CNPJ", async () => {
    const { service, subscriptions } = makeService({ cpfCnpj: null });

    await assert.rejects(
      service.checkout("user-1", Plan.PRO, undefined),
      (error) => {
        assert.ok(error instanceof BadRequestException);
        assert.deepEqual(error.getResponse(), {
          code: CPF_CNPJ_INVALID,
          message: "Informe um CPF ou CNPJ válido para gerar a cobrança.",
        });
        return true;
      },
    );
    assert.equal(subscriptions.length, 0);
  });

  it("accepts formatted CPF and stores only masked and peppered data", async () => {
    const { service, user, asaasCalls } = makeService({ cpfCnpj: null });

    await service.checkout("user-1", Plan.PRO, "123.456.789-09");

    assert.equal(user.cpfCnpj, "***.***.***-09");
    assert.match(user.cpfCnpjHash ?? "", /^[a-f0-9]{64}$/);
    assert.notEqual(user.cpfCnpjHash, "12345678909");
    assert.equal(asaasCalls[0]?.user.cpfCnpj, "12345678909");
  });

  it("accepts CPF with digits only", async () => {
    const { service, user, asaasCalls } = makeService({ cpfCnpj: null });

    await service.checkout("user-1", Plan.BASIC, "12345678909");

    assert.equal(user.cpfCnpj, "***.***.***-09");
    assert.equal(asaasCalls[0]?.user.cpfCnpj, "12345678909");
  });

  it("accepts and normalizes a valid formatted CNPJ", async () => {
    const { service, user, asaasCalls } = makeService({ cpfCnpj: null });

    await service.checkout("user-1", Plan.BASIC, "11.222.333/0001-81");

    assert.equal(user.cpfCnpj, "**.***.***/****-81");
    assert.match(user.cpfCnpjHash ?? "", /^[a-f0-9]{64}$/);
    assert.equal(asaasCalls[0]?.user.cpfCnpj, "11222333000181");
  });

  it("returns CPF_CNPJ_INVALID for invalid CPF/CNPJ", async () => {
    const { service } = makeService({ cpfCnpj: null });

    await assert.rejects(
      service.checkout("user-1", Plan.BASIC, "123.456.789-00"),
      (error) => {
        assert.ok(error instanceof BadRequestException);
        assert.deepEqual(error.getResponse(), {
          code: CPF_CNPJ_INVALID,
          message: "Informe um CPF ou CNPJ válido para gerar a cobrança.",
        });
        return true;
      },
    );
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
      paymentMethod: BillingPaymentMethod.FLEXIBLE,
      checkoutUrl: "https://sandbox.asaas.com/i/pay_1",
      subscriptionId: "billing-1",
      status: SubscriptionStatus.PENDING,
    });
    assert.equal(subscriptions[0]?.providerSubscriptionId, "sub_1");
    assert.equal(
      subscriptions[0]?.paymentMethod,
      BillingPaymentMethod.FLEXIBLE,
    );
    assert.equal(user.subscriptionStatus, SubscriptionStatus.PENDING);
  });

  it("creates and stores a recurring credit card checkout", async () => {
    const { service, subscriptions, asaasCalls } = makeService();

    const result = await createCheckout(
      service,
      Plan.PRO,
      BillingPaymentMethod.CREDIT_CARD_RECURRING,
    );

    assert.deepEqual(result, {
      plan: Plan.PRO,
      paymentMethod: BillingPaymentMethod.CREDIT_CARD_RECURRING,
      checkoutUrl:
        "https://asaas.com/checkoutSession/show?id=checkout-recurring-1",
      subscriptionId: "billing-1",
      status: SubscriptionStatus.PENDING,
    });
    assert.equal(
      subscriptions[0]?.paymentMethod,
      BillingPaymentMethod.CREDIT_CARD_RECURRING,
    );
    assert.equal(subscriptions[0]?.providerSubscriptionId, null);
    assert.equal(
      asaasCalls[0]?.method,
      BillingPaymentMethod.CREDIT_CARD_RECURRING,
    );
    assert.doesNotMatch(
      JSON.stringify({ subscription: subscriptions[0], call: asaasCalls[0] }),
      /creditCard|cardNumber|ccv|expiry/i,
    );
  });

  it("rejects an invalid payment method", async () => {
    const { service, subscriptions } = makeService();

    await assert.rejects(
      () => service.checkout("user-1", Plan.BASIC, "123.456.789-09", "PIX"),
      BadRequestException,
    );
    assert.equal(subscriptions.length, 0);
  });

  it("does not expose full CPF/CNPJ in checkout logs or public response", async () => {
    const { service } = makeService({ cpfCnpj: null });
    const originalLog = console.log;
    const logs: string[] = [];
    console.log = (...values: unknown[]) => {
      logs.push(values.map(String).join(" "));
    };

    try {
      const result = await service.checkout(
        "user-1",
        Plan.BASIC,
        "123.456.789-09",
      );

      assert.doesNotMatch(JSON.stringify(result), /12345678909/);
      assert.doesNotMatch(JSON.stringify(result), /123\.456\.789-09/);
      assert.doesNotMatch(logs.join("\n"), /12345678909/);
      assert.doesNotMatch(logs.join("\n"), /123\.456\.789-09/);
    } finally {
      console.log = originalLog;
    }
  });

  it("derives displayed features from PlanLimitsService", async () => {
    const { service } = makeService();
    const plans = await service.plans();
    const free = plans.find((plan) => plan.id === Plan.FREE)!;
    const basic = plans.find((plan) => plan.id === Plan.BASIC)!;
    const pro = plans.find((plan) => plan.id === Plan.PRO)!;

    assert.equal(free.priceCents, 0);
    assert.equal(basic.priceCents, 7990);
    assert.equal(pro.priceCents, 9990);
    assert.equal(free.description, "Comece grátis com automação básica.");
    assert.equal(
      basic.description,
      "Para operações em crescimento sem propaganda.",
    );
    assert.equal(
      pro.description,
      "Para operação profissional com múltiplos WhatsApps.",
    );
    assert.ok(free.features.includes("propaganda PeppaBot"));
    assert.ok(free.features.includes("até 3 grupos origem"));
  });

  it("returns plan price overrides from /billing/plans", async () => {
    const { service } = makeService({
      prices: { BASIC: 8_490, PRO: 12_990 },
    });

    const plans = await service.plans();

    assert.equal(plans.find((plan) => plan.id === Plan.FREE)?.priceCents, 0);
    assert.equal(
      plans.find((plan) => plan.id === Plan.BASIC)?.priceCents,
      8490,
    );
    assert.equal(plans.find((plan) => plan.id === Plan.PRO)?.priceCents, 12990);
  });

  it("uses the overridden price when creating checkout", async () => {
    const { service, asaasCalls } = makeService({
      prices: { BASIC: 8_490 },
    });

    await createCheckout(service, Plan.BASIC);

    assert.equal(asaasCalls[0]?.priceCents, 8_490);
  });

  it("activates the contracted plan for 30 days", async () => {
    const { service, user, subscriptions, referralConfirmations } =
      makeService();
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
    assert.deepEqual(referralConfirmations, ["user-1"]);
  });

  it("PAYMENT_CONFIRMED renews the current period from the active end date", async () => {
    const { service, subscriptions } = makeService();
    await createCheckout(service, Plan.PRO);
    await service.handleAsaasWebhook("secret", webhook("PAYMENT_CONFIRMED"));
    const firstEnd = subscriptions[0]!.currentPeriodEnd!;
    subscriptions[0]!.providerPaymentId = "pay_previous";

    await service.handleAsaasWebhook("secret", {
      id: "evt_PAYMENT_CONFIRMED_RENEWAL",
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay_2",
        subscription: "sub_1",
        externalReference: "billing-1",
      },
    });

    assert.deepEqual(subscriptions[0]?.currentPeriodStart, firstEnd);
    assert.equal(
      subscriptions[0]!.currentPeriodEnd!.getTime() - firstEnd.getTime(),
      30 * 24 * 60 * 60 * 1000,
    );
  });

  it("PAYMENT_CONFIRMED associates the Asaas subscription created by recurring checkout", async () => {
    const { service, subscriptions } = makeService();
    await createCheckout(
      service,
      Plan.PRO,
      BillingPaymentMethod.CREDIT_CARD_RECURRING,
    );

    await service.handleAsaasWebhook("secret", webhook("PAYMENT_CONFIRMED"));

    assert.equal(subscriptions[0]?.providerSubscriptionId, "sub_1");
    assert.equal(subscriptions[0]?.status, SubscriptionStatus.ACTIVE);
  });

  it("does not confirm referrals for non-confirmed payment events", async () => {
    const { service, referralConfirmations } = makeService();
    await createCheckout(service, Plan.BASIC);

    await service.handleAsaasWebhook("secret", webhook("PAYMENT_RECEIVED"));

    assert.deepEqual(referralConfirmations, []);
  });

  it("updates the masked document and hash from a confirmed webhook", async () => {
    const { service, user } = makeService({ cpfCnpj: null });
    await createCheckout(service, Plan.BASIC);
    user.cpfCnpj = null;
    user.cpfCnpjHash = null;

    await service.handleAsaasWebhook(
      "secret",
      webhook("PAYMENT_CONFIRMED", "12.345.678/0001-81"),
    );

    assert.equal(user.cpfCnpj, "**.***.***/****-81");
    assert.match(user.cpfCnpjHash ?? "", /^[a-f0-9]{64}$/);
    assert.notEqual(user.cpfCnpjHash, "12345678000181");
  });

  it("returns to FREE immediately when a payment is overdue", async () => {
    const { service, user, subscriptions, referralResets } = makeService();
    await createCheckout(service, Plan.BASIC);
    user.plan = Plan.BASIC;

    await service.handleAsaasWebhook("secret", webhook("PAYMENT_OVERDUE"));

    assert.equal(user.plan, Plan.FREE);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.PAST_DUE);
    assert.equal(subscriptions[0]?.status, SubscriptionStatus.PAST_DUE);
    assert.deepEqual(referralResets, ["user-1"]);
  });

  it("downgrades when a newer ACTIVE row represents the same Asaas subscription", async () => {
    const { service, user, subscriptions } = makeService();
    await createCheckout(service, Plan.BASIC);
    await service.handleAsaasWebhook("secret", webhook("PAYMENT_CONFIRMED"));
    const matchedSubscription = subscriptions[0]!;
    matchedSubscription.providerPaymentId = "pay_overdue";
    const newerDuplicate: StoredBillingSubscription = {
      ...matchedSubscription,
      id: "billing-2",
      providerPaymentId: "pay_renewal",
      status: SubscriptionStatus.ACTIVE,
      createdAt: new Date(matchedSubscription.createdAt.getTime() + 1_000),
      updatedAt: new Date(matchedSubscription.updatedAt.getTime() + 1_000),
    };
    subscriptions.push(newerDuplicate);

    const result = await service.handleAsaasWebhook("secret", {
      id: "evt_PAYMENT_OVERDUE_DUPLICATE",
      event: "PAYMENT_OVERDUE",
      payment: {
        id: "pay_overdue",
        subscription: "sub_1",
        externalReference: "billing-1",
      },
    });

    assert.equal(result.processed, true);
    assert.equal(newerDuplicate.status, SubscriptionStatus.PAST_DUE);
    assert.equal(newerDuplicate.providerSubscriptionId, "sub_1");
    assert.equal(user.plan, Plan.FREE);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.PAST_DUE);
  });

  it("does not downgrade for an overdue event from a different older subscription", async () => {
    const { service, user, subscriptions } = makeService();
    await createCheckout(service, Plan.BASIC);
    await service.handleAsaasWebhook("secret", webhook("PAYMENT_CONFIRMED"));
    const olderSubscription = subscriptions[0]!;
    olderSubscription.providerPaymentId = "pay_old_overdue";
    subscriptions.push({
      ...olderSubscription,
      id: "billing-2",
      providerSubscriptionId: "sub_new",
      providerPaymentId: "pay_new",
      status: SubscriptionStatus.ACTIVE,
      createdAt: new Date(olderSubscription.createdAt.getTime() + 1_000),
      updatedAt: new Date(olderSubscription.updatedAt.getTime() + 1_000),
    });

    await service.handleAsaasWebhook("secret", {
      id: "evt_PAYMENT_OVERDUE_OLD_SUBSCRIPTION",
      event: "PAYMENT_OVERDUE",
      payment: {
        id: "pay_old_overdue",
        subscription: "sub_1",
        externalReference: "billing-1",
      },
    });

    assert.equal(olderSubscription.status, SubscriptionStatus.PAST_DUE);
    assert.equal(user.plan, Plan.BASIC);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.ACTIVE);
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

  it("schedules cancellation in Asaas and keeps BASIC until currentPeriodEnd", async () => {
    const { service, user, subscriptions, canceledProviderSubscriptions } =
      makeService();
    await createCheckout(service, Plan.BASIC);
    user.plan = Plan.BASIC;
    user.subscriptionStatus = SubscriptionStatus.ACTIVE;
    subscriptions[0]!.status = SubscriptionStatus.ACTIVE;
    subscriptions[0]!.currentPeriodEnd = new Date(Date.now() + 86_400_000);

    const result = await service.cancel("user-1");

    assert.equal(result.plan, Plan.BASIC);
    assert.equal(result.status, SubscriptionStatus.ACTIVE);
    assert.equal(result.cancelAtPeriodEnd, true);
    assert.equal(user.plan, Plan.BASIC);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.ACTIVE);
    assert.equal(subscriptions[0]?.status, SubscriptionStatus.CANCELED);
    assert.equal(subscriptions[0]?.cancelAtPeriodEnd, true);
    assert.ok(subscriptions[0]?.canceledAt);
    assert.deepEqual(canceledProviderSubscriptions, ["sub_1"]);
  });

  it("expires a scheduled cancellation after currentPeriodEnd", async () => {
    const { service, user, subscriptions } = makeService();
    await createCheckout(service, Plan.BASIC);
    user.plan = Plan.BASIC;
    user.subscriptionStatus = SubscriptionStatus.ACTIVE;
    subscriptions[0]!.status = SubscriptionStatus.CANCELED;
    subscriptions[0]!.cancelAtPeriodEnd = true;
    subscriptions[0]!.currentPeriodEnd = new Date(Date.now() - 1_000);
    subscriptions[0]!.canceledAt = new Date(Date.now() - 86_400_000);

    const result = await service.subscription("user-1");

    assert.equal(result.plan, Plan.FREE);
    assert.equal(result.status, SubscriptionStatus.CANCELED);
    assert.equal(result.cancelAtPeriodEnd, false);
    assert.equal(user.plan, Plan.FREE);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.CANCELED);
  });

  it("does not mark cancellation when Asaas fails", async () => {
    const { service, user, subscriptions } = makeService({
      cancelError: new Error("Asaas unavailable"),
    });
    await createCheckout(service, Plan.PRO);
    user.plan = Plan.PRO;
    user.subscriptionStatus = SubscriptionStatus.ACTIVE;
    subscriptions[0]!.status = SubscriptionStatus.ACTIVE;
    subscriptions[0]!.currentPeriodEnd = new Date(Date.now() + 86_400_000);

    await assert.rejects(() => service.cancel("user-1"), /Asaas unavailable/);

    assert.equal(user.plan, Plan.PRO);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.ACTIVE);
    assert.equal(subscriptions[0]?.status, SubscriptionStatus.ACTIVE);
    assert.equal(subscriptions[0]?.cancelAtPeriodEnd, false);
    assert.equal(subscriptions[0]?.canceledAt, null);
  });

  it("does not allow FREE users to cancel", async () => {
    const { service, canceledProviderSubscriptions } = makeService();

    await assert.rejects(
      () => service.cancel("user-1"),
      /No active paid subscription/,
    );
    assert.deepEqual(canceledProviderSubscriptions, []);
  });

  it("reactivates a new payment after cancellation", async () => {
    const { service, user, subscriptions } = makeService();
    await createCheckout(service, Plan.BASIC);
    user.plan = Plan.BASIC;
    user.subscriptionStatus = SubscriptionStatus.ACTIVE;
    subscriptions[0]!.status = SubscriptionStatus.CANCELED;
    subscriptions[0]!.cancelAtPeriodEnd = true;
    subscriptions[0]!.canceledAt = new Date();
    subscriptions[0]!.currentPeriodEnd = new Date(Date.now() + 86_400_000);

    await createCheckout(service, Plan.PRO);
    subscriptions[1]!.providerSubscriptionId = "sub_2";
    subscriptions[1]!.providerPaymentId = "pay_2";

    await service.handleAsaasWebhook("secret", {
      id: "evt_new_subscription_confirmed",
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay_2",
        subscription: "sub_2",
        externalReference: "billing-2",
      },
    });

    assert.equal(user.plan, Plan.PRO);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.ACTIVE);
    assert.equal(subscriptions[0]?.status, SubscriptionStatus.CANCELED);
    assert.equal(subscriptions[0]?.cancelAtPeriodEnd, true);
    assert.equal(subscriptions[1]?.status, SubscriptionStatus.ACTIVE);
    assert.equal(subscriptions[1]?.cancelAtPeriodEnd, false);
    assert.equal(subscriptions[1]?.canceledAt, null);
  });

  it("schedules cancellation from a SUBSCRIPTION_DELETED webhook", async () => {
    const { service, user, subscriptions } = makeService();
    await createCheckout(service, Plan.BASIC);
    user.plan = Plan.BASIC;
    user.subscriptionStatus = SubscriptionStatus.ACTIVE;
    subscriptions[0]!.status = SubscriptionStatus.ACTIVE;
    subscriptions[0]!.currentPeriodEnd = new Date(Date.now() + 86_400_000);

    const result = await service.handleAsaasWebhook("secret", {
      id: "evt_subscription_deleted",
      event: "SUBSCRIPTION_DELETED",
      subscription: {
        id: "sub_1",
        externalReference: "billing-1",
      },
    });

    assert.equal(result.processed, true);
    assert.equal(user.plan, Plan.BASIC);
    assert.equal(user.subscriptionStatus, SubscriptionStatus.ACTIVE);
    assert.equal(subscriptions[0]?.status, SubscriptionStatus.CANCELED);
    assert.equal(subscriptions[0]?.cancelAtPeriodEnd, true);
  });
});
