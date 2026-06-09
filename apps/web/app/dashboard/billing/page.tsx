"use client";

import { useEffect, useState } from "react";

import { Button } from "@promohub/ui/button";
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
  status: string;
  cpfCnpjMasked?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  providerSubscriptionId?: string;
};

type PlanUsage = {
  plan: PlanId;
  limits: {
    maxWhatsAppSessions: number;
    maxSourceGroups: number | null;
    maxDestinationGroups: number | null;
    adsEnabled: boolean;
  };
  usage: {
    whatsappSessions: number;
    sourceGroups: number;
    destinationGroups: number;
    activeRoutes: number;
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
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setCheckoutPlan(plan);
    setError(null);
    setMessage(null);
    const checkoutWindow = window.open("about:blank", "_blank");

    try {
      const checkout = await apiFetch<CheckoutResponse>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan, cpfCnpj: cpfCnpj.trim() || undefined }),
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
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <SummaryItem label="Plano" value={billing.plan} />
            <SummaryItem
              label="Status"
              value={readSubscriptionStatus(billing.status)}
            />
            <SummaryItem
              label="Assinatura Asaas"
              value={billing.providerSubscriptionId ?? "Nenhuma"}
            />
            <SummaryItem
              label="Próxima renovação"
              value={
                billing.currentPeriodEnd
                  ? formatDate(billing.currentPeriodEnd)
                  : "Aguardando pagamento"
              }
            />
          </dl>
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
            className="mt-2 h-10 w-full max-w-md rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none focus:border-slate-950 focus:ring-1 focus:ring-slate-950"
            id="billing-cpf-cnpj"
            inputMode="numeric"
            onChange={(event) => setCpfCnpj(event.target.value)}
            placeholder="CPF ou CNPJ"
            type="text"
            value={cpfCnpj}
          />
          <p className="mt-2 text-xs text-slate-500">
            {billing?.cpfCnpjMasked
              ? `Documento configurado: ${billing.cpfCnpjMasked}`
              : "Obrigatório para gerar a cobrança no Asaas."}
          </p>
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
