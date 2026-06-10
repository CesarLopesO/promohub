"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@promohub/ui/button";
import {
  EmptyState,
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type ReferralStatus =
  | "PENDING_SIGNUP"
  | "PENDING_PAYMENT"
  | "PENDING_WAITING_PERIOD"
  | "NEEDS_REVIEW"
  | "ELIGIBLE"
  | "PAID"
  | "REJECTED";

type AdminReferral = {
  id: string;
  status: ReferralStatus;
  rewardCents: number;
  createdAt: string;
  paymentConfirmedAt?: string | null;
  eligibleAt?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  cpfCnpjMasked?: string | null;
  antifraudReason?: string | null;
  referrer: { id: string; email: string; name?: string | null };
  referred: {
    id: string;
    email: string;
    name?: string | null;
    plan: string;
    subscriptionStatus: string;
  };
};

const statusLabels: Record<ReferralStatus, string> = {
  PENDING_SIGNUP: "Aguardando cadastro",
  PENDING_PAYMENT: "Aguardando pagamento",
  PENDING_WAITING_PERIOD: "Período de espera",
  NEEDS_REVIEW: "Revisão necessária",
  ELIGIBLE: "Elegível",
  PAID: "Pago",
  REJECTED: "Rejeitado",
};

export default function AdminReferralsPage() {
  const [referrals, setReferrals] = useState<AdminReferral[] | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadReferrals();
  }, []);

  async function loadReferrals() {
    try {
      setReferrals(await apiFetch<AdminReferral[]>("/admin/referrals"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao carregar indicações.",
      );
    }
  }

  async function markPaid(id: string) {
    setPayingId(id);
    setError(null);

    try {
      await apiFetch(`/admin/referrals/${id}/paid`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      await loadReferrals();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao marcar pagamento.",
      );
    } finally {
      setPayingId(null);
    }
  }

  async function reject(id: string) {
    setRejectingId(id);
    setError(null);

    try {
      await apiFetch(`/admin/referrals/${id}/rejected`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      await loadReferrals();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao rejeitar indicação.",
      );
    } finally {
      setRejectingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Indicações"
        description="Acompanhe elegibilidade e registre pagamentos manuais."
      />

      {error ? (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      ) : null}

      {!referrals ? (
        <LoadingBlock message="Carregando indicações..." />
      ) : referrals.length === 0 ? (
        <EmptyState message="Nenhuma indicação cadastrada." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Indicador</th>
                <th className="px-4 py-3 font-medium">Indicado</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Pagamento confirmado</th>
                <th className="px-4 py-3 font-medium">Elegível em</th>
                <th className="px-4 py-3 font-medium">Pago em</th>
                <th className="px-4 py-3 font-medium">CPF/CNPJ</th>
                <th className="px-4 py-3 font-medium">Antifraude</th>
                <th className="px-4 py-3 font-medium">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {referrals.map((referral) => (
                <tr key={referral.id}>
                  <td className="px-4 py-3 text-slate-700">
                    {referral.referrer.email}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">
                      {referral.referred.email}
                    </p>
                    <p className="text-xs text-slate-500">
                      {referral.referred.plan} ·{" "}
                      {referral.referred.subscriptionStatus}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {statusLabels[referral.status]}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {formatDate(referral.paymentConfirmedAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {formatDate(referral.eligibleAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {formatDate(referral.paidAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {referral.cpfCnpjMasked ?? "-"}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {referral.antifraudReason ?? "-"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {referral.status === "ELIGIBLE" ? (
                        <Button
                          disabled={payingId === referral.id}
                          onClick={() => void markPaid(referral.id)}
                          size="sm"
                          type="button"
                        >
                          <CheckCircle2
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                          {payingId === referral.id
                            ? "Salvando..."
                            : "Marcar como pago"}
                        </Button>
                      ) : null}
                      {referral.status !== "PAID" &&
                      referral.status !== "REJECTED" ? (
                        <Button
                          disabled={rejectingId === referral.id}
                          onClick={() => void reject(referral.id)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {rejectingId === referral.id
                            ? "Salvando..."
                            : "Rejeitar"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatDate(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(value))
    : "-";
}
