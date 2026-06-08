import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PROMOHUB",
  description: "Automacao para afiliados Amazon e Mercado Livre",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem("promohub.theme");
                if (theme !== "light" && theme !== "dark") {
                  theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
                }
                document.documentElement.classList.toggle("dark", theme === "dark");
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = theme;
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
