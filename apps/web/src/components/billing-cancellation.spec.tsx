import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("Billing cancellation", () => {
  it("shows customer billing details without the Asaas subscription ID", async () => {
    const page = await readFile(
      new URL("../../app/dashboard/billing/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /label="Plano"/);
    assert.match(page, /label="Status"/);
    assert.match(page, /label="Método de pagamento"/);
    assert.match(page, /label="Próxima renovação"/);
    assert.match(page, /label="Data de cancelamento"/);
    assert.doesNotMatch(page, /providerSubscriptionId/);
    assert.doesNotMatch(page, /Assinatura Asaas/);
  });

  it("places renewal cancellation under subscription management", async () => {
    const page = await readFile(
      new URL("../../app/dashboard/billing/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /<details[\s\S]*Gerenciar assinatura[\s\S]*<\/details>/);
    assert.match(page, />\s*Histórico\s*</);
    assert.match(page, />\s*Informações do plano\s*</);
    assert.match(page, /billing\.plan !== "FREE"/);
    assert.match(page, /billing\.status === "ACTIVE"/);
    assert.match(page, /!billing\.cancelAtPeriodEnd/);
    assert.match(page, />\s*Cancelar renovação automática\s*</);
    assert.doesNotMatch(page, />\s*Cancelar assinatura\s*</);

    const planOptionsIndex = page.indexOf("plans.map");
    const billingInfoIndex = page.indexOf("CPF/CNPJ para cobrança");
    const managementIndex = page.indexOf("Gerenciar assinatura");

    assert.ok(planOptionsIndex < managementIndex);
    assert.ok(billingInfoIndex < managementIndex);
  });

  it("confirms access until the period end and schedules cancellation", async () => {
    const page = await readFile(
      new URL("../../app/dashboard/billing/page.tsx", import.meta.url),
      "utf8",
    );

    assert.match(page, /method: "DELETE"/);
    assert.match(
      page,
      /Você manterá acesso ao plano até[\s\S]*voltará para o plano FREE\./,
    );
    assert.match(page, /Cancelamento agendado\. Acesso até \$\{formatDateOnly/);
  });
});
