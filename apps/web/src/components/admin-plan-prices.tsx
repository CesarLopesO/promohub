import { FormEvent } from "react";

import { Button } from "@promohub/ui/button";

type PlanPricesFormProps = {
  basicPrice: string;
  proPrice: string;
  saving: boolean;
  saved: boolean;
  onBasicPriceChange: (value: string) => void;
  onProPriceChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export type PlanPrices = {
  FREE: number;
  BASIC: number;
  PRO: number;
};

export function centsToReaisInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function reaisInputToCents(value: string): number {
  const clean = value.trim().replace(/^R\$\s*/, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    return Number.NaN;
  }

  return Math.round(amount * 100);
}

export function buildPlanPricesPayload(
  basicPrice: string,
  proPrice: string,
): Pick<PlanPrices, "BASIC" | "PRO"> {
  return {
    BASIC: reaisInputToCents(basicPrice),
    PRO: reaisInputToCents(proPrice),
  };
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export function AdminPlanPricesForm({
  basicPrice,
  proPrice,
  saving,
  saved,
  onBasicPriceChange,
  onProPriceChange,
  onSubmit,
}: PlanPricesFormProps) {
  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-base font-semibold text-slate-950">
          Preços dos planos
        </h2>
        <p className="mt-1 text-sm text-slate-500">FREE é sempre gratuito.</p>
        <p className="mt-1 text-sm text-slate-500">
          Alterações afetam novos checkouts, não assinaturas já criadas.
        </p>
      </div>

      <form className="mt-5 grid gap-4 md:grid-cols-3" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-slate-700">
          FREE
          <input
            aria-label="FREE"
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500"
            disabled
            readOnly
            value="R$ 0,00"
          />
        </label>

        <label className="block text-sm font-medium text-slate-700">
          BASIC
          <span className="mt-1 flex h-10 items-center rounded-md border border-slate-300 focus-within:border-slate-950">
            <span className="border-r border-slate-200 px-3 text-sm text-slate-500">
              R$
            </span>
            <input
              aria-label="BASIC"
              className="h-full min-w-0 flex-1 rounded-r-md px-3 text-sm outline-none"
              inputMode="decimal"
              onChange={(event) => onBasicPriceChange(event.target.value)}
              placeholder="79,90"
              value={basicPrice}
            />
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Atual: {formatCurrency(reaisInputToCents(basicPrice) || 0)}
          </span>
        </label>

        <label className="block text-sm font-medium text-slate-700">
          PRO
          <span className="mt-1 flex h-10 items-center rounded-md border border-slate-300 focus-within:border-slate-950">
            <span className="border-r border-slate-200 px-3 text-sm text-slate-500">
              R$
            </span>
            <input
              aria-label="PRO"
              className="h-full min-w-0 flex-1 rounded-r-md px-3 text-sm outline-none"
              inputMode="decimal"
              onChange={(event) => onProPriceChange(event.target.value)}
              placeholder="99,90"
              value={proPrice}
            />
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            Atual: {formatCurrency(reaisInputToCents(proPrice) || 0)}
          </span>
        </label>

        <div className="flex items-end gap-3 md:col-span-3">
          <Button disabled={saving} type="submit">
            {saving ? "Salvando..." : "Salvar preços"}
          </Button>
          {saved ? (
            <span className="text-sm font-medium text-emerald-700">
              Preços salvos.
            </span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
