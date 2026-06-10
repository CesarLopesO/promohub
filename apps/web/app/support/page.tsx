"use client";

import Link from "next/link";
import { ArrowLeft, LifeBuoy } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@promohub/ui/button";
import {
  SupportChannels,
  type SupportSettings,
} from "@/src/components/support-channels";
import { ErrorBox, LoadingBlock } from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

export default function SupportPage() {
  const [settings, setSettings] = useState<SupportSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      try {
        const result = await apiFetch<SupportSettings>("/settings/public", {
          auth: false,
        });

        if (!cancelled) {
          setSettings(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Erro ao carregar os canais de suporte.",
          );
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:px-6 sm:py-16">
      <div className="mx-auto w-full max-w-4xl">
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar
          </Link>
        </Button>

        <header className="mb-8 mt-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <LifeBuoy className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Suporte PeppaBot
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Precisa de ajuda? Entre em contato pelos canais abaixo.
          </p>
        </header>

        {error ? <ErrorBox message={error} /> : null}
        {!error && !settings ? (
          <LoadingBlock message="Carregando canais de suporte..." />
        ) : null}
        {settings ? <SupportChannels {...settings} /> : null}
      </div>
    </main>
  );
}
