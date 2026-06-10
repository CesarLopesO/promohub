export const DEFAULT_FREE_PLAN_SIGNATURE =
  "🤖 Automatizado por PeppaBot\nAutomação de grupos de ofertas e afiliados.";

export type PublicSettings = {
  supportEmail: string;
  supportWhatsappUrl: string;
  freePlanSignature: string;
};

export type UpdateSettingsInput = {
  supportEmail?: unknown;
  supportWhatsappUrl?: unknown;
  freePlanSignature?: unknown;
};
