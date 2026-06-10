import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lastValueFrom, of } from "rxjs";

import { AdminAuditInterceptor } from "./admin-audit.interceptor";

describe("AdminAuditInterceptor", () => {
  it("audits an admin support settings update", async () => {
    const entries: unknown[] = [];
    const interceptor = new AdminAuditInterceptor({
      record: async (entry: unknown) => entries.push(entry),
    } as never);
    const request = {
      method: "PATCH",
      path: "/admin/settings",
      url: "/admin/settings",
      route: { path: "/" },
      params: {},
      body: { supportEmail: "support@example.com" },
      headers: {},
      get: () => "test-agent",
      ip: "127.0.0.1",
      socket: {},
      user: { id: "admin-1", role: "ADMIN" },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as never;

    const result = await lastValueFrom(
      interceptor.intercept(context, { handle: () => of({ saved: true }) }),
    );

    assert.deepEqual(result, { saved: true });
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0], {
      adminUserId: "admin-1",
      action: "PATCH /admin/settings",
      targetType: "settings",
      targetId: undefined,
      metadata: {
        route: "/",
        body: { supportEmail: "support@example.com" },
      },
      ipAddress: "127.0.0.1",
      userAgent: "test-agent",
    });
  });
});
