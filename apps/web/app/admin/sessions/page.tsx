"use client";

import { useEffect, useState } from "react";

import {
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type AdminSession = {
  id: string;
  userId: string;
  userEmail: string;
  label: string;
  sessionId: string;
  status: string;
  phoneNumber?: string;
  connectedAt?: string;
  updatedAt: string;
};

export default function AdminSessionsPage() {
  const [rows, setRows] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await apiFetch<AdminSession[]>("/admin/sessions");

        if (!cancelled) {
          setRows(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erro ao carregar sessões.",
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

  return (
    <div>
      <PageHeader
        title="Sessões"
        description="Sessões WhatsApp agrupadas por usuário."
      />

      {error ? <ErrorBox message={error} /> : null}

      {loading ? (
        <LoadingBlock message="Carregando sessões..." />
      ) : (
        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Usuário</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Session ID</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Conectado em</th>
                <th className="px-4 py-3">Atualizado em</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-slate-200" key={row.id}>
                  <td className="px-4 py-3 font-medium text-slate-950">
                    {row.userEmail}
                  </td>
                  <td className="px-4 py-3">{row.label}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.sessionId}
                  </td>
                  <td className="px-4 py-3">{row.status}</td>
                  <td className="px-4 py-3">{row.phoneNumber ?? "-"}</td>
                  <td className="px-4 py-3">
                    {row.connectedAt ? formatDate(row.connectedAt) : "-"}
                  </td>
                  <td className="px-4 py-3">{formatDate(row.updatedAt)}</td>
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
