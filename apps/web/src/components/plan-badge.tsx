"use client";

import Link from "next/link";

import { Button } from "@promohub/ui/button";

type Plan = "FREE" | "BASIC" | "PRO" | string;

export function PlanBadge({ plan }: { plan: Plan }) {
  const normalizedPlan = normalizePlan(plan);
  const config = planConfig[normalizedPlan];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-semibold ${config.badgeClass}`}
      >
        {config.label}
      </span>
      <Button asChild size="sm" variant={config.buttonVariant}>
        <Link href="/dashboard/billing">{config.action}</Link>
      </Button>
    </div>
  );
}

function normalizePlan(plan: Plan): "FREE" | "BASIC" | "PRO" {
  if (plan === "BASIC" || plan === "PRO") {
    return plan;
  }

  return "FREE";
}

const planConfig = {
  FREE: {
    label: "FREE",
    action: "Fazer upgrade",
    badgeClass: "bg-amber-100 text-amber-800",
    buttonVariant: "default" as const,
  },
  BASIC: {
    label: "BASIC",
    action: "Gerenciar assinatura",
    badgeClass: "bg-emerald-100 text-emerald-800",
    buttonVariant: "secondary" as const,
  },
  PRO: {
    label: "PRO",
    action: "Gerenciar assinatura",
    badgeClass: "bg-purple-100 text-purple-800",
    buttonVariant: "secondary" as const,
  },
};
