import {
  ArrowRight,
  Bot,
  Check,
  Image as ImageIcon,
  Repeat2,
  Route,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@promohub/ui/button";

const benefits = [
  {
    title: "Troca automática de links",
    description:
      "Amazon, Mercado Livre e novas integrações em desenvolvimento.",
    icon: Repeat2,
  },
  {
    title: "Encaminhamento com mídia",
    description:
      "Reenvie imagem, legenda e texto sem perder o formato da oferta.",
    icon: ImageIcon,
  },
  {
    title: "Grupos no piloto automático",
    description:
      "Defina rotas de origem e destino e deixe o PeppaBot trabalhar.",
    icon: Route,
  },
];

const plans = [
  {
    name: "FREE",
    price: "R$ 0",
    features: [
      "1 sessão WhatsApp",
      "Até 3 rotas",
      "Amazon e Mercado Livre",
      "Encaminhamento com mídia",
      'Rodapé "Automatizado por PeppaBot"',
      "Ideal para testar",
    ],
  },
  {
    name: "BASIC",
    price: "R$ 49,90",
    period: "/mês",
    badge: "Mais popular",
    features: [
      "2 sessões WhatsApp",
      "Até 20 rotas",
      "Amazon e Mercado Livre",
      "Sem propaganda nas mensagens",
      "Substituição de links de grupos WhatsApp",
      "Histórico de encaminhamentos",
    ],
  },
  {
    name: "PRO",
    price: "R$ 99,90",
    period: "/mês",
    badge: "Mais completo",
    featured: true,
    features: [
      "5 sessões WhatsApp",
      "Rotas ilimitadas",
      "Múltiplos grupos de origem e destino",
      "Amazon e Mercado Livre",
      "Sem propaganda nas mensagens",
      "Prioridade em novas integrações",
      "Melhor para operação profissional",
    ],
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-zinc-950 text-white">
      <header className="relative z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-6">
          <Link
            className="flex items-center gap-2.5 font-semibold tracking-tight text-white"
            href="/"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-950/40">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg">PeppaBot</span>
          </Link>

          <Button
            asChild
            className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-white"
            variant="outline"
          >
            <Link href="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      <section className="relative">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[560px] bg-gradient-to-b from-emerald-950/50 via-zinc-950 to-zinc-950"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute left-1/2 top-8 -z-0 h-80 w-80 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl sm:h-96 sm:w-96"
          aria-hidden="true"
        />

        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-5 pb-20 pt-20 text-center sm:px-6 sm:pb-28 sm:pt-28">
          <div className="mb-6 inline-flex items-center rounded-full border border-emerald-800 bg-emerald-950/70 px-4 py-2 text-sm font-semibold text-emerald-300 shadow-sm shadow-emerald-950/50">
            🐶 PeppaBot
          </div>

          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
            Peppa<span className="text-emerald-500">Bot</span>
          </h1>
          <p className="mt-5 text-xl font-medium text-zinc-200 sm:text-2xl">
            Automação de grupos de ofertas e afiliados.
          </p>
          <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
            Capture promoções de grupos, troque links de afiliado
            automaticamente e redistribua tudo com mídia e legenda em segundos.
          </p>

          <div className="mt-9 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Button
              asChild
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              size="lg"
            >
              <Link href="/login">
                Entrar no painel
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-white"
              size="lg"
              variant="outline"
            >
              <Link href="/login">Começar agora</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-6 sm:pb-28">
        <div className="grid gap-5 md:grid-cols-3">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;

            return (
              <article
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-xl shadow-black/10 transition-all hover:-translate-y-1 hover:border-zinc-700"
                key={benefit.title}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-900 bg-emerald-950 text-emerald-400">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="mt-5 text-lg font-semibold text-white">
                  {benefit.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {benefit.description}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-zinc-800 bg-slate-950">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-500">
              Planos
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Comece no seu ritmo
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {plans.map((plan) => (
              <article
                className={`relative flex h-full flex-col rounded-2xl border p-6 ${
                  plan.featured
                    ? "border-emerald-500 bg-zinc-900 shadow-xl shadow-emerald-950/30 ring-1 ring-emerald-500/30"
                    : "border-zinc-800 bg-zinc-900"
                }`}
                key={plan.name}
              >
                {plan.badge ? (
                  <span
                    className={`absolute right-5 top-5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      plan.featured
                        ? "bg-emerald-600 text-white"
                        : "border border-zinc-700 bg-zinc-800 text-zinc-200"
                    }`}
                  >
                    {plan.badge}
                  </span>
                ) : null}
                <h3
                  className={`text-sm font-bold tracking-[0.15em] ${
                    plan.featured ? "text-emerald-400" : "text-zinc-300"
                  }`}
                >
                  {plan.name}
                </h3>
                <div className="mt-5 flex items-end gap-1">
                  <span className="text-3xl font-bold tracking-tight text-white">
                    {plan.price}
                  </span>
                  {plan.period ? (
                    <span className="pb-1 text-sm text-zinc-400">
                      {plan.period}
                    </span>
                  ) : null}
                </div>

                <div className="my-6 h-px bg-zinc-800" />

                <ul className="flex-1 space-y-3 text-sm text-zinc-300">
                  {plan.features.map((feature) => (
                    <li className="flex gap-3" key={feature}>
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                        aria-hidden="true"
                      />
                      <span className="leading-5">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className={`mt-8 w-full ${
                    plan.featured
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-white"
                  }`}
                  variant={plan.featured ? "default" : "outline"}
                >
                  <Link href="/login">Começar agora</Link>
                </Button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-zinc-950 px-5 py-8 text-center text-sm text-zinc-400 sm:px-6">
        © PeppaBot — Automação de grupos de ofertas e afiliados.
      </footer>
    </main>
  );
}
