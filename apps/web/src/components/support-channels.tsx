import { ExternalLink, Mail, MessageCircle } from "lucide-react";

import { Button } from "@promohub/ui/button";

export type SupportSettings = {
  supportEmail: string;
  supportWhatsappUrl: string;
  freePlanSignature: string;
};

export function SupportChannels({
  supportEmail,
  supportWhatsappUrl,
}: SupportSettings) {
  if (!supportEmail && !supportWhatsappUrl) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-600">
        Nenhum canal de suporte configurado no momento.
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {supportEmail ? (
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Mail className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-slate-950">Email</h2>
          <p className="mt-2 break-all text-sm text-slate-600">
            {supportEmail}
          </p>
          <Button asChild className="mt-6 w-full sm:w-fit">
            <a href={`mailto:${supportEmail}`}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              Enviar email
            </a>
          </Button>
        </article>
      ) : null}

      {supportWhatsappUrl ? (
        <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-slate-950">
            WhatsApp
          </h2>
          <p className="mt-2 text-sm text-slate-600">Falar no WhatsApp</p>
          <Button asChild className="mt-6 w-full sm:w-fit">
            <a
              href={supportWhatsappUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Falar no WhatsApp
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        </article>
      ) : null}
    </div>
  );
}
