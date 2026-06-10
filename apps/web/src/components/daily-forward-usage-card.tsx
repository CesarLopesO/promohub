import Link from "next/link";

export type DailyForwardUsage = {
  plan: "FREE" | "BASIC" | "PRO";
  limits: {
    dailyForwardLimit: number | null;
  };
  usage: {
    forwardsToday: number;
    dailyForwardRemaining: number | null;
  };
};

export function DailyForwardUsageCard({
  usage,
}: {
  usage: DailyForwardUsage;
}) {
  const limit = usage.limits.dailyForwardLimit;
  const forwardsToday = usage.usage.forwardsToday;

  if (limit === null) {
    return (
      <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-semibold text-slate-950">
          Mensagens encaminhadas hoje: {forwardsToday}
        </h2>
        <p className="mt-2 text-sm text-slate-600">Ilimitado no seu plano</p>
      </section>
    );
  }

  const percentage = Math.min((forwardsToday / limit) * 100, 100);
  const limitReached = forwardsToday >= limit;
  const nearLimit = percentage >= 80;

  return (
    <section className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-slate-950">
          Mensagens encaminhadas hoje
        </h2>
        <p className="text-lg font-semibold text-slate-950">
          {forwardsToday} / {limit}
        </p>
      </div>
      <div
        aria-label={`${forwardsToday} de ${limit} mensagens encaminhadas hoje`}
        aria-valuemax={limit}
        aria-valuemin={0}
        aria-valuenow={Math.min(forwardsToday, limit)}
        className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
      >
        <div
          className={`h-full rounded-full ${
            limitReached
              ? "bg-red-600"
              : nearLimit
                ? "bg-amber-500"
                : "bg-emerald-600"
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {nearLimit ? (
        <div
          className={`mt-4 rounded-md border px-4 py-3 text-sm ${
            limitReached
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <p>
            {limitReached
              ? "Limite diário atingido. Faça upgrade para continuar encaminhando hoje."
              : "Você está perto do limite diário do plano FREE."}
          </p>
          {limitReached ? (
            <Link
              className="mt-3 inline-flex rounded-md bg-slate-950 px-4 py-2 font-medium text-white hover:bg-slate-800"
              href="/dashboard/billing"
            >
              Fazer upgrade
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
