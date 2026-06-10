"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";

import { Button } from "@promohub/ui/button";
import { ErrorBox, LoadingBlock, PageHeader } from "@/src/components/ui-state";
import type { SupportSettings } from "@/src/components/support-channels";
import { apiFetch } from "@/src/lib/api";

const DEFAULT_FREE_PLAN_SIGNATURE =
  "🤖 Automatizado por PeppaBot\nAutomação de grupos de ofertas e afiliados.";

export default function AdminSupportSettingsPage() {
  const [supportEmail, setSupportEmail] = useState("");
  const [supportWhatsappUrl, setSupportWhatsappUrl] = useState("");
  const [freePlanSignature, setFreePlanSignature] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const result = await apiFetch<SupportSettings>("/admin/settings");

        if (!cancelled) {
          setSupportEmail(result.supportEmail);
          setSupportWhatsappUrl(result.supportWhatsappUrl);
          setFreePlanSignature(
            result.freePlanSignature ?? DEFAULT_FREE_PLAN_SIGNATURE,
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Erro ao carregar configurações.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const result = await apiFetch<SupportSettings>("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          supportEmail,
          supportWhatsappUrl,
          freePlanSignature,
        }),
      });

      setSupportEmail(result.supportEmail);
      setSupportWhatsappUrl(result.supportWhatsappUrl);
      setFreePlanSignature(
        result.freePlanSignature ?? DEFAULT_FREE_PLAN_SIGNATURE,
      );
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao salvar configurações.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Suporte"
        description="Configure os canais exibidos na página pública de suporte."
      />

      {error ? (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      ) : null}

      {loading ? (
        <LoadingBlock message="Carregando configurações..." />
      ) : (
        <form
          className="rounded-lg border border-slate-200 bg-white p-5"
          onSubmit={saveSettings}
        >
          <label className="block text-sm font-medium text-slate-700">
            Email de contato
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
              onChange={(event) => setSupportEmail(event.target.value)}
              placeholder="suporte@peppabot.com"
              type="email"
              value={supportEmail}
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Link do WhatsApp
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
              onChange={(event) => setSupportWhatsappUrl(event.target.value)}
              placeholder="https://wa.me/5538999999999?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20no%20PeppaBot."
              type="url"
              value={supportWhatsappUrl}
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Mensagem do plano FREE
            <textarea
              className="mt-1 min-h-28 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950"
              maxLength={300}
              onChange={(event) => setFreePlanSignature(event.target.value)}
              placeholder={DEFAULT_FREE_PLAN_SIGNATURE}
              value={freePlanSignature}
            />
            <span className="mt-1 block text-xs text-slate-500">
              {freePlanSignature.length}/300 caracteres
            </span>
          </label>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button disabled={saving} type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? "Salvando..." : "Salvar configurações"}
            </Button>
            {saved ? (
              <span className="text-sm font-medium text-emerald-700">
                Configurações salvas.
              </span>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
