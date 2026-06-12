export const DEFAULT_FREE_PLAN_SIGNATURE =
  "🤖 Automatizado por PeppaBot\nAutomação de grupos de ofertas e afiliados.";

export type CredentialTutorialSettings = {
  credentialTutorialAmazonTitle: string;
  credentialTutorialAmazonBody: string;
  credentialTutorialAmazonVideoUrl: string;
  credentialTutorialMercadoLivreTitle: string;
  credentialTutorialMercadoLivreBody: string;
  credentialTutorialMercadoLivreVideoUrl: string;
  credentialTutorialShopeeTitle: string;
  credentialTutorialShopeeBody: string;
  credentialTutorialShopeeVideoUrl: string;
  credentialTutorialAliExpressTitle: string;
  credentialTutorialAliExpressBody: string;
  credentialTutorialAliExpressVideoUrl: string;
  credentialTutorialMagazineLuizaTitle: string;
  credentialTutorialMagazineLuizaBody: string;
  credentialTutorialMagazineLuizaVideoUrl: string;
  credentialTutorialCasasBahiaTitle: string;
  credentialTutorialCasasBahiaBody: string;
  credentialTutorialCasasBahiaVideoUrl: string;
  credentialTutorialPontoTitle: string;
  credentialTutorialPontoBody: string;
  credentialTutorialPontoVideoUrl: string;
  credentialTutorialExtraTitle: string;
  credentialTutorialExtraBody: string;
  credentialTutorialExtraVideoUrl: string;
  credentialTutorialKabumTitle: string;
  credentialTutorialKabumBody: string;
  credentialTutorialKabumVideoUrl: string;
  credentialTutorialNetshoesTitle: string;
  credentialTutorialNetshoesBody: string;
  credentialTutorialNetshoesVideoUrl: string;
};

export type PublicSettings = CredentialTutorialSettings & {
  supportEmail: string;
  supportWhatsappUrl: string;
  freePlanSignature: string;
};

export type UpdateSettingsInput = Partial<
  Record<keyof CredentialTutorialSettings, unknown>
> & {
  supportEmail?: unknown;
  supportWhatsappUrl?: unknown;
  freePlanSignature?: unknown;
};
