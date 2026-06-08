"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  FlaskConical,
  Save,
  XCircle,
} from "lucide-react";

import { Button } from "@promohub/ui/button";
import {
  EmptyState,
  ErrorBox,
  LoadingBlock,
  PageHeader,
} from "@/src/components/ui-state";
import { apiFetch } from "@/src/lib/api";

type Credential = {
  id: string;
  marketplace: "amazon" | "mercado_livre" | string;
  affiliateId?: string;
  trackingId?: string;
  hasApiKey?: boolean;
  hasApiSecret?: boolean;
  hasSessionToken?: boolean;
  isActive: boolean;
};

type MercadoLivreTestResult = {
  marketplace: "mercado_livre";
  mode: "real" | "legacy" | "disabled";
  originalUrl: string;
  resolvedUrl?: string;
  itemId?: string;
  affiliateUrl?: string;
  changed: boolean;
  reason: string | null;
  error?: string;
  message?: string;
  warning?: string;
};

type MercadoLivreRawResult = {
  status: number;
  requestHeaders: Record<string, unknown>;
  requestBody: unknown;
  responseHeaders: Record<string, unknown>;
  body: unknown;
};

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [amazonTrackingId, setAmazonTrackingId] = useState("");
  const [mlSessionToken, setMlSessionToken] = useState("");
  const [mlAffiliateId, setMlAffiliateId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [mlTestUrl, setMlTestUrl] = useState("");
  const [mlTestResult, setMlTestResult] =
    useState<MercadoLivreTestResult | null>(null);
  const [testingMl, setTestingMl] = useState(false);
  const [mlRawUrl, setMlRawUrl] = useState("");
  const [mlRawPayload, setMlRawPayload] = useState(
    JSON.stringify(
      {
        tag: "loce6396673",
        url: "https://produto.mercadolivre.com.br/MLB-5943120120-kit-10-cuecas-algodo-polo-wear-sortido-_JM",
      },
      null,
      2,
    ),
  );
  const [mlRawResult, setMlRawResult] =
    useState<MercadoLivreRawResult | null>(null);
  const [testingMlRaw, setTestingMlRaw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amazonCredential = useMemo(
    () => credentials.find((credential) => credential.marketplace === "amazon"),
    [credentials],
  );
  const mlCredential = useMemo(
    () =>
      credentials.find(
        (credential) => credential.marketplace === "mercado_livre",
      ),
    [credentials],
  );
  const mlHasToken = Boolean(mlCredential?.hasSessionToken);

  async function loadCredentials() {
    setError(null);
    const result = await apiFetch<Credential[]>("/affiliate/credentials");
    setCredentials(result);

    const amazon = result.find((credential) => credential.marketplace === "amazon");
    const mercadoLivre = result.find(
      (credential) => credential.marketplace === "mercado_livre",
    );

    setAmazonTrackingId(amazon?.trackingId ?? "");
    setMlAffiliateId(mercadoLivre?.affiliateId ?? "");
    setMlSessionToken("");
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await apiFetch<Credential[]>("/affiliate/credentials");

        if (!cancelled) {
          setCredentials(result);
          setAmazonTrackingId(
            result.find((credential) => credential.marketplace === "amazon")
              ?.trackingId ?? "",
          );
          setMlAffiliateId(
            result.find(
              (credential) => credential.marketplace === "mercado_livre",
            )?.affiliateId ?? "",
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Erro ao carregar credenciais.",
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

  async function saveAmazon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!amazonTrackingId.trim()) {
      setError("Informe a tag de afiliado da Amazon.");
      return;
    }

    setSaving("amazon");
    setError(null);

    try {
      await saveCredential(amazonCredential?.id, {
        marketplace: "amazon",
        trackingId: amazonTrackingId.trim(),
        affiliateId: null,
        apiKey: null,
        apiSecret: null,
        metadata: null,
      });
      await loadCredentials();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao salvar tag da Amazon.",
      );
    } finally {
      setSaving(null);
    }
  }

  async function saveMercadoLivre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!mlAffiliateId.trim()) {
      setError("Informe a etiqueta ou Affiliate ID do Mercado Livre.");
      return;
    }

    if (!mlSessionToken.trim() && !mlHasToken) {
      setError("Informe o token ou cookie da sessao Mercado Livre.");
      return;
    }

    setSaving("mercado_livre");
    setError(null);

    try {
      await saveCredential(mlCredential?.id, {
        marketplace: "mercado_livre",
        affiliateId: mlAffiliateId.trim() || undefined,
        trackingId: null,
        apiKey: null,
        apiSecret: null,
        ...(mlSessionToken.trim()
          ? {
              metadata: {
                ssid: mlSessionToken.trim(),
              },
            }
          : {}),
      });
      await loadCredentials();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar credencial Mercado Livre.",
      );
    } finally {
      setSaving(null);
    }
  }

  async function testMercadoLivre() {
    if (!mlTestUrl.trim()) {
      setError("Informe uma URL do Mercado Livre para testar.");
      return;
    }

    setTestingMl(true);
    setError(null);
    setMlTestResult(null);

    try {
      const result = await apiFetch<MercadoLivreTestResult>(
        "/affiliate/test/mercado-livre",
        {
          method: "POST",
          body: JSON.stringify({ url: mlTestUrl.trim() }),
        },
      );
      setMlTestResult(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao testar o gerador do Mercado Livre.",
      );
    } finally {
      setTestingMl(false);
    }
  }

  async function testMercadoLivreRaw() {
    if (!mlRawUrl.trim()) {
      setError("Informe uma URL do Mercado Livre para o teste RAW.");
      return;
    }

    setTestingMlRaw(true);
    setError(null);
    setMlRawResult(null);

    try {
      const payload = mlRawPayload.trim()
        ? (JSON.parse(mlRawPayload) as unknown)
        : undefined;
      setMlRawResult(
        await apiFetch<MercadoLivreRawResult>("/affiliate/test/raw", {
          method: "POST",
          body: JSON.stringify({
            url: mlRawUrl.trim(),
            ...(payload === undefined ? {} : { payload }),
          }),
        }),
      );
    } catch (err) {
      setError(
        err instanceof SyntaxError
          ? "Payload JSON inválido."
          : err instanceof Error
            ? err.message
            : "Erro no teste RAW do Mercado Livre.",
      );
    } finally {
      setTestingMlRaw(false);
    }
  }

  async function saveCredential(id: string | undefined, payload: object) {
    await apiFetch<Credential>(
      id ? `/affiliate/credentials/${id}` : "/affiliate/credentials",
      {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  return (
    <div>
      <PageHeader
        title="Credenciais de Afiliado"
        description="Configure suas tags da Amazon e Mercado Livre."
      />

      {error ? (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      ) : null}

      {loading ? (
        <LoadingBlock message="Carregando credenciais..." />
      ) : (
        <>
          <section className="mb-6 grid gap-4 sm:grid-cols-2">
            <SummaryCard
              label="Amazon"
              configured={Boolean(amazonCredential?.isActive)}
            />
            <SummaryCard
              label="Mercado Livre"
              configured={Boolean(mlCredential?.isActive)}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <form
              className="rounded-lg border border-slate-200 bg-white p-5"
              onSubmit={saveAmazon}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    Amazon
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Status: {amazonCredential?.isActive ? "Ativa" : "Nao configurada"}
                  </p>
                </div>
              </div>

              <label className="mt-5 block text-sm font-medium text-slate-700">
                Tracking ID / Tag Amazon
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                  onChange={(event) => setAmazonTrackingId(event.target.value)}
                  placeholder="ex: meutag-20"
                  required
                  type="text"
                  value={amazonTrackingId}
                />
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Cole sua tag de afiliado da Amazon. Ela sera usada como
                  ?tag=meutag-20.
                </span>
              </label>

              <Button
                className="mt-5"
                disabled={saving === "amazon"}
                type="submit"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {saving === "amazon" ? "Salvando..." : "Salvar Amazon"}
              </Button>
            </form>

            <form
              className="rounded-lg border border-slate-200 bg-white p-5"
              onSubmit={saveMercadoLivre}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    Mercado Livre
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Status: {mlCredential?.isActive ? "Ativa" : "Nao configurada"}
                  </p>
                  {mlHasToken ? (
                    <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      SSID configurado
                    </span>
                  ) : null}
                </div>
              </div>

              <label className="mt-5 block text-sm font-medium text-slate-700">
                Etiqueta / Affiliate ID
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                  onChange={(event) => setMlAffiliateId(event.target.value)}
                  placeholder="ex: loce6396673"
                  required
                  type="text"
                  value={mlAffiliateId}
                />
              </label>

              <label className="mt-4 block text-sm font-medium text-slate-700">
                SSID / Sessão
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                  onChange={(event) => setMlSessionToken(event.target.value)}
                  placeholder={
                    mlHasToken
                      ? "Preencha apenas para substituir a sessão"
                      : "cole seu ssid"
                  }
                  required={!mlHasToken}
                  type="password"
                  value={mlSessionToken}
                />
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {mlHasToken
                    ? "Preencha apenas se quiser substituir."
                    : "O SSID será armazenado criptografado e usado somente no gerador de afiliado."}
                </span>
              </label>

              <Button
                className="mt-5"
                disabled={saving === "mercado_livre"}
                type="submit"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {saving === "mercado_livre"
                  ? "Salvando..."
                  : "Salvar Mercado Livre"}
              </Button>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-950">
                  Testar conversão Mercado Livre
                </h3>
                <label className="block text-sm font-medium text-slate-700">
                  URL de teste
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                    onChange={(event) => setMlTestUrl(event.target.value)}
                    placeholder="https://meli.la/2BCJSYh"
                    type="url"
                    value={mlTestUrl}
                  />
                </label>
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  Payload JSON (opcional)
                  <textarea
                    className="mt-1 w-full resize-y rounded-md border border-slate-300 p-3 font-mono text-xs outline-none focus:border-slate-950"
                    onChange={(event) => setMlRawPayload(event.target.value)}
                    rows={7}
                    spellCheck={false}
                    value={mlRawPayload}
                  />
                </label>
                <Button
                  className="mt-3"
                  disabled={testingMl}
                  onClick={() => void testMercadoLivre()}
                  type="button"
                  variant="secondary"
                >
                  <FlaskConical className="h-4 w-4" aria-hidden="true" />
                  {testingMl ? "Testando..." : "Testar geração"}
                </Button>

                {mlTestResult ? (
                  <MercadoLivreTestDetails result={mlTestResult} />
                ) : null}
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-950">
                  Diagnóstico RAW Mercado Livre
                </h3>
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  URL
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                    onChange={(event) => setMlRawUrl(event.target.value)}
                    placeholder="https://meli.la/2BCJSYh"
                    type="url"
                    value={mlRawUrl}
                  />
                </label>
                <Button
                  className="mt-3"
                  disabled={testingMlRaw}
                  onClick={() => void testMercadoLivreRaw()}
                  type="button"
                  variant="outline"
                >
                  <FlaskConical className="h-4 w-4" aria-hidden="true" />
                  {testingMlRaw
                    ? "Executando..."
                    : "Teste RAW Mercado Livre"}
                </Button>

                {mlRawResult ? (
                  <MercadoLivreRawDetails result={mlRawResult} />
                ) : null}
              </div>
            </form>
          </section>

          <section className="mt-6">
            {credentials.length === 0 ? (
              <EmptyState message="Nenhuma credencial cadastrada." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {credentials.map((credential) => (
                  <CredentialSummary credential={credential} key={credential.id} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MercadoLivreRawDetails({
  result,
}: {
  result: MercadoLivreRawResult;
}) {
  return (
    <div className="mt-4 border border-slate-200 bg-slate-50 p-4 text-sm">
      <p className="font-semibold text-slate-950">
        Status HTTP: {result.status}
      </p>
      <RawBlock label="Request Headers" value={result.requestHeaders} />
      <RawBlock label="Request Body" value={result.requestBody} />
      <RawBlock label="Response Headers" value={result.responseHeaders} />
      <RawBlock label="Response Body" value={result.body} />
    </div>
  );
}

function RawBlock({ label, value }: { label: string; value: unknown }) {
  const content =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

  return (
    <div className="mt-4">
      <p className="font-medium text-slate-700">{label}</p>
      <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-all border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800">
        {content}
      </pre>
    </div>
  );
}

function MercadoLivreTestDetails({
  result,
}: {
  result: MercadoLivreTestResult;
}) {
  const isPending =
    result.reason === "MERCADO_LIVRE_GENERATOR_URL_MISSING";
  const statusLabel = result.changed
    ? result.mode === "legacy"
      ? "Link legado gerado"
      : "Link gerado com sucesso"
    : isPending
      ? "Gerador pendente"
      : "Falha na geração";
  const message = isPending
    ? "Sua etiqueta e SSID estão salvos, mas ainda falta configurar o endpoint real do gerador Mercado Livre no backend."
    : result.message ?? result.error;

  async function copyAffiliateUrl() {
    if (result.affiliateUrl) {
      await navigator.clipboard.writeText(result.affiliateUrl);
    }
  }

  return (
    <div
      className={`mt-4 border-l-4 px-4 py-3 text-sm ${
        result.changed
          ? "border-emerald-500 bg-emerald-50"
          : "border-rose-500 bg-rose-50"
      }`}
    >
      <div className="flex items-center gap-2 font-semibold text-slate-950">
        {result.changed ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-700" aria-hidden="true" />
        )}
        {statusLabel}
      </div>
      <dl className="mt-3 grid gap-2">
        <Row label="URL original" value={result.originalUrl} />
        <Row label="URL resolvida" value={result.resolvedUrl || "-"} />
        {result.itemId ? <Row label="Item ID" value={result.itemId} /> : null}
        <Row label="Link afiliado" value={result.affiliateUrl || "-"} />
        <Row label="Modo" value={result.mode} />
        {result.warning ? <Row label="Aviso" value={result.warning} /> : null}
        {!result.changed ? (
          <Row label="Status" value={message || result.reason || "-"} />
        ) : null}
      </dl>
      {result.affiliateUrl ? (
        <Button
          className="mt-3"
          onClick={() => void copyAffiliateUrl()}
          size="sm"
          type="button"
          variant="outline"
        >
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copiar link
        </Button>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  configured,
}: {
  label: string;
  configured: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p
        className={`mt-2 text-lg font-semibold ${
          configured ? "text-emerald-700" : "text-amber-700"
        }`}
      >
        {configured ? "Configurado" : "Pendente"}
      </p>
    </div>
  );
}

function CredentialSummary({ credential }: { credential: Credential }) {
  const isMercadoLivre = credential.marketplace === "mercado_livre";

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-950">
        {isMercadoLivre ? "Mercado Livre" : "Amazon"}
      </h2>
      <dl className="mt-4 grid gap-2 text-sm">
        {isMercadoLivre ? (
          <>
            <Row
              label="SSID"
              value={credential.hasSessionToken ? "Configurado" : "Nao configurado"}
            />
            <Row
              label="Affiliate ID"
              value={credential.affiliateId || "Nao informado"}
            />
          </>
        ) : (
          <Row label="Tag" value={credential.trackingId} />
        )}
        <Row label="Status" value={credential.isActive ? "Ativa" : "Inativa"} />
      </dl>
    </article>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all text-right font-medium text-slate-950">
        {value || "-"}
      </dd>
    </div>
  );
}
