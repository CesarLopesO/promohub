"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { QrCode, RefreshCw, Trash2, Users } from "lucide-react";

import { Button } from "@promohub/ui/button";
import { StatusBadge } from "@/src/components/status-badge";
import {
  PageHeader,
  ErrorBox,
  LoadingBlock,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";
import {
  readSessionLabel,
  readSessionLabels,
  writeSessionLabel,
} from "@/src/lib/session-labels";

type WhatsAppSession = {
  id: string;
  sessionId: string;
  status: "DISCONNECTED" | "CONNECTING" | "QR_READY" | "CONNECTED";
  qrCode?: string;
  qrCodeDataUrl?: string;
  phoneNumber?: string;
  connectedAt?: string;
  disconnectedAt?: string;
  updatedAt?: string;
};

type QrResponse = {
  id: string;
  sessionId: string;
  status: WhatsAppSession["status"];
  qrCode?: string;
  qrCodeDataUrl?: string;
};

type PlanUsage = {
  plan: "FREE" | "BASIC" | "PRO";
  limits: {
    maxWhatsAppSessions: number;
  };
  usage: {
    whatsappSessions: number;
  };
};

export default function WhatsAppPage() {
  const [sessions, setSessions] = useState<WhatsAppSession[]>([]);
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [qrBySession, setQrBySession] = useState<Record<string, QrResponse>>({});
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newSessionLabel, setNewSessionLabel] = useState("Principal");
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [selectedSessionId, sessions],
  );
  const whatsappLimitReached = planUsage
    ? planUsage.usage.whatsappSessions >= planUsage.limits.maxWhatsAppSessions
    : false;

  useEffect(() => {
    let cancelled = false;
    setLabels(readSessionLabels());

    async function load() {
      try {
        const [result, usageResult] = await Promise.all([
          apiFetch<WhatsAppSession[]>("/whatsapp/sessions"),
          apiFetch<PlanUsage>("/billing/usage"),
        ]);

        if (!cancelled) {
          setSessions(result);
          setPlanUsage(usageResult);
          setSelectedSessionId(result[0]?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar sessoes.");
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

  useEffect(() => {
    const pendingSessions = sessions.filter(
      (session) =>
        session.status !== "CONNECTED" && session.status !== "DISCONNECTED",
    );

    if (pendingSessions.length === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void Promise.all(
        pendingSessions.map(async (session) => {
          const status = await apiFetch<WhatsAppSession>(
            `/whatsapp/session/${session.id}/status`,
          );

          setSessions((current) =>
            current.map((item) => (item.id === status.id ? status : item)),
          );

          if (status.status !== "CONNECTED") {
            await loadQr(status.id);
          }
        }),
      ).catch((err) => {
        setError(err instanceof Error ? err.message : "Erro ao atualizar status.");
      });
    }, 3000);

    return () => window.clearInterval(timer);
  }, [sessions]);

  async function connectWhatsApp() {
    if (whatsappLimitReached && planUsage) {
      setError(
        `Seu plano ${planUsage.plan} permite ${planUsage.limits.maxWhatsAppSessions} WhatsApp. Faça upgrade para conectar mais.`,
      );
      return;
    }

    setActionId("connect");
    setError(null);
    setSuccessMessage(null);

    try {
      const session = await apiFetch<WhatsAppSession>("/whatsapp/session", {
        method: "POST",
        body: JSON.stringify({
          label: newSessionLabel.trim() || "Principal",
        }),
      });
      writeSessionLabel(
        [session.id, session.sessionId],
        newSessionLabel.trim() || "Principal",
      );
      setLabels(readSessionLabels());
      setNewSessionLabel("");
      setSessions((current) => [session, ...current]);
      setSelectedSessionId(session.id);
      setPlanUsage(await apiFetch<PlanUsage>("/billing/usage"));
      await loadQr(session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar WhatsApp.");
    } finally {
      setActionId(null);
    }
  }

  async function loadQr(id: string) {
    const qr = await apiFetch<QrResponse>(`/whatsapp/session/${id}/qr`);
    setQrBySession((current) => ({
      ...current,
      [id]: qr,
    }));
  }

  async function refreshQr(id: string) {
    setActionId(`qr:${id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      await loadQr(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar QR Code.");
    } finally {
      setActionId(null);
    }
  }

  async function refreshStatus(id: string) {
    setActionId(`status:${id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const status = await apiFetch<WhatsAppSession>(
        `/whatsapp/session/${id}/status`,
      );
      setSessions((current) =>
        current.map((session) => (session.id === id ? status : session)),
      );

      if (status.status !== "CONNECTED") {
        await loadQr(id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao ler status.");
    } finally {
      setActionId(null);
    }
  }

  async function syncGroups(id: string) {
    setActionId(`groups:${id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      await apiFetch(`/whatsapp/session/${id}/groups/sync`, {
        method: "POST",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao sincronizar grupos.");
    } finally {
      setActionId(null);
    }
  }

  async function removeSession(id: string) {
    const confirmed = window.confirm(
      "Tem certeza que deseja remover este WhatsApp?",
    );

    if (!confirmed) {
      return;
    }

    setActionId(`remove:${id}`);
    setError(null);
    setSuccessMessage(null);

    try {
      const removedSession = sessions.find((session) => session.id === id);

      await apiFetch<WhatsAppSession>(`/whatsapp/session/${id}`, {
        method: "DELETE",
      });

      if (removedSession) {
        writeSessionLabel(
          [removedSession.id, removedSession.sessionId],
          "",
        );
        setLabels(readSessionLabels());
      }

      setQrBySession((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setSessions((current) => {
        const next = current.filter((session) => session.id !== id);
        setSelectedSessionId((currentSelected) =>
          currentSelected === id ? next[0]?.id ?? null : currentSelected,
        );
        return next;
      });
      setPlanUsage(await apiFetch<PlanUsage>("/billing/usage"));
      setSuccessMessage("WhatsApp removido com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover sessao.");
    } finally {
      setActionId(null);
    }
  }

  function startEditingLabel(session: WhatsAppSession) {
    setEditingLabelId(session.id);
    setEditingLabel(
      readSessionLabel(labels, [session.id, session.sessionId], session.sessionId),
    );
  }

  function saveLabel(session: WhatsAppSession) {
    writeSessionLabel([session.id, session.sessionId], editingLabel);
    setLabels(readSessionLabels());
    setEditingLabelId(null);
    setEditingLabel("");
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="WhatsApp"
          description="Conecte sessoes, acompanhe o QR Code e sincronize grupos."
        />
        {sessions.length > 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <label className="block text-sm font-medium text-slate-700">
              Nome do WhatsApp
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                onChange={(event) => setNewSessionLabel(event.target.value)}
                placeholder="Principal"
                type="text"
                value={newSessionLabel}
              />
            </label>
            <Button
              className="mt-3 w-full"
              disabled={actionId === "connect" || whatsappLimitReached}
              onClick={connectWhatsApp}
              type="button"
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              {actionId === "connect" ? "Conectando..." : "Conectar WhatsApp"}
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <ErrorBox message={error} /> : null}
      {successMessage ? (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}
      {whatsappLimitReached && planUsage ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Seu plano {planUsage.plan} permite{" "}
          {planUsage.limits.maxWhatsAppSessions} WhatsApp. Faça upgrade para
          conectar mais.
        </div>
      ) : null}

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          {loading ? (
            <LoadingBlock message="Carregando sessoes..." />
          ) : sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <h2 className="text-xl font-semibold text-slate-950">
                Conecte seu primeiro WhatsApp
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
                De um nome para identificar a sessao e escaneie o QR Code no
                WhatsApp.
              </p>
              <label className="mx-auto mt-5 block max-w-sm text-left text-sm font-medium text-slate-700">
                Nome/apelido
                <input
                  className="mt-1 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                  onChange={(event) => setNewSessionLabel(event.target.value)}
                  placeholder="Principal, WhatsApp de Ofertas, Zap Reserva"
                  type="text"
                  value={newSessionLabel}
                />
              </label>
              <Button
                className="mt-5 h-11 px-6"
                disabled={actionId === "connect" || whatsappLimitReached}
                onClick={connectWhatsApp}
                type="button"
              >
                <QrCode className="h-4 w-4" aria-hidden="true" />
                {actionId === "connect"
                  ? "Criando sessao..."
                  : "+ Conectar WhatsApp"}
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {sessions.map((session) => (
                <article
                  className={`rounded-lg border bg-white p-5 ${
                    selectedSessionId === session.id
                      ? "border-slate-950"
                      : "border-slate-200"
                  }`}
                  key={session.id}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      {editingLabelId === session.id ? (
                        <div className="flex max-w-md gap-2">
                          <input
                            className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                            onChange={(event) =>
                              setEditingLabel(event.target.value)
                            }
                            value={editingLabel}
                          />
                          <Button
                            onClick={() => saveLabel(session)}
                            size="sm"
                            type="button"
                          >
                            Salvar
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            className="text-left text-base font-semibold text-slate-950"
                            onClick={() => setSelectedSessionId(session.id)}
                            type="button"
                          >
                            {readSessionLabel(
                              labels,
                              [session.id, session.sessionId],
                              session.sessionId,
                            )}
                          </button>
                          <button
                            className="text-xs font-medium text-slate-500 underline-offset-4 hover:underline"
                            onClick={() => startEditingLabel(session)}
                            type="button"
                          >
                            editar nome
                          </button>
                        </div>
                      )}
                      <p className="mt-1 font-mono text-xs text-slate-400">
                        {session.sessionId}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge status={session.status} />
                        {session.phoneNumber ? (
                          <span className="text-sm text-slate-600">
                            {session.phoneNumber}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        Atualizada em {formatDate(session.updatedAt)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={isSessionBusy(actionId, session.id)}
                        onClick={() => refreshStatus(session.id)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        Ver status
                      </Button>
                      <Button
                        disabled={
                          isSessionBusy(actionId, session.id) ||
                          session.status !== "CONNECTED"
                        }
                        onClick={() => syncGroups(session.id)}
                        size="sm"
                        type="button"
                        variant="secondary"
                      >
                        <Users className="h-4 w-4" aria-hidden="true" />
                        Sincronizar grupos
                      </Button>
                      <Button
                        disabled={isSessionBusy(actionId, session.id)}
                        onClick={() => removeSession(session.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        Remover WhatsApp
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-950">QR Code</h2>
          {!selectedSession ? (
            <p className="mt-4 text-sm text-slate-500">
              Selecione ou crie uma sessao.
            </p>
          ) : selectedSession.status === "CONNECTED" ? (
            <div className="mt-4 rounded-md bg-emerald-50 p-4 text-sm text-emerald-700">
              <p className="font-medium">Status: conectado</p>
              <p className="mt-1">
                Telefone: {selectedSession.phoneNumber ?? "nao informado"}
              </p>
            </div>
          ) : (
            <div>
              <div className="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-800">
                <p className="font-medium">Status: aguardando conexao</p>
                <p className="mt-1">
                  Escaneie o QR Code no WhatsApp para conectar esta sessao.
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  disabled={actionId === `qr:${selectedSession.id}`}
                  onClick={() => refreshQr(selectedSession.id)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {actionId === `qr:${selectedSession.id}`
                    ? "Atualizando..."
                    : "Atualizar QR Code"}
                </Button>
                <Button
                  disabled={actionId === `status:${selectedSession.id}`}
                  onClick={() => refreshStatus(selectedSession.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Verificar status
                </Button>
              </div>
              <QrPreview
                loading={actionId === `qr:${selectedSession.id}`}
                qr={qrBySession[selectedSession.id]}
              />
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}

function QrPreview({ qr, loading }: { qr?: QrResponse; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
        Atualizando QR Code...
      </div>
    );
  }

  if (!qr) {
    return (
      <p className="mt-4 text-sm text-slate-500">
        Aguardando QR Code. Use Atualizar QR Code se necessario.
      </p>
    );
  }

  if (qr.qrCodeDataUrl) {
    return (
      <div className="mt-4 flex justify-center rounded-lg border border-slate-200 bg-white p-4">
        <Image
          alt="QR Code do WhatsApp"
          className="aspect-square w-full max-w-80 object-contain"
          height={320}
          src={qr.qrCodeDataUrl}
          unoptimized
          width={320}
        />
      </div>
    );
  }

  if (qr.qrCode) {
    return (
      <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-slate-100 p-3 text-xs text-slate-700">
        {qr.qrCode}
      </pre>
    );
  }

  return (
    <p className="mt-4 text-sm text-slate-500">
      QR Code ainda nao disponivel.
    </p>
  );
}

function isSessionBusy(actionId: string | null, sessionId: string) {
  return Boolean(actionId?.endsWith(`:${sessionId}`));
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
