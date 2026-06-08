"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";

import { Button } from "@promohub/ui/button";
import { StatusBadge } from "@/src/components/status-badge";
import {
  EmptyState,
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { ApiError, apiFetch } from "@/src/lib/api";

type WhatsAppSession = {
  id: string;
  sessionId: string;
  status: "DISCONNECTED" | "CONNECTING" | "QR_READY" | "CONNECTED";
  phoneNumber?: string;
  updatedAt?: string;
};

type WhatsAppGroup = {
  id: string;
  sessionId: string;
  groupJid: string;
  name: string;
  participantCount: number;
  isCommunity: boolean;
  updatedAt: string;
};

type GroupSyncResult = {
  sessionId: string;
  syncedCount: number;
  groups: WhatsAppGroup[];
};

type MessageRoute = {
  id: string;
  sessionId: string;
  sourceGroupJid: string;
  destinationGroupJid: string;
  isActive: boolean;
  createdAt: string;
};

type RouteForm = {
  sessionRecordId: string;
  sourceGroupJid: string;
  destinationGroupJid: string;
};

type PlanUsage = {
  plan: "FREE" | "BASIC" | "PRO";
  limits: {
    maxSourceGroups: number | null;
    maxDestinationGroups: number | null;
  };
  usage: {
    sourceGroups: number;
    destinationGroups: number;
  };
};

export default function GroupsPage() {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [routes, setRoutes] = useState<MessageRoute[]>([]);
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [groupsBySession, setGroupsBySession] = useState<
    Record<string, WhatsAppGroup[]>
  >({});
  const [form, setForm] = useState<RouteForm>({
    sessionRecordId: "",
    sourceGroupJid: "",
    destinationGroupJid: "",
  });
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connectedSessions = sessions.filter(
    (session) => session.status === "CONNECTED",
  );
  const selectedSession = connectedSessions.find(
    (session) => session.id === form.sessionRecordId,
  );
  const selectedGroups = selectedSession
    ? groupsBySession[selectedSession.id] ?? []
    : [];
  const routeLimitMessage = readRouteLimitMessage(
    form,
    routes,
    planUsage,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [sessionResult, routeResult, usageResult] = await Promise.all([
          apiFetch<WhatsAppSession[]>("/whatsapp/sessions"),
          apiFetch<MessageRoute[]>("/routes"),
          apiFetch<PlanUsage>("/billing/usage"),
        ]);

        if (!cancelled) {
          setSessions(sessionResult);
          setRoutes(routeResult);
          setPlanUsage(usageResult);
          const firstConnected = sessionResult.find(
            (session) => session.status === "CONNECTED",
          );

          if (firstConnected) {
            setForm((current) => ({
              ...current,
              sessionRecordId: firstConnected.id,
            }));
            await loadGroups(firstConnected.id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar grupos.");
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

  async function loadGroups(sessionRecordId: string) {
    const groups = await apiFetch<WhatsAppGroup[]>(
      `/whatsapp/session/${sessionRecordId}/groups`,
    );
    setGroupsBySession((current) => ({
      ...current,
      [sessionRecordId]: groups,
    }));
  }

  async function syncGroups(sessionRecordId: string) {
    setActionId(sessionRecordId);
    setError(null);

    try {
      const result = await apiFetch<GroupSyncResult>(
        `/whatsapp/session/${sessionRecordId}/groups/sync`,
        {
          method: "POST",
        },
      );
      setGroupsBySession((current) => ({
        ...current,
        [sessionRecordId]: result.groups,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao sincronizar grupos.");
    } finally {
      setActionId(null);
    }
  }

  async function listGroups(sessionRecordId: string) {
    setActionId(sessionRecordId);
    setError(null);

    try {
      await loadGroups(sessionRecordId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao listar grupos.");
    } finally {
      setActionId(null);
    }
  }

  async function createRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSession) {
      setError("Selecione uma sessao conectada.");
      return;
    }

    if (form.sourceGroupJid === form.destinationGroupJid) {
      setError("O grupo de origem e destino não podem ser iguais.");
      return;
    }

    if (
      routes.some(
        (route) =>
          route.isActive &&
          route.sessionId === selectedSession.sessionId &&
          route.sourceGroupJid === form.sourceGroupJid &&
          route.destinationGroupJid === form.destinationGroupJid,
      )
    ) {
      setError("Esta rota já existe.");
      return;
    }

    setActionId("route");
    setError(null);

    try {
      await apiFetch<MessageRoute>("/routes", {
        method: "POST",
        body: JSON.stringify({
          sessionId: selectedSession.sessionId,
          sourceGroupJid: form.sourceGroupJid,
          destinationGroupJid: form.destinationGroupJid,
        }),
      });
      const [routeResult, usageResult] = await Promise.all([
        apiFetch<MessageRoute[]>("/routes"),
        apiFetch<PlanUsage>("/billing/usage"),
      ]);
      setRoutes(routeResult);
      setPlanUsage(usageResult);
      setForm((current) => ({
        ...current,
        sourceGroupJid: "",
        destinationGroupJid: "",
      }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("O grupo de origem e destino não podem ser iguais.");
        return;
      }

      if (err instanceof ApiError && err.status === 403) {
        setError(
          "Limite do plano atingido. Faça upgrade para adicionar mais grupos.",
        );
        return;
      }

      if (err instanceof ApiError && err.status === 409) {
        setError("Esta rota já existe.");
        return;
      }

      setError(err instanceof Error ? err.message : "Erro ao criar rota.");
    } finally {
      setActionId(null);
    }
  }

  function changeSession(sessionRecordId: string) {
    setForm({
      sessionRecordId,
      sourceGroupJid: "",
      destinationGroupJid: "",
    });

    if (sessionRecordId && !groupsBySession[sessionRecordId]) {
      void listGroups(sessionRecordId);
    }
  }

  return (
    <div>
      <PageHeader
        title="Grupos"
        description="Escolha grupos por nome e crie sua automacao."
      />

      {error ? <ErrorBox message={error} /> : null}
      {routeLimitMessage ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {routeLimitMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6">
          <LoadingBlock message="Carregando sessoes e grupos..." />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Use grupos de origem onde chegam promocoes e grupos de destino onde
            o Promohub vai repostar.
          </div>

          <section className="grid gap-3 md:grid-cols-5">
            {[
              "Escolha o WhatsApp",
              "Sincronize grupos",
              "Escolha grupo origem",
              "Escolha grupo destino",
              "Crie a automacao",
            ].map((step, index) => (
              <div
                className="rounded-md border border-slate-200 bg-white p-4"
                key={step}
              >
                <p className="text-xs font-semibold text-slate-500">
                  Passo {index + 1}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-950">
                  {step}
                </p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            {connectedSessions.length === 0 ? (
              <EmptyState message="Nenhuma sessao conectada. Conecte o WhatsApp primeiro." />
            ) : (
              connectedSessions.map((session) => (
                <article
                  className="rounded-lg border border-slate-200 bg-white p-5"
                  key={session.id}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-950">
                        {session.sessionId}
                      </h2>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={session.status} />
                        {session.phoneNumber ? (
                          <span className="text-sm text-slate-600">
                            {session.phoneNumber}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={actionId === session.id}
                        onClick={() => syncGroups(session.id)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Sincronizar
                      </Button>
                      <Button
                        disabled={actionId === session.id}
                        onClick={() => listGroups(session.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Ver grupos
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </section>

          <form
            className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 lg:grid-cols-4"
            onSubmit={createRoute}
          >
            <label className="block text-sm font-medium text-slate-700">
              Sessao
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                onChange={(event) => changeSession(event.target.value)}
                required
                value={form.sessionRecordId}
              >
                <option value="">Selecione</option>
                {connectedSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.phoneNumber ?? session.sessionId}
                  </option>
                ))}
              </select>
            </label>
            <GroupSelect
              groups={selectedGroups}
              label="Grupo origem"
              onChange={(value) =>
                setForm((current) => ({ ...current, sourceGroupJid: value }))
              }
              value={form.sourceGroupJid}
            />
            <GroupSelect
              groups={selectedGroups}
              label="Grupo destino"
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  destinationGroupJid: value,
                }))
              }
              value={form.destinationGroupJid}
            />
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={
                  actionId === "route" ||
                  selectedGroups.length === 0 ||
                  Boolean(routeLimitMessage)
                }
                type="submit"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {actionId === "route" ? "Criando..." : "Criar rota"}
              </Button>
            </div>
          </form>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-950">
              Grupos sincronizados
            </h2>
            <GroupsTable groupsBySession={groupsBySession} sessions={sessions} />
          </section>
        </div>
      )}
    </div>
  );
}

function readRouteLimitMessage(
  form: RouteForm,
  routes: MessageRoute[],
  planUsage: PlanUsage | null,
): string | null {
  if (!planUsage || !form.sourceGroupJid || !form.destinationGroupJid) {
    return null;
  }

  const sourceExists = routes.some(
    (route) => route.isActive && route.sourceGroupJid === form.sourceGroupJid,
  );
  const destinationExists = routes.some(
    (route) =>
      route.isActive && route.destinationGroupJid === form.destinationGroupJid,
  );
  const nextSourceGroups =
    planUsage.usage.sourceGroups + (sourceExists ? 0 : 1);
  const nextDestinationGroups =
    planUsage.usage.destinationGroups + (destinationExists ? 0 : 1);

  if (
    planUsage.limits.maxSourceGroups !== null &&
    nextSourceGroups > planUsage.limits.maxSourceGroups
  ) {
    return `Seu plano ${planUsage.plan} permite ${planUsage.limits.maxSourceGroups} grupos origem. Faça upgrade para adicionar outro grupo origem.`;
  }

  if (
    planUsage.limits.maxDestinationGroups !== null &&
    nextDestinationGroups > planUsage.limits.maxDestinationGroups
  ) {
    return `Seu plano ${planUsage.plan} permite ${planUsage.limits.maxDestinationGroups} grupo destino. Faça upgrade para adicionar outro grupo destino.`;
  }

  return null;
}

function GroupSelect({
  label,
  groups,
  value,
  onChange,
}: {
  label: string;
  groups: WhatsAppGroup[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
        disabled={groups.length === 0}
        onChange={(event) => onChange(event.target.value)}
        required
        value={value}
      >
        <option value="">Selecione</option>
        {groups.map((group) => (
          <option key={group.id} value={group.groupJid}>
            {group.name} - {group.groupJid}
          </option>
        ))}
      </select>
    </label>
  );
}

function GroupsTable({
  groupsBySession,
  sessions,
}: {
  groupsBySession: Record<string, WhatsAppGroup[]>;
  sessions: WhatsAppSession[];
}) {
  const rows = sessions.flatMap((session) =>
    (groupsBySession[session.id] ?? []).map((group) => ({
      session,
      group,
    })),
  );

  if (rows.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState message="Nenhum grupo carregado. Sincronize ou liste grupos de uma sessao conectada." />
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="bg-slate-100 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">JID</th>
            <th className="px-4 py-3">Participantes</th>
            <th className="px-4 py-3">Comunidade?</th>
            <th className="px-4 py-3">Sessao</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {rows.map(({ session, group }) => (
            <tr key={group.id}>
              <td className="px-4 py-3 font-medium text-slate-950">
                {group.name}
              </td>
              <td className="px-4 py-3 font-mono text-xs">{group.groupJid}</td>
              <td className="px-4 py-3">{group.participantCount}</td>
              <td className="px-4 py-3">{group.isCommunity ? "Sim" : "Nao"}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {session.sessionId}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
