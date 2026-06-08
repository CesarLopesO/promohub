"use client";

import { useEffect, useState } from "react";

import {
  PageHeader,
  EmptyState,
  ErrorBox,
  LoadingBlock,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type RecentActivity = {
  recentMessages: Array<{
    id: string;
    sessionId: string;
    groupJid: string;
    messageType: string;
    text?: string;
    links: string[];
    marketplaces: string[];
    createdAt: string;
  }>;
  recentForwards: Array<{
    id: string;
    sourceMessageId: string;
    destinationGroupJid: string;
    status: string;
    mode?: string;
    sentMessageType?: string;
    mediaForwarded: boolean;
    createdAt: string;
  }>;
};

type ForwardError = {
  id: string;
  sourceMessageId: string;
  destinationGroupJid: string;
  error?: string;
  createdAt: string;
};

export default function ActivityPage() {
  const [activity, setActivity] = useState<RecentActivity | null>(null);
  const [errors, setErrors] = useState<ForwardError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [activityResult, errorResult] = await Promise.all([
          apiFetch<RecentActivity>("/monitoring/recent-activity"),
          apiFetch<ForwardError[]>("/monitoring/forward-errors"),
        ]);

        if (!cancelled) {
          setActivity(activityResult);
          setErrors(errorResult);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erro ao carregar atividade.",
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
    return <LoadingBlock message="Carregando atividade..." />;
  }

  if (error || !activity) {
    return <ErrorBox message={error ?? "Atividade indisponivel."} />;
  }

  return (
    <div>
      <PageHeader
        title="Atividade"
        description="Mensagens capturadas, forwards recentes e erros."
      />

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Ultimas mensagens capturadas">
          {activity.recentMessages.length === 0 ? (
            <EmptyState message="Nenhuma mensagem capturada." />
          ) : (
            <div className="space-y-3">
              {activity.recentMessages.map((message) => (
                <article
                  className="rounded-md border border-slate-200 p-4"
                  key={message.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs text-slate-500">
                      {message.groupJid}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(message.createdAt)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm font-medium text-slate-950">
                    {message.messageType}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {message.text ?? "Sem texto"}
                  </p>
                  <Tags values={[...message.marketplaces, ...message.links]} />
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Ultimos forwards">
          {activity.recentForwards.length === 0 ? (
            <EmptyState message="Nenhum forward enviado." />
          ) : (
            <div className="space-y-3">
              {activity.recentForwards.map((forward) => (
                <article
                  className="rounded-md border border-slate-200 p-4"
                  key={forward.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs text-slate-500">
                      {forward.destinationGroupJid}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(forward.createdAt)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge>{forward.status}</Badge>
                    {forward.mode ? <Badge>{forward.mode}</Badge> : null}
                    {forward.mediaForwarded ? <Badge>imagem</Badge> : null}
                    {forward.sentMessageType ? (
                      <Badge>{forward.sentMessageType}</Badge>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>

      <section className="mt-6">
        <Panel title="Erros recentes">
          {errors.length === 0 ? (
            <EmptyState message="Nenhum erro recente." />
          ) : (
            <div className="space-y-3">
              {errors.map((item) => (
                <article
                  className="rounded-md border border-red-200 bg-red-50 p-4 text-sm"
                  key={item.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs text-red-700">
                      {item.destinationGroupJid}
                    </p>
                    <p className="text-xs text-red-700">
                      {formatDate(item.createdAt)}
                    </p>
                  </div>
                  <p className="mt-2 text-red-800">
                    {item.error ?? "Falha sem detalhe."}
                  </p>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </section>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-950">{title}</h2>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700">
      {children}
    </span>
  );
}

function Tags({ values }: { values: string[] }) {
  const filtered = values.filter(Boolean).slice(0, 6);

  if (filtered.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
      {filtered.map((value) => (
        <Badge key={value}>{value}</Badge>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
