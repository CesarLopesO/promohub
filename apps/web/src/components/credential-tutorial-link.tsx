import { Video } from "lucide-react";

import { Button } from "@promohub/ui/button";

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

export const CREDENTIAL_TUTORIAL_MARKETPLACES = [
  {
    marketplace: "amazon",
    label: "Amazon",
    titleKey: "credentialTutorialAmazonTitle",
    bodyKey: "credentialTutorialAmazonBody",
    videoUrlKey: "credentialTutorialAmazonVideoUrl",
  },
  {
    marketplace: "mercado_livre",
    label: "Mercado Livre",
    titleKey: "credentialTutorialMercadoLivreTitle",
    bodyKey: "credentialTutorialMercadoLivreBody",
    videoUrlKey: "credentialTutorialMercadoLivreVideoUrl",
  },
  {
    marketplace: "shopee",
    label: "Shopee",
    titleKey: "credentialTutorialShopeeTitle",
    bodyKey: "credentialTutorialShopeeBody",
    videoUrlKey: "credentialTutorialShopeeVideoUrl",
  },
  {
    marketplace: "aliexpress",
    label: "AliExpress",
    titleKey: "credentialTutorialAliExpressTitle",
    bodyKey: "credentialTutorialAliExpressBody",
    videoUrlKey: "credentialTutorialAliExpressVideoUrl",
  },
  {
    marketplace: "magazine_luiza",
    label: "Magazine Luiza",
    titleKey: "credentialTutorialMagazineLuizaTitle",
    bodyKey: "credentialTutorialMagazineLuizaBody",
    videoUrlKey: "credentialTutorialMagazineLuizaVideoUrl",
  },
  {
    marketplace: "casas_bahia",
    label: "Casas Bahia",
    titleKey: "credentialTutorialCasasBahiaTitle",
    bodyKey: "credentialTutorialCasasBahiaBody",
    videoUrlKey: "credentialTutorialCasasBahiaVideoUrl",
  },
  {
    marketplace: "ponto",
    label: "Ponto",
    titleKey: "credentialTutorialPontoTitle",
    bodyKey: "credentialTutorialPontoBody",
    videoUrlKey: "credentialTutorialPontoVideoUrl",
  },
  {
    marketplace: "extra",
    label: "Extra",
    titleKey: "credentialTutorialExtraTitle",
    bodyKey: "credentialTutorialExtraBody",
    videoUrlKey: "credentialTutorialExtraVideoUrl",
  },
  {
    marketplace: "kabum",
    label: "Kabum",
    titleKey: "credentialTutorialKabumTitle",
    bodyKey: "credentialTutorialKabumBody",
    videoUrlKey: "credentialTutorialKabumVideoUrl",
  },
  {
    marketplace: "netshoes",
    label: "Netshoes",
    titleKey: "credentialTutorialNetshoesTitle",
    bodyKey: "credentialTutorialNetshoesBody",
    videoUrlKey: "credentialTutorialNetshoesVideoUrl",
  },
] as const satisfies ReadonlyArray<{
  marketplace: string;
  label: string;
  titleKey: keyof CredentialTutorialSettings;
  bodyKey: keyof CredentialTutorialSettings;
  videoUrlKey: keyof CredentialTutorialSettings;
}>;

export type TutorialMarketplace =
  (typeof CREDENTIAL_TUTORIAL_MARKETPLACES)[number]["marketplace"];

export const EMPTY_CREDENTIAL_TUTORIAL_SETTINGS =
  CREDENTIAL_TUTORIAL_MARKETPLACES.reduce<CredentialTutorialSettings>(
    (settings, { titleKey, bodyKey, videoUrlKey }) => {
      settings[titleKey] = "";
      settings[bodyKey] = "";
      settings[videoUrlKey] = "";
      return settings;
    },
    {} as CredentialTutorialSettings,
  );

export function pickCredentialTutorialSettings(
  settings: CredentialTutorialSettings,
): CredentialTutorialSettings {
  return CREDENTIAL_TUTORIAL_MARKETPLACES.reduce<CredentialTutorialSettings>(
    (tutorialSettings, { titleKey, bodyKey, videoUrlKey }) => {
      tutorialSettings[titleKey] = settings[titleKey] ?? "";
      tutorialSettings[bodyKey] = settings[bodyKey] ?? "";
      tutorialSettings[videoUrlKey] = settings[videoUrlKey] ?? "";
      return tutorialSettings;
    },
    {} as CredentialTutorialSettings,
  );
}

const MARKETPLACE_TUTORIAL_KEYS = Object.fromEntries(
  CREDENTIAL_TUTORIAL_MARKETPLACES.map(
    ({ marketplace, titleKey, bodyKey, videoUrlKey }) => [
      marketplace,
      { titleKey, bodyKey, videoUrlKey },
    ],
  ),
) as Record<
  TutorialMarketplace,
  {
    titleKey: keyof CredentialTutorialSettings;
    bodyKey: keyof CredentialTutorialSettings;
    videoUrlKey: keyof CredentialTutorialSettings;
  }
>;

export function CredentialTutorialContent({
  marketplace,
  settings,
}: {
  marketplace: TutorialMarketplace;
  settings: CredentialTutorialSettings;
}) {
  const { titleKey, bodyKey, videoUrlKey } =
    MARKETPLACE_TUTORIAL_KEYS[marketplace];
  const title = settings[titleKey];
  const body = settings[bodyKey];
  const videoUrl = settings[videoUrlKey];

  if (!title && !body && !videoUrl) {
    return null;
  }

  return (
    <section className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-4">
      {title || body ? (
        <h3 className="text-sm font-semibold text-slate-950">
          {title || "Como obter suas credenciais"}
        </h3>
      ) : null}
      {body ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
          {body}
        </p>
      ) : null}
      {videoUrl ? (
        <Button
          asChild
          className={title || body ? "mt-4" : undefined}
          type="button"
          variant="outline"
        >
          <a href={videoUrl} rel="noopener noreferrer" target="_blank">
            <Video className="h-4 w-4" aria-hidden="true" />
            Vídeo tutorial
          </a>
        </Button>
      ) : null}
    </section>
  );
}
