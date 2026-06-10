import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";

export function SupportButton() {
  return (
    <Link
      aria-label="Abrir página de suporte"
      className="fixed bottom-4 right-4 z-[60] inline-flex h-12 items-center gap-2 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-950/20 transition-colors hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 sm:bottom-6 sm:right-6"
      href="/support"
    >
      <MessageCircleQuestion className="h-5 w-5" aria-hidden="true" />
      Suporte
    </Link>
  );
}
