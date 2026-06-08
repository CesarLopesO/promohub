"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@promohub/ui/button";
import {
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type AdminUserDetail = {
  id: string;
  email: string;
  name?: string;
  role: string;
  plan: string;
  subscriptionStatus: string;
  isActive: boolean;
  createdAt: string;
  subscription?: { plan: string; status: string; checkoutUrl?: string } | null;
  sessions: Array<{ id: string; sessionId: string; status: string; phoneNumber?: string }>;
  routes: Array<{ id: string; sourceGroupJid: string; destinationGroupJid: string; isActive: boolean }>;
  credentials: Array<{ id: string; marketplace: string; affiliateId?: string; trackingId?: string; isActive: boolean }>;
  forwards: Array<{ id: string; status: string; mode?: string; error?: string; createdAt: string }>;
  messages: Array<{ id: string; groupJid: string; messageType: string; text?: string; createdAt: string }>;
};

type PlanUsage = {
  plan: string;
  limits: {
    maxWhatsAppSessions: number;
    maxSourceGroups: number | null;
    maxDestinationGroups: number | null;
    adsEnabled: boolean;
  };
  usage: {
    whatsappSessions: number;
    sourceGroups: number;
    destinationGroups: number;
    activeRoutes: number;
  };
};

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [form, setForm] = useState({
    name: "",
    plan: "FREE",
    subscriptionStatus: "NONE",
    role: "USER",
    isActive: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [result, usageResult] = await Promise.all([
        apiFetch<AdminUserDetail>(`/admin/users/${params.id}`),
        apiFetch<PlanUsage>(`/admin/users/${params.id}/usage`),
      ]);

      setUser(result);
      setUsage(usageResult);
      setForm({
        name: result.name ?? "",
        plan: result.plan,
        subscriptionStatus: result.subscriptionStatus,
        role: result.role,
        isActive: result.isActive,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar usuário.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await apiFetch(`/admin/users/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      await load();
      setMessage("Usuário atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar usuário.");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(isActive: boolean) {
    setSaving(true);
    setError(null);

    try {
      await apiFetch(`/admin/users/${params.id}/${isActive ? "resume" : "pause"}`, {
        method: "POST",
      });
      await load();
      setMessage(isActive ? "Usuário reativado." : "Usuário pausado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao alterar usuário.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingBlock message="Carregando usuário..." />;
  }

  if (error && !user) {
    return <ErrorBox message={error} />;
  }

  if (!user) {
    return <ErrorBox message="Usuário indisponível." />;
  }

  return (
    <div>
      <PageHeader title={user.email} description="Detalhes e controle manual." />

      {error ? <div className="mb-4"><ErrorBox message={error} /></div> : null}
      {message ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <form
        className="mb-6 grid gap-4 rounded-lg border border-slate-200 bg-white p-5 md:grid-cols-2 xl:grid-cols-5"
        onSubmit={save}
      >
        <Field label="Nome">
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            value={form.name}
          />
        </Field>
        <SelectField
          label="Plano"
          onChange={(value) => setForm((current) => ({ ...current, plan: value }))}
          options={["FREE", "BASIC", "PRO"]}
          value={form.plan}
        />
        <SelectField
          label="Assinatura"
          onChange={(value) => setForm((current) => ({ ...current, subscriptionStatus: value }))}
          options={["NONE", "PENDING", "ACTIVE", "OVERDUE", "PAST_DUE", "CANCELED"]}
          value={form.subscriptionStatus}
        />
        <SelectField
          label="Role"
          onChange={(value) => setForm((current) => ({ ...current, role: value }))}
          options={["USER", "ADMIN"]}
          value={form.role}
        />
        <label className="block text-sm font-medium text-slate-700">
          Ativo
          <select
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
            onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "true" }))}
            value={String(form.isActive)}
          >
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </label>
        <div className="flex flex-wrap gap-2 xl:col-span-5">
          <Button disabled={saving} type="submit">
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
          <Button
            disabled={saving}
            onClick={() => setActive(!user.isActive)}
            type="button"
            variant="secondary"
          >
            {user.isActive ? "Pausar usuário" : "Reativar usuário"}
          </Button>
        </div>
      </form>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="Sessões">
          {user.sessions.map((session) => (
            <Row key={session.id} label={session.sessionId} value={session.status} />
          ))}
        </Panel>
        <Panel title="Rotas">
          {user.routes.map((route) => (
            <Row
              key={route.id}
              label={route.sourceGroupJid}
              value={`${route.destinationGroupJid} (${route.isActive ? "ativa" : "pausada"})`}
            />
          ))}
        </Panel>
        <Panel title="Credenciais">
          {user.credentials.map((credential) => (
            <Row
              key={credential.id}
              label={credential.marketplace}
              value={credential.isActive ? "ativa" : "inativa"}
            />
          ))}
        </Panel>
        <Panel title="Últimos forwards">
          {user.forwards.map((forward) => (
            <Row
              key={forward.id}
              label={forward.status}
              value={forward.error ?? formatDate(forward.createdAt)}
            />
          ))}
        </Panel>
        <Panel title="Últimas mensagens">
          {user.messages.map((message) => (
            <Row
              key={message.id}
              label={message.messageType}
              value={message.text ?? message.groupJid}
            />
          ))}
        </Panel>
        <Panel title="Assinatura atual">
          <Row label="Plano" value={user.subscription?.plan ?? user.plan} />
          <Row
            label="Status"
            value={user.subscription?.status ?? user.subscriptionStatus}
          />
        </Panel>
        {usage ? (
          <Panel title="Uso do plano">
            <Row
              label="WhatsApps"
              value={`${usage.usage.whatsappSessions} / ${formatLimit(
                usage.limits.maxWhatsAppSessions,
              )}`}
            />
            <Row
              label="Grupos origem"
              value={`${usage.usage.sourceGroups} / ${formatLimit(
                usage.limits.maxSourceGroups,
              )}`}
            />
            <Row
              label="Grupos destino"
              value={`${usage.usage.destinationGroups} / ${formatLimit(
                usage.limits.maxDestinationGroups,
              )}`}
            />
            <Row
              label="Propaganda"
              value={usage.limits.adsEnabled ? "ativa" : "inativa"}
            />
          </Panel>
        ) : null}
      </section>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-950">{title}</h2>
      <div className="space-y-3 text-sm">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 border-t border-slate-200 pt-3 first:border-0 first:pt-0">
      <span className="min-w-0 flex-1 truncate text-slate-500">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right font-medium text-slate-950">
        {value}
      </span>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatLimit(value: number | null): string {
  return value === null ? "ilimitado" : String(value);
}
