"use client";

import { useEffect, useState } from "react";

import {
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type AdminOverview = {
  users: { total: number; free: number; basic: number; pro: number };
  sessions: { total: number; connected: number; disconnected: number };
  routes: { total: number; active: number };
  messages: { total: number; withLinks: number; images: number };
  forwards: { total: number; sent: number; failed: number };
  subscriptions: { total: number; pending: number; active: number };
};

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await apiFetch<AdminOverview>("/admin/overview");

        if (!cancelled) {
          setOverview(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar admin.");
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

  if (loading) {
    return <LoadingBlock message="Carregando visão geral..." />;
  }

  if (error || !overview) {
    return <ErrorBox message={error ?? "Admin indisponível."} />;
  }

  const cards = [
    { label: "Usuários", value: overview.users.total },
    { label: "FREE / BASIC / PRO", value: `${overview.users.free} / ${overview.users.basic} / ${overview.users.pro}` },
    { label: "Sessões conectadas", value: overview.sessions.connected },
    { label: "Rotas ativas", value: overview.routes.active },
    { label: "Mensagens", value: overview.messages.total },
    { label: "Forwards", value: overview.forwards.total },
    { label: "Falhas", value: overview.forwards.failed },
    { label: "Assinaturas ativas", value: overview.subscriptions.active },
    { label: "Assinaturas pendentes", value: overview.subscriptions.pending },
  ];

  return (
    <div>
      <PageHeader
        title="Admin"
        description="Visão operacional de usuários, WhatsApp, rotas e billing."
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <article
            className="rounded-lg border border-slate-200 bg-white p-5"
            key={card.label}
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {card.value}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
