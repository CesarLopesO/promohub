import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpException } from "@nestjs/common";
import { Plan } from "@prisma/client";

import { AsaasService } from "./asaas.service";

function makeService(
  request: (config: {
    method: string;
    url: string;
    data?: Record<string, unknown>;
    params?: Record<string, string | number>;
    headers?: Record<string, string>;
  }) => Promise<{ data: unknown }>,
) {
  const service = new AsaasService({
    get: (key: string, fallback?: string) =>
      key === "ASAAS_API_KEY"
        ? "test-api-key"
        : key === "ASAAS_BASE_URL"
          ? "https://sandbox.asaas.com/api/v3"
          : fallback,
  } as never);

  (
    service as unknown as {
      client: { request: typeof request };
    }
  ).client = { request };

  return service;
}

describe("AsaasService", () => {
  it("creates a monthly BASIC subscription and returns its invoice", async () => {
    const requests: Array<{
      method: string;
      url: string;
      data?: Record<string, unknown>;
      params?: Record<string, string | number>;
      headers?: Record<string, string>;
    }> = [];
    const service = makeService(async (config) => {
      requests.push(config);

      if (config.url === "/customers" && config.method === "get") {
        return { data: { data: [] } };
      }

      if (config.url === "/customers" && config.method === "post") {
        return { data: { id: "cus_1" } };
      }

      if (config.url === "/subscriptions") {
        return { data: { id: "sub_1", status: "PENDING" } };
      }

      return {
        data: {
          data: [
            {
              id: "pay_1",
              invoiceUrl: "https://sandbox.asaas.com/i/pay_1",
              status: "PENDING",
            },
          ],
        },
      };
    });

    const result = await service.createSubscription(
      {
        id: "user-1",
        name: "User",
        email: "user@example.com",
        cpfCnpj: "12345678909",
      },
      Plan.BASIC,
      7_990,
      "billing-1",
    );

    assert.deepEqual(result, {
      customerId: "cus_1",
      subscriptionId: "sub_1",
      paymentId: "pay_1",
      checkoutUrl: "https://sandbox.asaas.com/i/pay_1",
      status: "PENDING",
    });
    assert.deepEqual(requests[0]?.params, {
      externalReference: "user-1",
      limit: 1,
    });
    assert.equal(requests[1]?.headers?.access_token, "test-api-key");
    assert.deepEqual(requests[1]?.data, {
      name: "User",
      email: "user@example.com",
      cpfCnpj: "12345678909",
      externalReference: "user-1",
      notificationDisabled: false,
    });
    assert.deepEqual(requests[2]?.data, {
      customer: "cus_1",
      billingType: "UNDEFINED",
      value: 79.9,
      nextDueDate: new Date().toISOString().slice(0, 10),
      cycle: "MONTHLY",
      description: "PeppaBot BASIC",
      externalReference: "billing-1",
    });
  });

  it("reuses an existing customer for PRO", async () => {
    const urls: string[] = [];
    const service = makeService(async (config) => {
      urls.push(config.url);

      if (config.url === "/subscriptions") {
        assert.equal(config.data?.customer, "cus_existing");
        assert.equal(config.data?.value, 99.9);
        assert.equal(config.data?.description, "PeppaBot PRO");
        return { data: { id: "sub_2" } };
      }

      return {
        data: {
          data: [
            {
              id: "pay_2",
              invoiceUrl: "https://sandbox.asaas.com/i/pay_2",
            },
          ],
        },
      };
    });

    await service.createSubscription(
      {
        id: "user-1",
        name: null,
        email: "user@example.com",
        cpfCnpj: "12345678909",
      },
      Plan.PRO,
      9_990,
      "billing-2",
      "cus_existing",
    );

    assert.equal(urls.includes("/customers"), false);
  });

  it("finds an existing Asaas customer by external reference", async () => {
    const urls: string[] = [];
    const service = makeService(async (config) => {
      urls.push(`${config.method}:${config.url}`);

      if (config.url === "/customers") {
        return { data: { data: [{ id: "cus_found" }] } };
      }

      if (config.url === "/customers/cus_existing") {
        return { data: { id: "cus_existing", cpfCnpj: "12345678909" } };
      }

      if (config.url === "/subscriptions") {
        assert.equal(config.data?.customer, "cus_found");
        return { data: { id: "sub_3" } };
      }

      return {
        data: {
          data: [
            {
              id: "pay_3",
              invoiceUrl: "https://sandbox.asaas.com/i/pay_3",
            },
          ],
        },
      };
    });

    await service.createSubscription(
      {
        id: "user-1",
        name: "User",
        email: "user@example.com",
        cpfCnpj: "12345678909",
      },
      Plan.BASIC,
      7_990,
      "billing-3",
    );

    assert.equal(urls.includes("post:/customers"), false);
    assert.equal(urls.includes("put:/customers/cus_found"), true);
  });

  it("updates an existing Asaas customer without CPF/CNPJ", async () => {
    const requests: Array<{
      method: string;
      url: string;
      data?: Record<string, unknown>;
    }> = [];
    const service = makeService(async (config) => {
      requests.push(config);

      if (config.url === "/customers/cus_existing") {
        return { data: { id: "cus_existing" } };
      }

      if (config.method === "put") {
        return { data: { id: "cus_existing" } };
      }

      if (config.url === "/subscriptions") {
        return { data: { id: "sub_existing" } };
      }

      return {
        data: {
          data: [
            {
              id: "pay_existing",
              invoiceUrl: "https://sandbox.asaas.com/i/pay_existing",
            },
          ],
        },
      };
    });

    await service.createSubscription(
      {
        id: "user-1",
        name: "User",
        email: "user@example.com",
        cpfCnpj: "12345678909",
      },
      Plan.PRO,
      9_990,
      "billing-existing",
      "cus_existing",
    );

    const update = requests.find((request) => request.method === "put");
    assert.equal(update?.url, "/customers/cus_existing");
    assert.deepEqual(update?.data, { cpfCnpj: "12345678909" });
  });

  it("uses the provided plan price while keeping the Asaas description stable", async () => {
    const service = makeService(async (config) => {
      if (config.method === "post" && config.url === "/customers") {
        return { data: { id: "cus_custom" } };
      }

      if (config.url === "/customers") {
        return { data: { data: [] } };
      }

      if (config.url === "/subscriptions") {
        assert.equal(config.data?.value, 84.9);
        assert.equal(config.data?.description, "PeppaBot BASIC");
        return { data: { id: "sub_custom" } };
      }

      return {
        data: {
          data: [
            {
              id: "pay_custom",
              invoiceUrl: "https://sandbox.asaas.com/i/pay_custom",
            },
          ],
        },
      };
    });

    await service.createSubscription(
      {
        id: "user-1",
        name: "User",
        email: "user@example.com",
        cpfCnpj: "12345678909",
      },
      Plan.BASIC,
      8_490,
      "billing-custom",
    );
  });

  it("creates a hosted recurring credit card checkout", async () => {
    const requests: Array<{
      method: string;
      url: string;
      data?: Record<string, unknown>;
    }> = [];
    const service = makeService(async (config) => {
      requests.push(config);

      if (config.url === "/customers/cus_existing") {
        return {
          data: { id: "cus_existing", cpfCnpj: "12345678909" },
        };
      }

      if (config.url === "/checkouts") {
        return { data: { id: "checkout-recurring-1" } };
      }

      return { data: {} };
    });

    const result = await service.createRecurringCardCheckout(
      {
        id: "user-1",
        name: "User",
        email: "user@example.com",
        cpfCnpj: "12345678909",
      },
      Plan.PRO,
      9_990,
      "billing-recurring-1",
      "cus_existing",
    );

    assert.deepEqual(result, {
      customerId: "cus_existing",
      checkoutUrl:
        "https://asaas.com/checkoutSession/show?id=checkout-recurring-1",
      status: "PENDING",
    });
    assert.deepEqual(requests.at(-1)?.data, {
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 100,
      externalReference: "billing-recurring-1",
      callback: {
        cancelUrl: "http://localhost:3000/dashboard/billing",
        expiredUrl: "http://localhost:3000/dashboard/billing",
        successUrl: "http://localhost:3000/dashboard/billing",
      },
      items: [
        {
          name: "PeppaBot PRO",
          description: "PeppaBot PRO",
          quantity: 1,
          value: 99.9,
        },
      ],
      customer: "cus_existing",
      subscription: {
        cycle: "MONTHLY",
        nextDueDate: new Date().toISOString().slice(0, 10),
      },
    });
    assert.doesNotMatch(
      JSON.stringify(requests.at(-1)?.data),
      /creditCard|cardNumber|ccv|expiry/i,
    );
  });

  it("cancels an Asaas subscription", async () => {
    let requestConfig: { method: string; url: string } | undefined;
    const service = makeService(async (config) => {
      requestConfig = config;
      return { data: { deleted: true } };
    });

    await service.cancelSubscription("sub_1");

    assert.equal(requestConfig?.method, "delete");
    assert.equal(requestConfig?.url, "/subscriptions/sub_1");
  });

  it("exposes sanitized Asaas request details outside production", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const originalConsoleError = console.error;
    const logs: string[] = [];
    process.env.NODE_ENV = "development";
    console.error = (...values: unknown[]) => {
      logs.push(values.map(String).join(" "));
    };

    const service = makeService(async () => {
      throw {
        response: {
          status: 400,
          data: {
            errors: [{ description: "Invalid customer" }],
            access_token: "test-api-key",
            cpfCnpj: "12345678909",
          },
        },
        config: {
          method: "post",
          url: "/subscriptions?access_token=test-api-key",
        },
      };
    });

    try {
      await assert.rejects(service.cancelSubscription("sub_1"), (error) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), 502);
        assert.deepEqual(error.getResponse(), {
          message: "Asaas request failed.",
          asaasStatus: 400,
          asaasError: {
            errors: [{ description: "Invalid customer" }],
            access_token: "[REDACTED]",
            cpfCnpj: "***.***.***-09",
          },
          asaasPath: "/subscriptions?access_token=[REDACTED]",
        });
        return true;
      });

      assert.match(
        logs[0] ?? "",
        /^\[ASAAS\] request failed method=POST url=\/subscriptions/,
      );
      assert.doesNotMatch(logs[0] ?? "", /test-api-key/);
      assert.doesNotMatch(logs[0] ?? "", /12345678909/);
      assert.match(logs[0] ?? "", /\*\*\*\.\*\*\*\.\*\*\*-\d{2}/);
    } finally {
      console.error = originalConsoleError;
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  it("parses the Asaas webhook identifiers", () => {
    const service = makeService(async () => ({ data: {} }));

    assert.deepEqual(
      service.handleWebhook({
        id: "evt_1",
        event: "PAYMENT_CONFIRMED",
        payment: {
          id: "pay_1",
          subscription: "sub_1",
          externalReference: "billing-1",
        },
      }),
      {
        eventId: "evt_1",
        eventType: "PAYMENT_CONFIRMED",
        payment: {
          id: "pay_1",
          subscriptionId: "sub_1",
          externalReference: "billing-1",
        },
        payload: {
          id: "evt_1",
          event: "PAYMENT_CONFIRMED",
          payment: {
            id: "pay_1",
            subscription: "sub_1",
            externalReference: "billing-1",
          },
        },
      },
    );
  });

  it("parses subscription identifiers from SUBSCRIPTION_DELETED", () => {
    const service = makeService(async () => ({ data: {} }));

    const result = service.handleWebhook({
      id: "evt_subscription_deleted",
      event: "SUBSCRIPTION_DELETED",
      subscription: {
        id: "sub_1",
        externalReference: "billing-1",
      },
    });

    assert.equal(result.eventType, "SUBSCRIPTION_DELETED");
    assert.equal(result.payment.subscriptionId, "sub_1");
    assert.equal(result.payment.externalReference, "billing-1");
  });

  it("extracts CPF/CNPJ for hashing and masks it in the stored payload", () => {
    const service = makeService(async () => ({ data: {} }));
    const result = service.handleWebhook({
      id: "evt_cpf",
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay_1",
        subscription: "sub_1",
        customer: { cpfCnpj: "123.456.789-09" },
      },
    });

    assert.equal(result.cpfCnpj, "12345678909");
    assert.equal(
      (
        (result.payload.payment as Record<string, unknown>).customer as Record<
          string,
          unknown
        >
      ).cpfCnpj,
      "***.***.***-09",
    );
    assert.doesNotMatch(JSON.stringify(result.payload), /12345678909/);
  });
});
