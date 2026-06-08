"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const THEME_KEY = "promohub.theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const storedTheme = readStoredTheme();
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
      .matches
      ? "dark"
      : "light";
    const initialTheme = storedTheme ?? systemTheme;

    setTheme(initialTheme);
    applyTheme(initialTheme);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme()) {
        return;
      }

      const nextTheme = event.matches ? "dark" : "light";
      setTheme(nextTheme);
      applyTheme(nextTheme);
    };

    media.addEventListener("change", onChange);

    return () => {
      media.removeEventListener("change", onChange);
    };
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";

    window.localStorage.setItem(THEME_KEY, nextTheme);
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      aria-label={
        theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"
      }
      className="theme-toggle"
      onClick={toggleTheme}
      title={theme === "dark" ? "Modo claro" : "Modo escuro"}
      type="button"
    >
      <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
    </button>
  );
}

function readStoredTheme(): Theme | null {
  const value = window.localStorage.getItem(THEME_KEY);

  return value === "light" || value === "dark" ? value : null;
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
