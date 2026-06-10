"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@promohub/ui/button";
import { apiFetch } from "@/src/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await apiFetch<{ id: string; email: string }>("/auth/register", {
        method: "POST",
        auth: false,
        body: JSON.stringify({
          name: name.trim() || undefined,
          email,
          password,
        }),
      });
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar usuario.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-semibold uppercase text-slate-500">
            PeppaBot
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">
            Criar usuario
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Automação de grupos de ofertas e afiliados.
          </p>
        </div>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm font-medium text-slate-700">
            Nome
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
              onChange={(event) => setName(event.target.value)}
              type="text"
              value={name}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Senha
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <Button className="w-full" disabled={saving} type="submit">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {saving ? "Criando..." : "Criar conta"}
          </Button>
        </form>

        <p className="mt-4 text-sm text-slate-600">
          Ja tem conta?{" "}
          <Link className="font-medium text-slate-950" href="/login">
            Entrar
          </Link>
        </p>
      </section>
    </main>
  );
}
