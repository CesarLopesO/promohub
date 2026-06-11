import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Plan } from "@prisma/client";
import axios, { AxiosInstance } from "axios";

export type AsaasUser = {
  id: string;
  name: string | null;
  email: string;
  cpfCnpj: string;
};

type AsaasCustomer = {
  id: string;
  cpfCnpj?: string | null;
};

type AsaasCustomersResponse = {
  data?: AsaasCustomer[];
};

type AsaasSubscription = {
  id: string;
  status?: string;
};

type AsaasCheckout = {
  id: string;
};

type AsaasPayment = {
  id: string;
  invoiceUrl?: string;
  status?: string;
  subscription?: string;
  externalReference?: string;
};

type AsaasPaymentsResponse = {
  data?: AsaasPayment[];
};

type PaidPlan = Extract<Plan, "BASIC" | "PRO">;

export type AsaasCheckoutResult = {
  customerId: string;
  subscriptionId?: string;
  paymentId?: string;
  checkoutUrl: string;
  status: string;
};

export type AsaasWebhook = {
  eventId: string;
  eventType: string;
  cpfCnpj?: string;
  payment: {
    id?: string;
    subscriptionId?: string;
    externalReference?: string;
    dueDate?: string;
  };
  payload: Record<string, unknown>;
};

@Injectable()
export class AsaasService {
  private readonly client: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    const baseURL = this.config
      .get<string>("ASAAS_BASE_URL", "https://sandbox.asaas.com/api/v3")
      .replace(/\/$/, "");

