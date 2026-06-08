"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, Trash2 } from "lucide-react";

import { Button } from "@promohub/ui/button";
import {
  EmptyState,
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";
import {
  readSessionLabel,
  readSessionLabels,
} from "@/src/lib/session-labels";

type MessageRoute = {
  id: string;
  sessionId: string;
  sourceGroupJid: string;
  destinationGroupJid: string;
  isActive: boolean;
  createdAt: string;
};

type WhatsAppSession = {
  id: string;
  sessionId: string;
  status: "DISCONNECTED" | "CONNECTING" | "QR_READY" | "CONNECTED";
  phoneNumber?: string;
};

type WhatsAppGroup = {
  id: string;
  sessionId: string;
  groupJid: string;
  name: string;
};

export default function RoutesPage() {
  const [routes, setRoutes] = useState<MessageRoute[]>([]);
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [groupsBySession, setGroupsBySession] = useState<
    Record<string, WhatsAppGroup[]>
  >({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groupNameByKey = useMemo(() => {
    const map = new Map<string, string>();

    for (const groups of Object.values(groupsBySession)) {
      for (const group of groups) {
        map.set(`${group.sessionId}:${group.groupJid}`, group.name);
      }
    }

    return map;
  }, [groupsBySession]);

  async function loadRoutes() {
    const result = await apiFetch<MessageRoute[]>("/routes");
    setRoutes(result);
  }

  useEffect(() => {
    let cancelled = false;
    setLabels(readSessionLabels());

    async function load() {
      try {
        const [routeResult, sessionResult] = await Promise.all([
          apiFetch<MessageRoute[]>("/routes"),
          apiFetch<WhatsAppSession[]>("/whatsapp/sessions"),
        ]);
        const groupsResult: Record<string, WhatsAppGroup[]> = {};

        await Promise.all(
          sessionResult
            .filter((session) => session.status === "CONNECTED")
            .map(async (session) => {
              try {
                groupsResult[session.id] = await apiFetch<WhatsAppGroup[]>(
                  `/whatsapp/session/${session.id}/groups`,
                );
              } catch {
                groupsResult[session.id] = [];
              }
            }),
        );

        if (!cancelled) {
          setRoutes(routeResult);
          setSessions(sessionResult);
          setGroupsBySession(groupsResult);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar rotas.");
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

  async function updateRoute(id: string, isActive: boolean) {
    setSavingId(id);
    setError(null);

    try {
      await apiFetch<MessageRoute>(`/routes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      await loadRoutes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar rota.");
    } finally {
      setSavingId(null);
    }
  }

  async function removeRoute(id: string) {
    await updateRoute(id, false);
  }

  return (
    <div>
      <PageHeader
        title="Rotas"
        description="Gerencie automacoes existentes. Crie novas rotas em Grupos."
      />

      {error ? (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      ) : null}

      {loading ? (
        <LoadingBlock message="Carregando automacoes..." />
      ) : routes.length === 0 ? (
        <EmptyState message="Nenhuma automacao ativa. Crie uma rota na pagina Grupos." />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {routes.map((route) => {
            const session = sessions.find(
              (item) => item.sessionId === route.sessionId,
            );

            return (
              <article
                className="rounded-lg border border-slate-200 bg-white p-5"
                key={route.id}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">
                      {readGroupName(
                        groupNameByKey,
                        route.sessionId,
                        route.sourceGroupJid,
                      )}{" "}
                      {" para "}
                      {readGroupName(
                        groupNameByKey,
                        route.sessionId,
                        route.destinationGroupJid,
                      )}
                    </h2>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <Row
                        label="Origem"
                        value={readGroupName(
                          groupNameByKey,
                          route.sessionId,
                          route.sourceGroupJid,
                        )}
                      />
                      <Row
                        label="Destino"
                        value={readGroupName(
                          groupNameByKey,
                          route.sessionId,
                          route.destinationGroupJid,
                        )}
                      />
                      <Row
                        label="WhatsApp"
                        value={
                          session
                            ? readSessionLabel(
                                labels,
                                [session.id, session.sessionId],
                                session.phoneNumber ?? session.sessionId,
                              )
                            : route.sessionId
                        }
                      />
                      <Row label="Status" value={route.isActive ? "Ativa" : "Pausada"} />
                    </dl>
                    <p className="mt-3 font-mono text-xs text-slate-400">
                      {route.sourceGroupJid} {" para "} {route.destinationGroupJid}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {route.isActive ? (
                      <Button
                        disabled={savingId === route.id}
                        onClick={() => updateRoute(route.id, false)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Pause className="h-4 w-4" aria-hidden="true" />
                        Pausar
                      </Button>
                    ) : (
                      <Button
                        disabled={savingId === route.id}
                        onClick={() => updateRoute(route.id, true)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Play className="h-4 w-4" aria-hidden="true" />
                        Retomar
                      </Button>
                    )}
                    <Button
                      disabled={savingId === route.id}
                      onClick={() => removeRoute(route.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Remover
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words text-right font-medium text-slate-950">
        {value}
      </dd>
    </div>
  );
}

function readGroupName(
  groupNameByKey: Map<string, string>,
  sessionId: string,
  groupJid: string,
) {
  return groupNameByKey.get(`${sessionId}:${groupJid}`) ?? groupJid;
}
