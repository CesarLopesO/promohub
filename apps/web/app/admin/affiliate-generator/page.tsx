"use client";

import { FormEvent, useEffect, useState } from "react";
import { FlaskConical, Save } from "lucide-react";

import { Button } from "@promohub/ui/button";
import {
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { ApiError, apiFetch } from "@/src/lib/api";

type GeneratorConfig = {
  marketplace: string;
  method: string;
  url: string;
  headers: unknown;
  bodyTemplate: unknown;
  responsePath?: string | null;
  isActive: boolean;
};

type TestResult = {
  originalUrl: string;
  resolvedUrl?: string;
  itemId?: string;
  affiliateUrl?: string;
  changed: boolean;
  reason: string | null;
  error?: string;
  message?: string;
};

const DEFAULT_BODY = {
  url: "{{resolvedUrl}}",
  originalUrl: "{{originalUrl}}",
  tag: "{{affiliateId}}",
  itemId: "{{itemId}}",
};

export default function AffiliateGeneratorAdminPage() {
  const [method, setMethod] = useState("POST");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("{}");
  const [bodyTemplate, setBodyTemplate] = useState(
    JSON.stringify(DEFAULT_BODY, null, 2),
  );
  const [responsePath, setResponsePath] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [testUrl, setTestUrl] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const config = await apiFetch<GeneratorConfig>(
          "/admin/affiliate-generator-configs/mercado_livre",
        );

        if (!cancelled) {
          setMethod(config.method);
          setUrl(config.url);
          setHeaders(JSON.stringify(config.headers ?? {}, null, 2));
          setBodyTemplate(
            JSON.stringify(config.bodyTemplate ?? DEFAULT_BODY, null, 2),
          );
          setResponsePath(config.responsePath ?? "");
          setIsActive(config.isActive);
        }
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404) && !cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar config.");
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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    let parsedHeaders: unknown;
    let parsedBody: unknown;

    try {
      parsedHeaders = JSON.parse(headers);
      parsedBody = JSON.parse(bodyTemplate);
    } catch {
      setError("Headers e Body Template devem conter JSON válido.");
      return;
    }

    setSaving(true);

    try {
      await apiFetch<GeneratorConfig>(
        "/admin/affiliate-generator-configs/mercado_livre",
        {
          method: "PUT",
          body: JSON.stringify({
            method,
            url,
            headers: parsedHeaders,
            bodyTemplate: parsedBody,
            responsePath: responsePath.trim() || null,
            isActive,
          }),
        },
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar config.");
    } finally {
      setSaving(false);
    }
  }

  async function testConfig() {
    if (!testUrl.trim()) {
      setError("Informe uma URL do Mercado Livre para testar.");
      return;
    }

    setTesting(true);
    setError(null);
    setTestResult(null);

    try {
      setTestResult(
        await apiFetch<TestResult>("/affiliate/test/mercado-livre", {
          method: "POST",
          body: JSON.stringify({ url: testUrl.trim() }),
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao testar config.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Gerador de Afiliado"
        description="Configure o template de requisição do Mercado Livre."
      />

      <div className="mb-5 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
        Abra o Portal de Afiliados do Mercado Livre, pressione F12 &gt; Network,
        gere um link e copie a URL, método, payload e resposta. Não cole cookies,
        ssid ou Authorization.
      </div>

      {error ? (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      ) : null}

      {loading ? (
        <LoadingBlock message="Carregando configuração..." />
      ) : (
        <form
          className="border border-slate-200 bg-white p-5"
          onSubmit={save}
        >
          <div className="grid gap-4 md:grid-cols-[180px_1fr]">
            <Field label="Marketplace">
              <input
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-600"
                disabled
                value="Mercado Livre"
              />
            </Field>
            <Field label="Method">
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-950"
                onChange={(event) => setMethod(event.target.value)}
                value={method}
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
              </select>
            </Field>
          </div>

          <Field label="URL">
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.mercadolivre.com.br/..."
              required
              value={url}
            />
          </Field>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Headers JSON">
              <textarea
                className="mt-1 w-full resize-y rounded-md border border-slate-300 p-3 font-mono text-sm outline-none focus:border-slate-950"
                onChange={(event) => setHeaders(event.target.value)}
                rows={10}
                spellCheck={false}
                value={headers}
              />
            </Field>
            <Field label="Body Template JSON">
              <textarea
                className="mt-1 w-full resize-y rounded-md border border-slate-300 p-3 font-mono text-sm outline-none focus:border-slate-950"
                onChange={(event) => setBodyTemplate(event.target.value)}
                rows={10}
                spellCheck={false}
                value={bodyTemplate}
              />
            </Field>
          </div>

          <Field label="Response Path">
            <input
              className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
              onChange={(event) => setResponsePath(event.target.value)}
              placeholder="data.shortUrl"
              value={responsePath}
            />
          </Field>

          <label className="mt-4 flex items-center gap-3 text-sm font-medium text-slate-700">
            <input
              checked={isActive}
              className="h-4 w-4"
              onChange={(event) => setIsActive(event.target.checked)}
              type="checkbox"
            />
            Ativo
          </label>

          <div className="mt-5 flex items-center gap-3">
            <Button disabled={saving} type="submit">
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? "Salvando..." : "Salvar configuração"}
            </Button>
            {saved ? (
              <span className="text-sm font-medium text-emerald-700">
                Configuração salva.
              </span>
            ) : null}
          </div>
        </form>
      )}

      <section className="mt-6 border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-950">Testar config</h2>
        <Field label="URL de teste">
          <input
            className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
            onChange={(event) => setTestUrl(event.target.value)}
            placeholder="https://meli.la/2BCJSYh"
            type="url"
            value={testUrl}
          />
        </Field>
        <Button
          className="mt-4"
          disabled={testing}
          onClick={() => void testConfig()}
          type="button"
          variant="secondary"
        >
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          {testing ? "Testando..." : "Testar config"}
        </Button>

        {testResult ? <TestDetails result={testResult} /> : null}
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
    <label className="mt-4 block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function TestDetails({ result }: { result: TestResult }) {
  const rows = [
    ["URL original", result.originalUrl],
    ["URL resolvida", result.resolvedUrl],
    ["Item ID", result.itemId],
    ["Link afiliado", result.affiliateUrl],
    ["Status", result.changed ? "Sucesso" : "Falha"],
    ["Motivo", result.reason],
    ["Erro", result.message ?? result.error],
  ].filter((row) => row[1]);

  return (
    <dl className="mt-4 grid gap-2 border-t border-slate-200 pt-4 text-sm">
      {rows.map(([label, value]) => (
        <div className="grid gap-1 sm:grid-cols-[140px_1fr]" key={label}>
          <dt className="text-slate-500">{label}</dt>
          <dd className="break-all font-medium text-slate-950">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
