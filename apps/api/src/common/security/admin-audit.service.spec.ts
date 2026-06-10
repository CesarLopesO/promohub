import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GUARDS_METADATA } from "@nestjs/common/constants";

import { AdminGuard } from "../../modules/auth/admin.guard";
import { JwtAuthGuard } from "../../modules/auth/jwt.guard";
import { AdminAuditController } from "./admin-audit.controller";
import { AdminAuditService } from "./admin-audit.service";

describe("AdminAuditService", () => {
  it("protects audit logs with JWT and ADMIN guards", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminAuditController,
    ) as Array<new (...args: never[]) => unknown>;

    assert.ok(guards.includes(JwtAuthGuard));
    assert.ok(guards.includes(AdminGuard));
  });

  it("creates sanitized metadata without secrets", async () => {
    let stored: Record<string, unknown> | undefined;
    const service = new AdminAuditService(
      {
        adminAuditLog: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            stored = data;
            return data;
          },
        },
      } as never,
      { get: () => "true" } as never,
    );

    await service.record({
      adminUserId: "admin-1",
      action: "PATCH /admin/settings",
      targetType: "settings",
      metadata: {
        supportEmail: "support@example.com",
        JWT_SECRET: "jwt-secret",
        url: "https://provider.example/callback?access_token=url-secret",
        nested: { access_token: "provider-secret", cpfCnpj: "12345678909" },
      },
    });

    const serialized = JSON.stringify(stored);
    assert.match(serialized, /support@example.com/);
    assert.doesNotMatch(
      serialized,
      /jwt-secret|provider-secret|url-secret|12345678909/,
    );
    assert.match(serialized, /\[REDACTED\]/);
  });
});
