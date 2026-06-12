"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";

import { Button } from "@promohub/ui/button";
import {
  AdminPlanPricesForm,
  buildPlanPricesPayload,
  centsToReaisInput,
  type PlanPrices,
} from "@/src/components/admin-plan-prices";
import {
  CREDENTIAL_TUTORIAL_MARKETPLACES,
  EMPTY_CREDENTIAL_TUTORIAL_SETTINGS,
  pickCredentialTutorialSettings,
  type CredentialTutorialSettings,
} from "@/src/components/credential-tutorial-link";
import { ErrorBox, LoadingBlock, PageHeader } from "@/src/components/ui-state";
import type { SupportSettings } from "@/src/components/support-channels";
import { apiFetch } from "@/src/lib/api";

type AdminSettings = SupportSettings & CredentialTutorialSettings;

const DEFAULT_FREE_PLAN_SIGNATURE =
  "🤖 Automatizado por PeppaBot\nAutomação de grupos de ofertas e afiliados.";

export default function AdminSupportSettingsPage() {
  const [supportEmail, setSupportEmail] = useState("");
  const [supportWhatsappUrl, setSupportWhatsappUrl] = useState("");
  const [freePlanSignature, setFreePlanSignature] = useState("");
  const [tutorialSettings, setTutorialSettings] =
    useState<CredentialTutorialSettings>(EMPTY_CREDENTIAL_TUTORIAL_SETTINGS);
  const [basicPrice, setBasicPrice] = useState("");
  const [proPrice, setProPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pricesSaved, setPricesSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const [settings, planPrices] = await Promise.all([
          apiFetch<AdminSettings>("/admin/settings"),
          apiFetch<PlanPrices>("/admin/plan-prices"),
        ]);

        if (!cancelled) {
          setSupportEmail(settings.supportEmail);
          setSupportWhatsappUrl(settings.supportWhatsappUrl);
          setFreePlanSignature(
            settings.freePlanSignature ?? DEFAULT_FREE_PLAN_SIGNATURE,
          );
          setTutorialSettings(pickCredentialTutorialSettings(settings));
          setBasicPrice(centsToReaisInput(planPrices.BASIC));
          setProPrice(centsToReaisInput(planPrices.PRO));
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
      const result = await apiFetch<AdminSettings>("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({
          supportEmail,
          supportWhatsappUrl,
          freePlanSignature,
          ...tutorialSettings,
        }),
      });

      setSupportEmail(result.supportEmail);
      setSupportWhatsappUrl(result.supportWhatsappUrl);
      setFreePlanSignature(
        result.freePlanSignature ?? DEFAULT_FREE_PLAN_SIGNATURE,
      );
      setTutorialSettings(pickCredentialTutorialSettings(result));
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao salvar configurações.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function savePlanPrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPrices(true);
    setPricesSaved(false);
    setError(null);

    try {
      const result = await apiFetch<PlanPrices>("/admin/plan-prices", {
        method: "PATCH",
        body: JSON.stringify(buildPlanPricesPayload(basicPrice, proPrice)),
      });

      setBasicPrice(centsToReaisInput(result.BASIC));
      setProPrice(centsToReaisInput(result.PRO));
      setPricesSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar preços.");
    } finally {
      setSavingPrices(false);
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
        <>
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

            <section className="mt-6 border-t border-slate-200 pt-5">
              <h2 className="text-base font-semibold text-slate-950">
                Tutoriais de credenciais
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Configure as instruções e o vídeo exibidos em cada marketplace.
              </p>

              <div className="mt-4 grid gap-5 xl:grid-cols-2">
                {CREDENTIAL_TUTORIAL_MARKETPLACES.map(
                  ({ label, titleKey, bodyKey, videoUrlKey }) => (
                    <fieldset
                      className="rounded-lg border border-slate-200 p-4"
                      key={titleKey}
                    >
                      <legend className="px-1 text-sm font-semibold text-slate-950">
                        {label}
                      </legend>

                      <label className="block text-sm font-medium text-slate-700">
                        Título
                        <input
                          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                          maxLength={120}
                          onChange={(event) =>
                            setTutorialSettings((current) => ({
                              ...current,
                              [titleKey]: event.target.value,
                            }))
                          }
                          placeholder={`Como obter suas credenciais ${label}`}
                          type="text"
                          value={tutorialSettings[titleKey]}
                        />
                      </label>

                      <label className="mt-4 block text-sm font-medium text-slate-700">
                        Texto do tutorial
                        <textarea
                          className="mt-1 min-h-36 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950"
                          maxLength={3000}
                          onChange={(event) =>
                            setTutorialSettings((current) => ({
                              ...current,
                              [bodyKey]: event.target.value,
                            }))
                          }
                          placeholder={
                            "1. Acesse o portal de afiliados.\n2. Faça login.\n3. Copie sua credencial.\n4. Cole no PeppaBot."
                          }
                          value={tutorialSettings[bodyKey]}
                        />
                      </label>

                      <label className="mt-4 block text-sm font-medium text-slate-700">
                        URL do vídeo
                        <input
                          className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                          maxLength={500}
                          onChange={(event) =>
                            setTutorialSettings((current) => ({
                              ...current,
                              [videoUrlKey]: event.target.value,
                            }))
                          }
                          placeholder="https://youtube.com/watch?v=..."
                          type="url"
                          value={tutorialSettings[videoUrlKey]}
                        />
                      </label>
                    </fieldset>
                  ),
                )}
              </div>
            </section>

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

          <AdminPlanPricesForm
            basicPrice={basicPrice}
            proPrice={proPrice}
            saving={savingPrices}
            saved={pricesSaved}
            onBasicPriceChange={setBasicPrice}
            onProPriceChange={setProPrice}
            onSubmit={savePlanPrices}
          />
        </>
      )}
    </div>
  );
}
