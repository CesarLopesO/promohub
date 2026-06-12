import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EMPTY_CREDENTIAL_TUTORIAL_SETTINGS,
  type CredentialTutorialSettings,
} from "./credential-tutorial-link";
import { UpcomingMarketplaceCard } from "./upcoming-marketplace-card";

const settings: CredentialTutorialSettings = {
  ...EMPTY_CREDENTIAL_TUTORIAL_SETTINGS,
  credentialTutorialAliExpressTitle: "Tutorial AliExpress",
  credentialTutorialAliExpressBody: "Acesse o portal.\nCopie a credencial.",
  credentialTutorialAliExpressVideoUrl: "https://video.example.com/aliexpress",
};

describe("UpcomingMarketplaceCard", () => {
  it("supports a tutorial link on an Em breve card", () => {
    const html = renderToStaticMarkup(
      <UpcomingMarketplaceCard
        label="AliExpress"
        marketplace="aliexpress"
        tutorialSettings={settings}
      />,
    );

    assert.match(html, /Em breve/);
    assert.match(html, /Tutorial AliExpress/);
    assert.match(html, /Acesse o portal/);
    assert.match(html, />Vídeo tutorial</);
    assert.match(html, /href="https:\/\/video\.example\.com\/aliexpress"/);
  });

  it("does not render a tutorial button without a URL", () => {
    const html = renderToStaticMarkup(
      <UpcomingMarketplaceCard
        label="Netshoes"
        marketplace="netshoes"
        tutorialSettings={settings}
      />,
    );

    assert.match(html, /Em breve/);
    assert.doesNotMatch(html, /Como obter suas credenciais/);
    assert.doesNotMatch(html, />Vídeo tutorial</);
  });
});
