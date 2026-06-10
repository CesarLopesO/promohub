"use client";

import Link from "next/link";
import { Check, Copy, Gift, LifeBuoy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@promohub/ui/button";
import { ErrorBox, LoadingBlock, PageHeader } from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type ReferralDashboard = {
  code: string;
  rewardCents: number;
  totalReferred: number;
  totalEligible: number;
  totalPaid: number;
  eligibleBalanceCents: number;
};

export default function ReferralsPage() {
  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);

    void apiFetch<ReferralDashboard>("/referrals/me")
      .then(setDashboard)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Erro ao carregar indicações.",
        ),
      );
  }, []);

  const referralLink = useMemo(() => {
    if (!dashboard || !origin) {
      return "";
    }

    return `${origin}/register?ref=${encodeURIComponent(dashboard.code)}`;
  }, [dashboard, origin]);

  async function copyLink() {
    if (!referralLink) {
      return;
    }

    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <PageHeader
        title="Indique e Ganhe"
        description="Indique o PeppaBot para outros administradores de grupos."
      />

      <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">
        Quando o indicado assinar e permanecer ativo por 7 dias, você recebe R$
        30.
      </div>

      {error ? <ErrorBox message={error} /> : null}
      {!error && !dashboard ? (
        <LoadingBlock message="Carregando seu programa de indicação..." />
      ) : null}

      {dashboard ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Gift className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-950">
                  Seu link de indicação
                </h2>
                <p className="text-sm text-slate-500">
                  Compartilhe este link com novos usuários.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <input
                aria-label="Link de indicação"
                className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700"
                readOnly
                value={referralLink}
              />
              <Button onClick={() => void copyLink()} type="button">
                {copied ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          </section>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total de indicados"
              value={dashboard.totalReferred.toString()}
            />
            <MetricCard
              label="Total elegíveis"
              value={dashboard.totalEligible.toString()}
            />
            <MetricCard
              label="Total pagos"
              value={dashboard.totalPaid.toString()}
            />
            <MetricCard
              label="Saldo elegível"
              value={formatMoney(dashboard.eligibleBalanceCents)}
            />
          </section>

          <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-950">
              Como receber seu saldo
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              O pagamento é manual. Quando houver saldo elegível, entre em
              contato com o suporte PeppaBot.
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/support">
                <LifeBuoy className="h-4 w-4" aria-hidden="true" />
                Falar com o suporte
              </Link>
            </Button>
          </section>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </article>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