    this.client = axios.create({
      baseURL,
      timeout: 15_000,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
  }

  async createOrGetCustomer(
    user: AsaasUser,
    existingCustomerId?: string | null,
  ): Promise<string> {
    if (existingCustomerId?.trim()) {
      const customerId = existingCustomerId.trim();
      const customer = await this.request<AsaasCustomer>(
        "get",
        `/customers/${encodeURIComponent(customerId)}`,
      );
      await this.ensureCustomerCpfCnpj(customerId, customer.cpfCnpj, user);
      console.log("[ASAAS] customer found/created");
      return customerId;
    }

    const customers = await this.request<AsaasCustomersResponse>(
      "get",
      "/customers",
      undefined,
      { externalReference: user.id, limit: 1 },
    );
    const existingCustomer = customers.data?.[0];

    if (existingCustomer?.id) {
      await this.ensureCustomerCpfCnpj(
        existingCustomer.id,
        existingCustomer.cpfCnpj,
        user,
      );
      console.log("[ASAAS] customer found/created");
      return existingCustomer.id;
    }

    console.log("[ASAAS] creating customer");
    const response = await this.request<AsaasCustomer>("post", "/customers", {
      name: user.name?.trim() || user.email,
      email: user.email,
      cpfCnpj: user.cpfCnpj,
      externalReference: user.id,
      notificationDisabled: false,
    });

    if (!response.id) {
      throw new BadGatewayException("Asaas did not return a customer ID.");
    }

    console.log("[ASAAS] customer found/created");
    return response.id;
  }

  private async ensureCustomerCpfCnpj(
    customerId: string,
    currentCpfCnpj: string | null | undefined,
    user: AsaasUser,
  ): Promise<void> {
    if (currentCpfCnpj?.replace(/\D/g, "") === user.cpfCnpj) {
      return;
    }

    await this.request("put", `/customers/${encodeURIComponent(customerId)}`, {
      cpfCnpj: user.cpfCnpj,
    });
  }

  async createSubscription(
    user: AsaasUser,
    plan: PaidPlan,
    priceCents: number,
    localSubscriptionId: string,
    existingCustomerId?: string | null,
  ): Promise<AsaasCheckoutResult> {
    const customerId = await this.createOrGetCustomer(user, existingCustomerId);
    const subscriptionPayload = {
      customer: customerId,
      billingType: "UNDEFINED",
      value: priceCents / 100,
      nextDueDate: this.today(),
      cycle: "MONTHLY",
      description: `PeppaBot ${plan}`,
      externalReference: localSubscriptionId,
    };

    console.log("[ASAAS] creating subscription");
    console.log(
      `[ASAAS] subscription payload=${this.serializeForLog(subscriptionPayload)}`,
    );
    const subscription = await this.request<AsaasSubscription>(
      "post",
      "/subscriptions",
      subscriptionPayload,
    );

    if (!subscription.id) {
      throw new BadGatewayException("Asaas did not return a subscription ID.");
    }

    const payments = await this.request<AsaasPaymentsResponse>(
      "get",
      `/subscriptions/${encodeURIComponent(subscription.id)}/payments`,
    );
    const payment = payments.data?.[0];

    if (!payment?.id || !payment.invoiceUrl) {
      throw new BadGatewayException(
        "Asaas did not return the first subscription invoice.",
      );
    }

    return {
      customerId,
      subscriptionId: subscription.id,
      paymentId: payment.id,
      checkoutUrl: payment.invoiceUrl,
      status: payment.status ?? subscription.status ?? "PENDING",
    };
  }

  async createRecurringCardCheckout(
    user: AsaasUser,
    plan: PaidPlan,
    priceCents: number,
    localSubscriptionId: string,
    existingCustomerId?: string | null,
  ): Promise<AsaasCheckoutResult> {
    const customerId = await this.createOrGetCustomer(user, existingCustomerId);
    const webUrl = this.config
      .get<string>("WEB_URL", "http://localhost:3000")
      .replace(/\/$/, "");
    const returnUrl = `${webUrl}/dashboard/billing`;
    const checkoutPayload = {
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 100,
      externalReference: localSubscriptionId,
      callback: {
        cancelUrl: returnUrl,
        expiredUrl: returnUrl,
        successUrl: returnUrl,
      },
      items: [
        {
          name: `PeppaBot ${plan}`,
          description: `PeppaBot ${plan}`,
          quantity: 1,
          value: priceCents / 100,
        },
      ],
      customer: customerId,
      subscription: {
        cycle: "MONTHLY",
        nextDueDate: this.today(),
      },
    };

    console.log("[ASAAS] creating recurring credit card checkout");
    console.log(
      `[ASAAS] checkout payload=${this.serializeForLog(checkoutPayload)}`,
    );
    const checkout = await this.request<AsaasCheckout>(
      "post",
      "/checkouts",
      checkoutPayload,
    );

    if (!checkout.id) {
      throw new BadGatewayException("Asaas did not return a checkout ID.");
    }

    const checkoutBaseUrl = this.config
      .get<string>("ASAAS_CHECKOUT_BASE_URL", "https://asaas.com")
      .replace(/\/$/, "");

    return {
      customerId,
      checkoutUrl: `${checkoutBaseUrl}/checkoutSession/show?id=${encodeURIComponent(checkout.id)}`,
      status: "PENDING",
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    if (!subscriptionId.trim()) {
      throw new BadRequestException("Asaas subscription ID is required.");
    }

    await this.request(
      "delete",
      `/subscriptions/${encodeURIComponent(subscriptionId.trim())}`,
    );
  }

  handleWebhook(payload: unknown): AsaasWebhook {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new BadRequestException("Invalid Asaas webhook payload.");
    }

    const value = payload as Record<string, unknown>;
    const eventId = this.readString(value.id);
    const eventType = this.readString(value.event);
    const payment =
      value.payment && typeof value.payment === "object"
        ? (value.payment as Record<string, unknown>)
        : {};
    const paymentCustomer =
      payment.customer &&
      typeof payment.customer === "object" &&
      !Array.isArray(payment.customer)
        ? (payment.customer as Record<string, unknown>)
        : {};
    const customer =
      value.customer &&
      typeof value.customer === "object" &&
      !Array.isArray(value.customer)
        ? (value.customer as Record<string, unknown>)
        : {};
    const cpfCnpj =
      this.readCpfCnpj(payment.cpfCnpj) ??
      this.readCpfCnpj(paymentCustomer.cpfCnpj) ??
      this.readCpfCnpj(customer.cpfCnpj);

    if (!eventId || !eventType) {
      throw new BadRequestException("Asaas webhook must contain id and event.");
    }

    return {
      eventId,
      eventType,
      ...(cpfCnpj ? { cpfCnpj } : {}),
      payment: {
        id: this.readString(payment.id),
        subscriptionId: this.readString(payment.subscription),
        externalReference: this.readString(payment.externalReference),
        ...(this.readString(payment.dueDate)
          ? { dueDate: this.readString(payment.dueDate) }
          : {}),
      },
      payload: this.sanitize(value) as Record<string, unknown>,
    };
  }

  private async request<T>(
    method: "delete" | "get" | "post" | "put",
    url: string,
    data?: unknown,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const apiKey = this.config.get<string>("ASAAS_API_KEY")?.trim();

    if (!apiKey) {
      throw new ServiceUnavailableException(
        "Asaas integration is not configured.",
      );
    }

    try {
      const response = await this.client.request<T>({
        method,
        url,
        data,
        params,
        headers: {
          access_token: apiKey,
        },
      });

      return response.data;
    } catch (error) {
      const requestError = error as {
        response?: { status?: number; data?: unknown };
        config?: { method?: string; url?: string };
      };
      const asaasStatus = requestError.response?.status;
      const asaasError = this.sanitize(requestError.response?.data, apiKey);
      const asaasPath = this.sanitizeString(
        requestError.config?.url ?? url,
        apiKey,
      );
      const requestMethod = requestError.config?.method ?? method;

      console.error(
        `[ASAAS] request failed method=${requestMethod.toUpperCase()} url=${asaasPath} status=${asaasStatus ?? "unknown"} data=${this.serializeForLog(asaasError, apiKey)}`,
      );

      if (process.env.NODE_ENV !== "production") {
        throw new HttpException(
          {
            message: "Asaas request failed.",
            asaasStatus,
            asaasError,
            asaasPath,
          },
          HttpStatus.BAD_GATEWAY,
        );
      }

      throw new BadGatewayException("Asaas request failed.");
    }
  }

  private sanitize(value: unknown, secret?: string): unknown {
    if (typeof value === "string") {
      return this.sanitizeString(value, secret);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item, secret));
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        key.toLowerCase() === "access_token"
          ? "[REDACTED]"
          : key.toLowerCase() === "cpfcnpj" && typeof item === "string"
            ? this.maskCpfCnpj(item)
            : this.sanitize(item, secret),
      ]),
    );
  }

  private sanitizeString(value: string, secret?: string): string {
    const withoutTokenParam = value.replace(
      /([?&]access_token=)[^&\s]*/gi,
      "$1[REDACTED]",
    );

    return secret
      ? withoutTokenParam.split(secret).join("[REDACTED]")
      : withoutTokenParam;
  }

  private serializeForLog(value: unknown, secret?: string): string {
    const serialized = JSON.stringify(this.sanitize(value, secret));
    return serialized ?? String(value);
  }

  private maskCpfCnpj(value: string): string {
    const digits = value.replace(/\D/g, "");

    if (digits.length === 11) {
      return `***.***.***-${digits.slice(-2)}`;
    }

    if (digits.length === 14) {
      return `**.***.***/****-${digits.slice(-2)}`;
    }

    return value;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private readString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private readCpfCnpj(value: unknown): string | undefined {
    if (typeof value !== "string") {
      return undefined;
    }

    const digits = value.replace(/\D/g, "");
    return digits.length === 11 || digits.length === 14 ? digits : undefined;
  }
}
