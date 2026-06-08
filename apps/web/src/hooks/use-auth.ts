"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { apiFetch, clearToken, getToken } from "@/src/lib/api";

export type AuthUser = {
  id: string;
  email: string;
  role: string;
  plan: string;
  subscriptionStatus: string;
};

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    async function loadUser() {
      try {
        const me = await apiFetch<AuthUser>("/auth/me");

        if (!cancelled) {
          setUser(me);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao autenticar.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  return {
    user,
    loading,
    error,
    logout,
  };
}
