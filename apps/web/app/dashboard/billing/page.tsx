"use client";

import { useEffect, useState } from "react";

import { Button } from "@promohub/ui/button";
import {
  BillingPaymentMethodSelector,
  type BillingPaymentMethod,
} from "@/src/components/billing-payment-method";
import { ErrorBox, LoadingBlock, PageHeader } from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type PlanId = "FREE" | "BASIC" | "PRO";

type BillingPlan = {
  id: PlanId;
  name: string;
  priceCents: number;
  currency: "BRL";
  interval: "month";
  description: string;
  features: string[];
};

type BillingSubscription = {
  plan: PlanId;
  paymentMethod?: BillingPaymentMethod;
  status: string;
  cpfCnpjMasked?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  canceledAt?: string;
  cancelAtPeriodEnd: boolean;
};

type PlanUsage = {
  plan: PlanId;
  limits: {
    maxWhatsAppSessions: number;
    maxSourceGroups: number | null;
    maxDestinationGroups: number | null;
    adsEnabled: boolean;
    dailyForwardLimit: number | null;
  };
  usage: {
    whatsappSessions: number;
    sourceGroups: number;
    destinationGroups: number;
    activeRoutes: number;
    forwardsToday: number;
    dailyForwardRemaining: number | null;
  };
};

type CheckoutResponse = {
  plan: PlanId;
  checkoutUrl: string;
  subscriptionId: string;
  status: string;
};

