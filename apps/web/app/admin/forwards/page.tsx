"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@promohub/ui/button";
import {
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type AdminForward = {
  id: string;
  userId: string;
  userEmail: string;
  sourceMessageId: string;
  sourceGroupJid: string;
  destinationGroupJid: string;
  status: string;
  mode?: string;
  sentMessageType?: string;
  mediaForwarded: boolean;
  error?: string;
  createdAt: string;
};

export default function AdminForwardsPage() {
  const [rows, setRows] = useState<AdminForward[]>([]);
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (status.trim()) {
        params.set("status", status.trim());
      }

      if (mode.trim()) {
        params.set("mode", mode.trim());
      }

      const result = await apiFetch<AdminForward[]>(
        `/admin/forwards${params.size ? `?${params.toString()}` : ""}`,
      );
      setRows(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar forwards.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load();
  }

  return (
    <div>
      <PageHeader
        title="Forwards"
        description="Últimos envios automáticos e manuais."
      />

      <form
        className="mb-6 flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4"
        onSubmit={onSubmit}
      >
        <input
          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
          onChange={(event) => setStatus(event.target.value)}
          placeholder="Status"
          value={status}
        />
        <input
          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
          onChange={(event) => setMode(event.target.value)}
          placeholder="Mode"
          value={mode}
        />
        <Button type="submit">Filtrar</Button>
      </form>

      {error ? <ErrorBox message={error} /> : null}

      {loading ? (
        <LoadingBlock message="Carregando forwards..." />
      ) : (
        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Imagem</th>
                <th className="px-4 py-3">Origem</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3">Erro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-slate-200" key={row.id}>
                  <td className="px-4 py-3 font-medium text-slate-950">
                    {row.userEmail}
                  </td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">{row.mode ?? "-"}</td>
                  <td className="px-4 py-3">
                    {row.mediaForwarded ? "Sim" : "Não"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.sourceGroupJid}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.destinationGroupJid}
                  </td>
                  <td className="px-4 py-3">{formatDate(row.createdAt)}</td>
                  <td className="px-4 py-3 text-red-700">{row.error ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
