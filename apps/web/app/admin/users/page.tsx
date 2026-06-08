"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@promohub/ui/button";
import {
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type AdminUser = {
  id: string;
  email: string;
  name?: string;
  role: string;
  plan: string;
  subscriptionStatus: string;
  isActive: boolean;
  createdAt: string;
  _count: {
    sessions: number;
    routes: number;
    forwardedMessages: number;
  };
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (search.trim()) {
        params.set("search", search.trim());
      }

      if (plan) {
        params.set("plan", plan);
      }

      const result = await apiFetch<AdminUser[]>(
        `/admin/users${params.size ? `?${params.toString()}` : ""}`,
      );
      setUsers(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar usuários.");
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
        title="Usuários"
        description="Busque usuários e acompanhe plano, status e uso."
      />

      <form
        className="mb-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto]"
        onSubmit={onSubmit}
      >
        <input
          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por email"
          type="search"
          value={search}
        />
        <select
          className="h-10 rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
          onChange={(event) => setPlan(event.target.value)}
          value={plan}
        >
          <option value="">Todos os planos</option>
          <option value="FREE">FREE</option>
          <option value="BASIC">BASIC</option>
          <option value="PRO">PRO</option>
        </select>
        <Button type="submit">Filtrar</Button>
      </form>

      {error ? <ErrorBox message={error} /> : null}

      {loading ? (
        <LoadingBlock message="Carregando usuários..." />
      ) : (
        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Plano</th>
                <th className="px-4 py-3">Assinatura</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Ativo</th>
                <th className="px-4 py-3">Uso</th>
                <th className="px-4 py-3">Criado em</th>
                <th className="px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr className="border-t border-slate-200" key={user.id}>
                  <td className="px-4 py-3 font-medium text-slate-950">
                    {user.email}
                  </td>
                  <td className="px-4 py-3">{user.plan}</td>
                  <td className="px-4 py-3">{user.subscriptionStatus}</td>
                  <td className="px-4 py-3">{user.role}</td>
                  <td className="px-4 py-3">{user.isActive ? "Sim" : "Não"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {user._count.sessions} sessões, {user._count.routes} rotas,{" "}
                    {user._count.forwardedMessages} forwards
                  </td>
                  <td className="px-4 py-3">{formatDate(user.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link
                      className="font-medium text-slate-950 underline-offset-4 hover:underline"
                      href={`/admin/users/${user.id}`}
                    >
                      Ver / Editar
                    </Link>
                  </td>
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
