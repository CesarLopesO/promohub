import { Activity, Database, Server } from "lucide-react";

import { Button } from "@promohub/ui/button";

const statusItems = [
  {
    label: "Web",
    detail: "Next.js 15",
    icon: Activity,
  },
  {
    label: "API",
    detail: "NestJS",
    icon: Server,
  },
  {
    label: "Dados",
    detail: "PostgreSQL + Redis",
    icon: Database,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            PROMOHUB
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl">
            Base profissional para automacao de afiliados.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
            Monorepo pronto para evoluir com web, API, pacotes compartilhados,
            infraestrutura local e padroes de qualidade.
          </p>
          <div className="mt-8">
            <Button asChild>
              <a
                href={
                  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
                }
              >
                Abrir API
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {statusItems.map((item) => {
            const Icon = item.icon;

            return (
              <div
                className="rounded-lg border border-slate-200 bg-white p-5"
                key={item.label}
              >
                <Icon className="h-5 w-5 text-slate-700" aria-hidden="true" />
                <h2 className="mt-4 text-base font-semibold text-slate-950">
                  {item.label}
                </h2>
                <p className="mt-1 text-sm text-slate-600">{item.detail}</p>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
