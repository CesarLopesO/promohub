"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  FlaskConical,
  Save,
  XCircle,
} from "lucide-react";

import { Button } from "@promohub/ui/button";
import {
  CREDENTIAL_TUTORIAL_MARKETPLACES,
  CredentialTutorialContent,
  EMPTY_CREDENTIAL_TUTORIAL_SETTINGS,
  pickCredentialTutorialSettings,
  type CredentialTutorialSettings,
} from "@/src/components/credential-tutorial-link";
import { ErrorBox, LoadingBlock, PageHeader } from "@/src/components/ui-state";
import { UpcomingMarketplaceCard } from "@/src/components/upcoming-marketplace-card";
import { apiFetch } from "@/src/lib/api";
import { normalizeMagazineLuizaStoreSlug } from "@/src/lib/magazine-luiza-store-slug";

type Credential = {
  id: string;
  marketplace: "amazon" | "mercado_livre" | string;
  affiliateId?: string;
  trackingId?: string;
  storeSlug?: string;
  hasApiKey?: boolean;
  hasApiSecret?: boolean;
  hasAppId?: boolean;
  hasSecret?: boolean;
  hasSessionToken?: boolean;
  isActive: boolean;
};

type MercadoLivreTestResult = {
  marketplace: "mercado_livre";
  mode: "real" | "legacy" | "disabled";
  originalUrl: string;
  resolvedUrl?: string;
  attemptedPayloadUrl?: string;
  itemId?: string;
  originalItemId?: string;
  generatedItemId?: string;
  sameProduct: boolean;
  canForward: boolean;
  originProductUrl?: string;
  mainProductUrl?: string;
  mainProductSource?: "primary_cta" | "preloaded_primary" | "none";
  originConfidence?: "explicit" | "canonical" | "none";
  affiliateUrl?: string;
  changed: boolean;
  reason: string | null;
  error?: string;
  message?: string;
  warning?: string;
  cacheHit: boolean;
  matchReason?: string;
  score?: number;
  candidatesCount?: number;
  ambiguous?: boolean;
  selectedCandidateReason?: string;
  offerKeywords?: string[];
  generationAttempts?: Array<{
    url: string;
    success: boolean;
    status?: number;
    error?: string;
  }>;
  socialDebug?: {
    resolvedUrl: string;
    candidates: Array<{
      source: "cta" | "json_field" | "json_ld" | "canonical" | "og" | "href";
      url: string;
      itemId?: string;
      score: number;
      title?: string;
      textContext?: string;
      matchReason?: string;
    }>;
  };
  socialCandidates?: Array<{
    source: "cta" | "json_field" | "json_ld" | "canonical" | "og" | "href";
    url: string;
    itemId?: string;
    score: number;
    title?: string;
    matchReason?: string;
    matchedKeywords?: string[];
    rejectedReason?: string;
  }>;
  selectedCandidate?: {
    source: "cta" | "json_field" | "json_ld" | "canonical" | "og" | "href";
    url: string;
    itemId?: string;
    score: number;
    title?: string;
    matchReason?: string;
    matchedKeywords?: string[];
    rejectedReason?: string;
  };
  candidates?: Array<{
    source: "cta" | "json_field" | "json_ld" | "canonical" | "og" | "href";
    url: string;
    itemId?: string;
    score: number;
    title?: string;
    matchReason?: string;
    matchedKeywords?: string[];
    rejectedReason?: string;
  }>;
};

type MercadoLivreRawResult = {
  status: number;
  requestHeaders: Record<string, unknown>;
  requestBody: unknown;
  responseHeaders: Record<string, unknown>;
  body: unknown;
};

