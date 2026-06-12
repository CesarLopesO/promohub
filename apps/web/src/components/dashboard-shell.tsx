"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Gauge,
  Gift,
  KeyRound,
  LogOut,
  CreditCard,
  Menu,
  Route,
  Shield,
  Smartphone,
  Users,
} from "lucide-react";

import { Button } from "@promohub/ui/button";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { useAuth } from "@/src/hooks/use-auth";

const navItems = [
  { href: "/dashboard", label: "Visão geral", icon: Gauge },
  { href: "/dashboard/whatsapp", label: "WhatsApp", icon: Smartphone },
  { href: "/dashboard/groups", label: "Grupos", icon: Users },
  { href: "/dashboard/routes", label: "Rotas", icon: Route },
  { href: "/dashboard/credentials", label: "Credenciais", icon: KeyRound },
  { href: "/dashboard/billing", label: "Plano", icon: CreditCard },
  { href: "/dashboard/referrals", label: "Indique e Ganhe", icon: Gift },
];

const adminNavItem = { href: "/admin", label: "Admin", icon: Shield };

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, error, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-sm text-slate-600">
        Carregando sessao...
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

  return (
    <div className="dashboard-layout bg-slate-50 text-slate-950">
      <aside className="sidebar">
        <SidebarContent
          isAdmin={user.role === "ADMIN"}
          pathname={pathname}
          onLogout={logout}
        />
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <button
            className="dashboard-menu-button"
            onClick={() => setMobileMenuOpen(true)}
            type="button"
          >
            <Menu className="h-4 w-4" aria-hidden="true" />
            Menu
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-950">
              {user.email}
            </p>
            <p className="text-xs text-slate-500">Plano atual: {user.plan}</p>
          </div>
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/dashboard/billing">Fazer upgrade</Link>
          </Button>
        </header>

        <div className="dashboard-content">{children}</div>
      </main>

      {mobileMenuOpen ? (
        <div className="dashboard-mobile-menu">
          <button
            aria-label="Fechar menu"
            className="dashboard-mobile-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
          <aside className="dashboard-mobile-sidebar">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="text-sm font-semibold uppercase text-slate-950">
                  PeppaBot
                </p>
                <p className="mt-1 text-xs text-slate-500">Menu</p>
              </div>
              <button
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
                onClick={() => setMobileMenuOpen(false)}
                type="button"
              >
                Fechar
              </button>
            </div>
            <DashboardNav
              isAdmin={user.role === "ADMIN"}
              onNavigate={() => setMobileMenuOpen(false)}
              onLogout={() => {
                setMobileMenuOpen(false);
                logout();
              }}
              pathname={pathname}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function SidebarContent({
  isAdmin,
  pathname,
  onLogout,
}: {
  isAdmin: boolean;
  pathname: string;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="border-b border-slate-200 px-6 py-5">
        <p className="text-sm font-semibold uppercase text-slate-950">
          PeppaBot
        </p>
        <p className="mt-1 text-xs text-slate-500">User Dashboard</p>
      </div>
      <DashboardNav isAdmin={isAdmin} pathname={pathname} onLogout={onLogout} />
    </>
  );
}

function DashboardNav({
  isAdmin,
  pathname,
  onLogout,
  onNavigate,
}: {
  isAdmin: boolean;
  pathname: string;
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  const items = isAdmin ? [...navItems, adminNavItem] : navItems;

  return (
    <nav className="space-y-1 px-3 py-4">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));

        return (
          <Link
            className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium ${
              active
                ? "bg-slate-950 text-white"
                : "text-slate-700 hover:bg-slate-100"
            }`}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
      <button
        className="flex h-10 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
        onClick={onLogout}
        type="button"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sair
      </button>
    </nav>
  );
}
