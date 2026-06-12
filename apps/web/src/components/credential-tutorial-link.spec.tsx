import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CREDENTIAL_TUTORIAL_MARKETPLACES,
  CredentialTutorialContent,
  EMPTY_CREDENTIAL_TUTORIAL_SETTINGS,
  type CredentialTutorialSettings,
} from "./credential-tutorial-link";

const settings = CREDENTIAL_TUTORIAL_MARKETPLACES.reduce(
  (
    current,
    { marketplace, titleKey, bodyKey, videoUrlKey },
  ): CredentialTutorialSettings => ({
    ...current,
    [titleKey]: `Título ${marketplace}`,
    [bodyKey]: `Passo 1 ${marketplace}\nPasso 2 ${marketplace}`,
    [videoUrlKey]: `https://video.example.com/${marketplace}`,
  }),
  { ...EMPTY_CREDENTIAL_TUTORIAL_SETTINGS },
);

describe("CredentialTutorialContent", () => {
  it("uses the title, body and video configured for each marketplace", () => {
    for (const { marketplace } of CREDENTIAL_TUTORIAL_MARKETPLACES) {
      const html = renderToStaticMarkup(
        <CredentialTutorialContent
          marketplace={marketplace}
          settings={settings}
        />,
      );

      assert.match(html, new RegExp(`Título ${marketplace}`));
      assert.match(html, new RegExp(`Passo 1 ${marketplace}`));
      assert.match(
        html,
        new RegExp(`href="https://video\\.example\\.com/${marketplace}"`),
      );
      assert.match(html, />Vídeo tutorial</);
      assert.match(html, /target="_blank"/);
      assert.match(html, /rel="noopener noreferrer"/);
    }
  });

  it("hides written text when body and title are empty", () => {
    const html = renderToStaticMarkup(
      <CredentialTutorialContent
        marketplace="shopee"
        settings={{
          ...settings,
          credentialTutorialShopeeTitle: "",
          credentialTutorialShopeeBody: "",
        }}
      />,
    );

    assert.doesNotMatch(html, /Como obter suas credenciais/);
    assert.doesNotMatch(html, /Passo 1 shopee/);
    assert.match(html, />Vídeo tutorial</);
  });

  it("hides the video button when videoUrl is empty", () => {
    const html = renderToStaticMarkup(
      <CredentialTutorialContent
        marketplace="amazon"
        settings={{
          ...settings,
          credentialTutorialAmazonVideoUrl: "",
        }}
      />,
    );

    assert.match(html, /Título amazon/);
    assert.doesNotMatch(html, />Vídeo tutorial</);
  });

  it("does not show the previous hardcoded text after an admin override", () => {
    const html = renderToStaticMarkup(
      <CredentialTutorialContent
        marketplace="shopee"
        settings={{
          ...settings,
          credentialTutorialShopeeTitle: "Tutorial personalizado",
          credentialTutorialShopeeBody: "Instruções definidas pelo admin.",
        }}
      />,
    );

    assert.match(html, /Tutorial personalizado/);
    assert.match(html, /Instruções definidas pelo admin/);
    assert.doesNotMatch(html, /Como obter suas credenciais Shopee/);
  });

  it("renders body content as escaped text", () => {
    const html = renderToStaticMarkup(
      <CredentialTutorialContent
        marketplace="amazon"
        settings={{
          ...settings,
          credentialTutorialAmazonBody: "<script>alert(1)</script>",
        }}
      />,
    );

    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
  });
});
