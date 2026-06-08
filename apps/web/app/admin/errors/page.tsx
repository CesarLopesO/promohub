"use client";

import { useEffect, useState } from "react";

import {
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type AdminError = {
  id: string;
  userId: string;
  userEmail: string;
  error?: string;
  sourceMessageId: string;
  destinationGroupJid: string;
  createdAt: string;
};

export default function AdminErrorsPage() {
  const [rows, setRows] = useState<AdminError[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await apiFetch<AdminError[]>("/admin/errors");

        if (!cancelled) {
          setRows(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar erros.");
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

  return (
    <div>
      <PageHeader title="Erros" description="Falhas recentes de forwards." />

      {error ? <ErrorBox message={error} /> : null}

      {loading ? (
        <LoadingBlock message="Carregando erros..." />
      ) : (
        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Erro</th>
                <th className="px-4 py-3">Mensagem</th>
                <th className="px-4 py-3">Destino</th>
                <th className="px-4 py-3">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-slate-200" key={row.id}>
                  <td className="px-4 py-3 font-medium text-slate-950">
                    {row.userEmail}
                  </td>
                  <td className="px-4 py-3 text-red-700">
                    {row.error ?? "Falha sem detalhe."}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.sourceMessageId}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.destinationGroupJid}
                  </td>
                  <td className="px-4 py-3">{formatDate(row.createdAt)}</td>
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
