"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Gauge,
  Gift,
  LogOut,
  MessageSquareWarning,
  LifeBuoy,
  Send,
  Smartphone,
  Users,
} from "lucide-react";

import { useAuth } from "@/src/hooks/use-auth";
import { ThemeToggle } from "@/src/components/theme-toggle";

const adminNavItems = [
  { href: "/admin", label: "Visão geral", icon: Gauge },
  { href: "/admin/users", label: "Usuários", icon: Users },
  { href: "/admin/sessions", label: "Sessões", icon: Smartphone },
  { href: "/admin/forwards", label: "Forwards", icon: Send },
  { href: "/admin/errors", label: "Erros", icon: MessageSquareWarning },
  { href: "/admin/settings", label: "Suporte", icon: LifeBuoy },
  { href: "/admin/referrals", label: "Indicações", icon: Gift },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, error, logout } = useAuth();

  useEffect(() => {
    if (!loading && user && user.role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [loading, router, user]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-sm text-slate-600">
        Carregando admin...
      </main>
    );
  }

  if (error || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-700">
          {error ?? "Sessao nao encontrada."}
        </div>
      </main>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          <AlertTriangle className="mb-3 h-5 w-5" aria-hidden="true" />
          Acesso administrativo restrito.
        </div>
      </main>
    );
  }

  return (
    <div className="dashboard-layout bg-slate-50 text-slate-950">
      <aside className="sidebar">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-sm font-semibold uppercase text-slate-950">
            PeppaBot Admin
          </p>
          <p className="mt-1 text-xs text-slate-500">{user.email}</p>
        </div>
        <nav className="space-y-1 px-3 py-4">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));

            return (
              <Link
                className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${
                  active
                    ? "bg-slate-950 text-white"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          <Link
            className="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            href="/dashboard"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao Dashboard
          </Link>
          <button
            className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
            onClick={logout}
            type="button"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </button>
        </nav>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-950">Admin</p>
            <p className="text-xs text-slate-500">Operação PeppaBot</p>
          </div>
          <ThemeToggle />
        </header>
        <div className="dashboard-content">{children}</div>
      </main>
    </div>
  );
}