export default function BillingPage() {
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [billing, setBilling] = useState<BillingSubscription | null>(null);
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<BillingPaymentMethod>("FLEXIBLE");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [cpfCnpjError, setCpfCnpjError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [plansResult, billingResult, usageResult] = await Promise.all([
          apiFetch<BillingPlan[]>("/billing/plans"),
          apiFetch<BillingSubscription>("/billing/subscription"),
          apiFetch<PlanUsage>("/billing/usage"),
        ]);

        if (!cancelled) {
          setPlans(plansResult);
          setBilling(billingResult);
          setUsage(usageResult);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erro ao carregar plano.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function startCheckout(plan: PlanId) {
    const cpfCnpjDigits = cpfCnpj.replace(/\D/g, "");

    if (cpfCnpjDigits.length !== 11 && cpfCnpjDigits.length !== 14) {
      setCpfCnpjError("Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos.");
      setError(null);
      setMessage(null);
      return;
    }

    setCheckoutPlan(plan);
    setError(null);
    setCpfCnpjError(null);
    setMessage(null);
    const checkoutWindow = window.open("about:blank", "_blank");

    try {
      const checkout = await apiFetch<CheckoutResponse>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({
          plan,
          cpfCnpj: cpfCnpjDigits,
          paymentMethod,
        }),
      });
      const billingResult = await apiFetch<BillingSubscription>(
        "/billing/subscription",
      );
      const usageResult = await apiFetch<PlanUsage>("/billing/usage");

      setBilling(billingResult);
      setUsage(usageResult);

      if (checkoutWindow) {
        checkoutWindow.location.href = checkout.checkoutUrl;
      } else {
        window.open(checkout.checkoutUrl, "_blank", "noopener,noreferrer");
      }

      setMessage(`Cobrança do plano ${checkout.plan} aberta em uma nova aba.`);
    } catch (err) {
      checkoutWindow?.close();
      setError(
        err instanceof Error ? err.message : "Erro ao iniciar checkout.",
      );
    } finally {
      setCheckoutPlan(null);
    }
  }

  async function cancelSubscription() {
    setCanceling(true);
    setError(null);
    setMessage(null);

    try {
      const result = await apiFetch<BillingSubscription>(
        "/billing/subscription",
        { method: "DELETE" },
      );
      setBilling(result);
      setShowCancelModal(false);
      setMessage(
        result.currentPeriodEnd
          ? `Cancelamento agendado. Acesso até ${formatDateOnly(result.currentPeriodEnd)}.`
          : "Cancelamento agendado.",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao cancelar assinatura.",
      );
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Plano"
        description="Assinatura mensal recorrente por Pix ou cartão."
      />

      {error ? (
        <div className="mb-6">
          <ErrorBox message={error} />
        </div>
      ) : null}

      {message ? (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {message}
        </div>
      ) : null}

      {billing ? (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">
            Assinatura atual
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
            <SummaryItem label="Plano" value={billing.plan} />
            <SummaryItem
              label="Status"
              value={readSubscriptionStatus(billing.status)}
            />
            <SummaryItem
              label="Método de pagamento"
              value={readPaymentMethod(billing.paymentMethod)}
            />
            <SummaryItem
              label="Próxima renovação"
              value={
                billing.currentPeriodEnd
                  ? formatDate(billing.currentPeriodEnd)
                  : "Aguardando pagamento"
              }
            />
            {billing.canceledAt ? (
              <SummaryItem
                label="Data de cancelamento"
                value={formatDate(billing.canceledAt)}
              />
            ) : null}
          </dl>
          {billing.cancelAtPeriodEnd && billing.currentPeriodEnd ? (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Cancelamento agendado. Acesso até{" "}
              {formatDateOnly(billing.currentPeriodEnd)}.
            </div>
          ) : null}
        </section>
      ) : null}

      {usage ? (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">
            Uso do plano
          </h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
            <SummaryItem
              label="WhatsApps"
              value={`${usage.usage.whatsappSessions} / ${formatLimit(
                usage.limits.maxWhatsAppSessions,
              )}`}
            />
            <SummaryItem
              label="Grupos origem"
              value={`${usage.usage.sourceGroups} / ${formatLimit(
                usage.limits.maxSourceGroups,
              )}`}
            />
            <SummaryItem
              label="Grupos destino"
              value={`${usage.usage.destinationGroups} / ${formatLimit(
                usage.limits.maxDestinationGroups,
              )}`}
            />
            <SummaryItem
              label="Rotas ativas"
              value={String(usage.usage.activeRoutes)}
            />
            <SummaryItem
              label="Propaganda"
              value={usage.limits.adsEnabled ? "Ativa" : "Inativa"}
            />
          </dl>
        </section>
      ) : null}

      {!loading ? (
        <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
          <label
            className="block text-sm font-medium text-slate-950"
            htmlFor="billing-cpf-cnpj"
          >
            CPF/CNPJ para cobrança
          </label>
          <input
            autoComplete="off"
            aria-invalid={Boolean(cpfCnpjError)}
            aria-describedby="billing-cpf-cnpj-help"
            className={`mt-2 h-10 w-full max-w-md rounded-md border bg-white px-3 text-sm text-slate-950 outline-none focus:ring-1 ${
              cpfCnpjError
                ? "border-red-300 focus:border-red-600 focus:ring-red-600"
                : "border-slate-300 focus:border-slate-950 focus:ring-slate-950"
            }`}
            id="billing-cpf-cnpj"
            inputMode="numeric"
            onChange={(event) => {
              setCpfCnpj(event.target.value);
              setCpfCnpjError(null);
            }}
            placeholder="123.456.789-09 ou 12.345.678/0001-99"
            required
            type="text"
            value={cpfCnpj}
          />
          <p className="mt-2 text-xs text-slate-500" id="billing-cpf-cnpj-help">
            {billing?.cpfCnpjMasked
              ? `Documento configurado: ${billing.cpfCnpjMasked}`
              : "Necessário para gerar a cobrança no Asaas."}
          </p>
          {cpfCnpjError ? (
            <p className="mt-2 text-sm text-red-700">{cpfCnpjError}</p>
          ) : null}
          <div className="mt-5 max-w-2xl">
            <BillingPaymentMethodSelector
              value={paymentMethod}
              onChange={setPaymentMethod}
            />
          </div>
        </section>
      ) : null}

      {loading ? (
        <LoadingBlock message="Carregando planos..." />
      ) : (
        <section className="grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const current = billing?.plan === plan.id;
            const isFree = plan.id === "FREE";

            return (
              <article
                className={`rounded-lg border bg-white p-6 ${
                  plan.id === "PRO" ? "border-purple-300" : "border-slate-200"
                }`}
                key={plan.id}
              >
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    {plan.name}
                  </h2>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">
                    {formatPrice(plan.priceCents)}
                  </p>
                  <p className="mt-3 text-sm text-slate-600">
                    {plan.description}
                  </p>
                </div>

                <ul className="mt-6 space-y-3 text-sm text-slate-700">
                  {plan.features.map((feature) => (
                    <li className="flex gap-2" key={feature}>
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  className="mt-6 w-full"
                  disabled={current || isFree || checkoutPlan === plan.id}
                  onClick={() => startCheckout(plan.id)}
                  type="button"
                  variant={current ? "secondary" : "default"}
                >
                  {readButtonLabel(plan.id, current, checkoutPlan === plan.id)}
                </Button>
              </article>
            );
          })}
        </section>
      )}

      {billing ? (
        <details className="group mt-6 rounded-lg border border-slate-200 bg-white">
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-950">
            <span className="flex items-center justify-between gap-4">
              Gerenciar assinatura
              <span
                aria-hidden="true"
                className="text-slate-400 transition-transform group-open:rotate-180"
              >
                ▼
              </span>
            </span>
          </summary>
          <div className="border-t border-slate-200 px-5 py-5">
            <div className="grid gap-6 md:grid-cols-2">
              <section>
                <h3 className="text-sm font-semibold text-slate-950">
                  Histórico
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {billing.currentPeriodStart
                    ? `Período atual iniciado em ${formatDateOnly(
                        billing.currentPeriodStart,
                      )}.`
                    : "Nenhum período de assinatura registrado."}
                </p>
                {billing.canceledAt ? (
                  <p className="mt-1 text-sm text-slate-600">
                    Renovação cancelada em{" "}
                    {formatDateOnly(billing.canceledAt)}.
                  </p>
                ) : null}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-slate-950">
                  Informações do plano
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Plano {billing.plan} ·{" "}
                  {readSubscriptionStatus(billing.status)}
                  {billing.currentPeriodEnd
                    ? ` · Renovação em ${formatDateOnly(
                        billing.currentPeriodEnd,
                      )}`
                    : ""}
                </p>
              </section>
            </div>

            {billing.plan !== "FREE" &&
            billing.status === "ACTIVE" &&
            !billing.cancelAtPeriodEnd ? (
              <section className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-950">
                  Cancelar renovação automática
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Você continuará com acesso ao plano até o fim do período já
                  pago.
                </p>
                <Button
                  className="mt-3"
                  onClick={() => setShowCancelModal(true)}
                  type="button"
                  variant="outline"
                >
                  Cancelar renovação automática
                </Button>
              </section>
            ) : null}
          </div>
        </details>
      ) : null}

      {showCancelModal && billing?.currentPeriodEnd ? (
        <div
          aria-labelledby="cancel-subscription-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
          role="dialog"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2
              className="text-lg font-semibold text-slate-950"
              id="cancel-subscription-title"
            >
              Cancelar renovação automática
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Você manterá acesso ao plano até{" "}
              {formatDateOnly(billing.currentPeriodEnd)}. Após isso, sua conta
              voltará para o plano FREE.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button
                disabled={canceling}
                onClick={() => setShowCancelModal(false)}
                type="button"
                variant="secondary"
              >
                Voltar
              </Button>
              <Button
                disabled={canceling}
                onClick={() => void cancelSubscription()}
                type="button"
              >
                {canceling
                  ? "Cancelando..."
                  : "Confirmar cancelamento da renovação"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 font-medium text-slate-950">{value}</dd>
    </div>
  );
}

function formatPrice(priceCents: number): string {
  if (priceCents === 0) {
    return "R$0";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(priceCents / 100);
}

function formatLimit(value: number | null): string {
  return value === null ? "ilimitado" : String(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateOnly(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}

function readButtonLabel(
  plan: PlanId,
  current: boolean,
  loading: boolean,
): string {
  if (current) {
    return "Plano atual";
  }

  if (plan === "FREE") {
    return "Incluido";
  }

  return loading ? "Criando cobrança..." : `Upgrade ${plan}`;
}

function readSubscriptionStatus(status: string): string {
  const labels: Record<string, string> = {
    NONE: "Sem assinatura",
    PENDING: "Checkout pendente",
    ACTIVE: "Ativa",
    PAST_DUE: "Pagamento pendente",
    OVERDUE: "Pagamento pendente",
    CANCELED: "Cancelada",
  };

  return labels[status] ?? status;
}

function readPaymentMethod(paymentMethod?: BillingPaymentMethod): string {
  const labels: Record<BillingPaymentMethod, string> = {
    FLEXIBLE: "Pix, boleto ou cartão",
    CREDIT_CARD_RECURRING: "Cartão recorrente",
  };

  return paymentMethod ? labels[paymentMethod] : "Não informado";
}
