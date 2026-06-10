import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { redactLogValue } from "./log-redaction";

describe("log redaction", () => {
  it("redacts secrets, tokens, CPF and CNPJ", () => {
    process.env.JWT_SECRET = "jwt-production-secret";
    const result = String(
      redactLogValue(
        'jwt-production-secret ssid="session-secret" access_token=provider-token cpf=123.456.789-09 cnpj=12.345.678/0001-81',
      ),
    );

    assert.doesNotMatch(
      result,
      /jwt-production-secret|session-secret|provider-token|123\.456|12\.345/,
    );
    assert.match(result, /\[REDACTED\]/);
  });
});
