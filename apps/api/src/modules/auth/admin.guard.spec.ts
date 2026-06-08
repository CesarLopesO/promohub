import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";

import { AdminGuard } from "./admin.guard";

describe("AdminGuard", () => {
  it("blocks a regular USER from admin endpoints", () => {
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: "user-id",
            role: "USER",
          },
        }),
      }),
    } as ExecutionContext;

    assert.throws(() => new AdminGuard().canActivate(context), ForbiddenException);
  });
});
