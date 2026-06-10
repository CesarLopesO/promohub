"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

import { PageHeader, ErrorBox, LoadingBlock } from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type MonitoringStats = {
  sessions: {
    total: number;
    connected: number;
  };
  messages: {
    total: number;
    withLinks: number;
    images: number;
    lastCapturedAt?: string;
  };
  groups: {
    total: number;
  };
  routes: {
    total: number;
    active: number;
  };
  forwards: {
    total: number;
    sent: number;
    failed: number;
    auto: number;
    manual: number;
    images: number;
    text: number;
    fallbacks: number;
    lastSentAt?: string;
  };
};

type RecentActivity = {
  recentMessages: Array<{ id: string }>;
  recentForwards: Array<{
    id: string;
    status: string;
    mode?: string;
    mediaForwarded: boolean;
  }>;
};

type Credential = {
  id: string;
  marketplace: string;
  isActive: boolean;
};

const numberFormat = new Intl.NumberFormat("pt-BR");

export default function DashboardPage() {
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [activity, setActivity] = useState<RecentActivity | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statsResult, activityResult, credentialResult] = await Promise.all([
          apiFetch<MonitoringStats>("/monitoring/stats"),
          apiFetch<RecentActivity>("/monitoring/recent-activity"),
          apiFetch<Credential[]>("/affiliate/credentials"),
        ]);

        if (!cancelled) {
          setStats(statsResult);
          setActivity(activityResult);
          setCredentials(credentialResult);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erro ao carregar dashboard.",
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

  if (loading) {
    return <LoadingBlock message="Carregando dashboard..." />;
  }

  if (error || !stats) {
    return <ErrorBox message={error ?? "Dashboard indisponivel."} />;
  }

  const autoSent =
    activity?.recentForwards.filter(
      (forward) => forward.mode === "AUTO" && forward.status.includes("SENT"),
    ).length ?? 0;
  const hasCredential = credentials.some((credential) => credential.isActive);
  const onboardingItems = [
    {
      label: "Conectar WhatsApp",
      done: stats.sessions.connected > 0,
      href: "/dashboard/whatsapp",
      action: "Conectar",
    },
    {
      label: "Sincronizar grupos",
      done: stats.groups.total > 0,
      href: "/dashboard/groups",
      action: "Sincronizar",
    },
    {
      label: "Configurar credenciais",
      done: hasCredential,
      href: "/dashboard/credentials",
      action: "Configurar",
    },
    {
      label: "Criar rota origem -> destino",
      done: stats.routes.active > 0,
      href: "/dashboard/groups",
      action: "Criar rota",
    },
    {
      label: "Aguardar primeira promocao",
      done: stats.forwards.sent > 0 || autoSent > 0,
      href: "/dashboard/activity",
      action: "Ver atividade",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Visao geral"
        description="Acompanhe WhatsApp, rotas, mensagens e envios."
      />

      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Configure seu PeppaBot
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Siga os passos abaixo para deixar a automacao pronta.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-500">
            {onboardingItems.filter((item) => item.done).length}/
            {onboardingItems.length} concluido
          </p>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-5">
          {onboardingItems.map((item) => (
            <div
              className="rounded-md border border-slate-200 bg-slate-50 p-4"
              key={item.label}
            >
              <div className="flex items-start gap-2">
                {item.done ? (
                  <CheckCircle2
                    className="mt-0.5 h-5 w-5 text-emerald-600"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="mt-0.5 h-5 w-5 text-amber-500"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-950">
                    {item.label}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.done ? "Concluido" : "Pendente"}
                  </p>
                </div>
              </div>
              <Link
                className="mt-3 inline-flex text-sm font-medium text-slate-950 underline-offset-4 hover:underline"
                href={item.href}
              >
                {item.action}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="WhatsApp conectado" value={stats.sessions.connected} />
        <StatCard label="Rotas ativas" value={stats.routes.active} />
        <StatCard label="Mensagens capturadas" value={stats.messages.total} />
        <StatCard label="Forwards enviados" value={stats.forwards.sent} />
        <StatCard label="Falhas" value={stats.forwards.failed} />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Forwards com imagem" value={stats.forwards.images} />
        <StatCard label="Forwards AUTO recentes" value={autoSent} />
        <StatCard label="Grupos sincronizados" value={stats.groups?.total ?? 0} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">Mensagens</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <Metric label="Com links" value={stats.messages.withLinks} />
            <Metric label="Com imagem" value={stats.messages.images} />
            <Metric
              label="Ultima captura"
              value={formatDate(stats.messages.lastCapturedAt)}
            />
          </dl>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">Forwards</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <Metric label="AUTO" value={stats.forwards.auto} />
            <Metric label="MANUAL" value={stats.forwards.manual} />
            <Metric label="Fallbacks texto" value={stats.forwards.fallbacks} />
            <Metric
              label="Ultimo envio"
              value={formatDate(stats.forwards.lastSentAt)}
            />
          </dl>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">
        {typeof value === "number" ? numberFormat.format(value) : value}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-950">
        {typeof value === "number" ? numberFormat.format(value) : value}
      </dd>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