const UPCOMING_MARKETPLACES = CREDENTIAL_TUTORIAL_MARKETPLACES.filter(
  ({ marketplace }) =>
    marketplace !== "amazon" &&
    marketplace !== "mercado_livre" &&
    marketplace !== "shopee" &&
    marketplace !== "magazine_luiza",
);

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [tutorialSettings, setTutorialSettings] =
    useState<CredentialTutorialSettings>(EMPTY_CREDENTIAL_TUTORIAL_SETTINGS);
  const [amazonTrackingId, setAmazonTrackingId] = useState("");
  const [mlSessionToken, setMlSessionToken] = useState("");
  const [mlAffiliateId, setMlAffiliateId] = useState("");
  const [shopeeAppId, setShopeeAppId] = useState("");
  const [shopeePassword, setShopeePassword] = useState("");
  const [magazineLuizaStoreSlug, setMagazineLuizaStoreSlug] = useState("");
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
  const [mlRawResult, setMlRawResult] = useState<MercadoLivreRawResult | null>(
    null,
  );
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
  const magazineLuizaCredential = useMemo(
    () =>
      credentials.find(
        (credential) => credential.marketplace === "magazine_luiza",
      ),
    [credentials],
  );
  const shopeeCredential = useMemo(
    () => credentials.find((credential) => credential.marketplace === "shopee"),
    [credentials],
  );
  const mlHasToken = Boolean(mlCredential?.hasSessionToken);
  const shopeeHasAppId = Boolean(
    shopeeCredential?.hasAppId ?? shopeeCredential?.hasApiKey,
  );
  const shopeeHasSecret = Boolean(
    shopeeCredential?.hasSecret ?? shopeeCredential?.hasApiSecret,
  );

  async function loadCredentials() {
    setError(null);
    const result = await apiFetch<Credential[]>("/affiliate/credentials");
    setCredentials(result);

    const amazon = result.find(
      (credential) => credential.marketplace === "amazon",
    );
    const mercadoLivre = result.find(
      (credential) => credential.marketplace === "mercado_livre",
    );

    setAmazonTrackingId(amazon?.trackingId ?? "");
    setMlAffiliateId(mercadoLivre?.affiliateId ?? "");
    setMlSessionToken("");
    setShopeeAppId("");
    setShopeePassword("");
    setMagazineLuizaStoreSlug(
      result.find((credential) => credential.marketplace === "magazine_luiza")
        ?.storeSlug ?? "",
    );
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [result, settings] = await Promise.all([
          apiFetch<Credential[]>("/affiliate/credentials"),
          apiFetch<CredentialTutorialSettings>("/settings/public", {
            auth: false,
          }).catch(() => EMPTY_CREDENTIAL_TUTORIAL_SETTINGS),
        ]);

        if (!cancelled) {
          setCredentials(result);
          setTutorialSettings(pickCredentialTutorialSettings(settings));
          setAmazonTrackingId(
            result.find((credential) => credential.marketplace === "amazon")
              ?.trackingId ?? "",
          );
          setMlAffiliateId(
            result.find(
              (credential) => credential.marketplace === "mercado_livre",
            )?.affiliateId ?? "",
          );
          setMagazineLuizaStoreSlug(
            result.find(
              (credential) => credential.marketplace === "magazine_luiza",
            )?.storeSlug ?? "",
          );
          setShopeeAppId("");
          setShopeePassword("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Erro ao carregar credenciais.",
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

  async function saveMagazineLuiza(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const storeSlug = normalizeMagazineLuizaStoreSlug(magazineLuizaStoreSlug);

    if (!storeSlug) {
      setError(
        "Informe apenas o nome da loja Magazine Você, com 3 a 80 letras, números, hífens ou underscores.",
      );
      return;
    }

    setSaving("magazine_luiza");
    setError(null);

    try {
      await saveCredential(magazineLuizaCredential?.id, {
        marketplace: "magazine_luiza",
        storeSlug,
      });
      await loadCredentials();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar credencial Magazine Luiza.",
      );
    } finally {
      setSaving(null);
    }
  }

  async function saveShopee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!shopeeAppId.trim() && !shopeeHasAppId) {
      setError("Informe o AppID da Shopee.");
      return;
    }

    if (!shopeePassword.trim() && !shopeeHasSecret) {
      setError("Informe a senha da Shopee.");
      return;
    }

    setSaving("shopee");
    setError(null);

    try {
      await saveCredential(shopeeCredential?.id, {
        marketplace: "shopee",
        ...(shopeeAppId.trim() ? { appId: shopeeAppId.trim() } : {}),
        ...(shopeePassword.trim() ? { password: shopeePassword.trim() } : {}),
      });
      await loadCredentials();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erro ao salvar credenciais Shopee.",
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
        description="Gerencie as integrações com seus programas de afiliados."
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
          <MarketplaceOverview />

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

              <CredentialTutorialContent
                marketplace="amazon"
                settings={tutorialSettings}
              />

              <div className="mt-5">
                <Button disabled={saving === "amazon"} type="submit">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving === "amazon" ? "Salvando..." : "Salvar Amazon"}
                </Button>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-950">
                  Configuração atual
                </h3>
                <dl className="mt-3 grid gap-2 text-sm">
                  <Row
                    label="Status"
                    value={amazonCredential?.isActive ? "Ativa" : "Inativa"}
                  />
                  <Row
                    label="Tag atual"
                    value={amazonCredential?.trackingId || "Não informada"}
                  />
                </dl>
              </div>
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

              <CredentialTutorialContent
                marketplace="mercado_livre"
                settings={tutorialSettings}
              />

              <div className="mt-5">
                <Button disabled={saving === "mercado_livre"} type="submit">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving === "mercado_livre"
                    ? "Salvando..."
                    : "Salvar Mercado Livre"}
                </Button>
              </div>

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
                  {testingMlRaw ? "Executando..." : "Teste RAW Mercado Livre"}
                </Button>

                {mlRawResult ? (
                  <MercadoLivreRawDetails result={mlRawResult} />
                ) : null}
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-950">
                  Configuração atual
                </h3>
                <dl className="mt-3 grid gap-2 text-sm">
                  <Row
                    label="Status"
                    value={mlCredential?.isActive ? "Ativa" : "Inativa"}
                  />
                  <Row
                    label="Affiliate ID atual"
                    value={mlCredential?.affiliateId || "Não informado"}
                  />
                  <Row
                    label="SSID"
                    value={
                      mlCredential?.hasSessionToken
                        ? "Configurado"
                        : "Não configurado"
                    }
                  />
                </dl>
              </div>
            </form>

            <form
              className="rounded-lg border border-slate-200 bg-white p-5"
              onSubmit={saveMagazineLuiza}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    Magazine Luiza
                  </h2>
                </div>
              </div>

              <label className="mt-5 block text-sm font-medium text-slate-700">
                Tag / Nome da loja
                <input
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                  maxLength={80}
                  minLength={3}
                  onChange={(event) =>
                    setMagazineLuizaStoreSlug(event.target.value)
                  }
                  pattern="[A-Za-z0-9_-]{3,80}"
                  placeholder="magazineproafiliados"
                  required
                  type="text"
                  value={magazineLuizaStoreSlug}
                />
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Informe o nome da sua loja Magazine Você. Exemplo: se sua loja
                  é https://www.magazinevoce.com.br/magazineproafiliados, digite
                  apenas: magazineproafiliados
                </span>
              </label>

              <CredentialTutorialContent
                marketplace="magazine_luiza"
                settings={tutorialSettings}
              />

              <div className="mt-5">
                <Button disabled={saving === "magazine_luiza"} type="submit">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving === "magazine_luiza"
                    ? "Salvando..."
                    : "Salvar Magazine Luiza"}
                </Button>
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-950">
                  Configuração atual
                </h3>
                <dl className="mt-3 grid gap-2 text-sm">
                  <Row
                    label="Status"
                    value={
                      magazineLuizaCredential?.isActive ? "Ativa" : "Inativa"
                    }
                  />
                  <Row
                    label="Nome da loja"
                    value={
                      magazineLuizaCredential?.storeSlug || "Não informado"
                    }
                  />
                </dl>
              </div>
            </form>

            <form
              className="rounded-lg border border-slate-200 bg-white p-5"
              onSubmit={saveShopee}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    Shopee
                  </h2>
                </div>
                <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Geração pendente
                </span>
              </div>

              <p className="mt-3 text-sm text-slate-600">
                Use as credenciais do portal de afiliados Shopee.
              </p>

              <label className="mt-5 block text-sm font-medium text-slate-700">
                AppID
                <input
                  autoComplete="off"
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                  onChange={(event) => setShopeeAppId(event.target.value)}
                  placeholder={
                    shopeeHasAppId
                      ? "Preencha apenas para substituir"
                      : "Informe o AppID"
                  }
                  required={!shopeeHasAppId}
                  type="text"
                  value={shopeeAppId}
                />
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  O AppID salvo não é exibido novamente.
                </span>
              </label>

              <label className="mt-4 block text-sm font-medium text-slate-700">
                Senha
                <input
                  autoComplete="new-password"
                  className="mt-1 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-slate-950"
                  onChange={(event) => setShopeePassword(event.target.value)}
                  placeholder={
                    shopeeHasSecret
                      ? "Preencha apenas para substituir"
                      : "Informe a senha"
                  }
                  required={!shopeeHasSecret}
                  type="password"
                  value={shopeePassword}
                />
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  A senha é armazenada criptografada e não é exibida novamente.
                </span>
              </label>

              <CredentialTutorialContent
                marketplace="shopee"
                settings={tutorialSettings}
              />

              <div className="mt-5">
                <Button disabled={saving === "shopee"} type="submit">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving === "shopee"
                    ? "Salvando..."
                    : "Salvar credenciais Shopee"}
                </Button>
              </div>

              <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Shopee está com credenciais salvas, mas a geração automática
                ainda não foi ativada. Links Shopee serão encaminhados sem
                alteração.
              </div>

              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold text-slate-950">
                  Configuração atual
                </h3>
                <dl className="mt-3 grid gap-2 text-sm">
                  <Row
                    label="Status"
                    value={shopeeCredential?.isActive ? "Ativa" : "Inativa"}
                  />
                  <Row
                    label="AppID"
                    value={shopeeHasAppId ? "Configurado" : "Não configurado"}
                  />
                  <Row
                    label="Senha"
                    value={shopeeHasSecret ? "Configurada" : "Não configurada"}
                  />
                </dl>
              </div>
            </form>
          </section>

          <section className="mt-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-slate-950">
                Próximas integrações
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Novos marketplaces serão liberados gradualmente.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {UPCOMING_MARKETPLACES.map(({ marketplace, label }) => (
                <UpcomingMarketplaceCard
                  key={marketplace}
                  label={label}
                  marketplace={marketplace}
                  tutorialSettings={tutorialSettings}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MarketplaceOverview() {
  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-950">
        Marketplaces disponíveis
      </h2>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">
            Suportados
          </p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {["Amazon", "Mercado Livre", "Magazine Luiza", "Shopee"].map(
              (marketplace) => (
                <li className="flex items-center gap-2" key={marketplace}>
                  <CheckCircle2
                    aria-hidden="true"
                    className="h-4 w-4 text-emerald-600"
                  />
                  {marketplace}
                </li>
              ),
            )}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-amber-700">
            Em desenvolvimento
          </p>
          <ul className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            {UPCOMING_MARKETPLACES.map(({ marketplace, label }) => (
              <li className="flex items-center gap-2" key={marketplace}>
                <Clock3 aria-hidden="true" className="h-4 w-4 text-amber-600" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function MercadoLivreRawDetails({ result }: { result: MercadoLivreRawResult }) {
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
  const isPending = result.reason === "MERCADO_LIVRE_GENERATOR_URL_MISSING";
  const statusLabel = result.changed
    ? result.mode === "legacy"
      ? "Link legado gerado"
      : "Link gerado com sucesso"
    : isPending
      ? "Gerador pendente"
      : "Falha na geração";
  const message = isPending
    ? "Sua etiqueta e SSID estão salvos, mas ainda falta configurar o endpoint real do gerador Mercado Livre no backend."
    : (result.message ?? result.error);

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
          <CheckCircle2
            className="h-4 w-4 text-emerald-700"
            aria-hidden="true"
          />
        ) : (
          <XCircle className="h-4 w-4 text-rose-700" aria-hidden="true" />
        )}
        {statusLabel}
      </div>
      <dl className="mt-3 grid gap-2">
        <Row label="URL original" value={result.originalUrl} />
        <Row label="URL resolvida" value={result.resolvedUrl || "-"} />
        <Row
          label="URL enviada ao endpoint"
          value={result.attemptedPayloadUrl || "-"}
        />
        <Row label="Produto de origem" value={result.originProductUrl || "-"} />
        <Row
          label="Confiança da origem"
          value={result.originConfidence || "none"}
        />
        {result.itemId ? <Row label="Item ID" value={result.itemId} /> : null}
        <Row label="Item original" value={result.originalItemId || "-"} />
        <Row label="Item gerado" value={result.generatedItemId || "-"} />
        <Row label="Mesmo produto" value={result.sameProduct ? "Sim" : "Não"} />
        <Row
          label="Pode encaminhar"
          value={result.canForward ? "Sim" : "Não"}
        />
        <Row label="Produto principal" value={result.mainProductUrl || "-"} />
        <Row
          label="Fonte do produto principal"
          value={result.mainProductSource || "-"}
        />
        <Row label="Cache" value={result.cacheHit ? "Hit" : "Miss"} />
        <Row label="Motivo do match" value={result.matchReason || "-"} />
        <Row
          label="Score selecionado"
          value={result.score === undefined ? "-" : String(result.score)}
        />
        <Row
          label="Quantidade de candidatos"
          value={String(result.candidatesCount ?? 0)}
        />
        <Row
          label="Múltiplos candidatos"
          value={result.ambiguous ? "Sim" : "Não"}
        />
        <Row
          label="Motivo da seleção"
          value={result.selectedCandidateReason || "-"}
        />
        <Row
          label="Palavras da oferta"
          value={result.offerKeywords?.join(", ") || "-"}
        />
        <Row label="Link afiliado" value={result.affiliateUrl || "-"} />
        <Row label="Modo" value={result.mode} />
        {result.warning ? <Row label="Aviso" value={result.warning} /> : null}
        {!result.changed ? (
          <Row label="Status" value={message || result.reason || "-"} />
        ) : null}
      </dl>
      {result.generationAttempts?.length ? (
        <div className="mt-4">
          <p className="font-semibold text-slate-950">Tentativas de geração</p>
          <ul className="mt-2 space-y-2">
            {result.generationAttempts.map((attempt, index) => (
              <li
                className="rounded border border-slate-200 bg-white p-2"
                key={`${attempt.url}-${index}`}
              >
                <p className="break-all">{attempt.url}</p>
                <p className="text-slate-600">
                  {attempt.success
                    ? "Sucesso"
                    : `Falha${attempt.status ? ` HTTP ${attempt.status}` : ""}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.socialDebug ? (
        <div className="mt-4">
          <p className="font-semibold text-slate-950">
            Candidatos da página social
          </p>
          <p className="mt-1 break-all text-slate-600">
            {result.socialDebug.resolvedUrl}
          </p>
          {result.socialDebug.candidates.length ? (
            <ul className="mt-2 space-y-2">
              {result.socialDebug.candidates.map((candidate, index) => (
                <li
                  className="rounded border border-slate-200 bg-white p-2"
                  key={`${candidate.url}-${index}`}
                >
                  <p className="font-medium">
                    {candidate.source}
                    {candidate.itemId ? ` · ${candidate.itemId}` : ""}
                  </p>
                  <p className="break-all">{candidate.url}</p>
                  {candidate.textContext ? (
                    <p className="mt-1 text-slate-600">
                      {candidate.textContext}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-slate-600">Nenhum candidato encontrado.</p>
          )}
        </div>
      ) : null}
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
