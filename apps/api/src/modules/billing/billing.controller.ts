import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { PlanLimitsService } from "../plans/plan-limits.service";
import { BillingService } from "./billing.service";

@UseGuards(JwtAuthGuard)
@Controller("billing")
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  @Get("me")
  me(@Req() req: AuthenticatedRequest) {
    return this.billingService.me(req.user.id);
  }

  @Get("plans")
  plans() {
    return this.billingService.plans();
  }

  @Get("usage")
  usage(@Req() req: AuthenticatedRequest) {
    return this.planLimits.getUsage(req.user.id);
  }

  @Post("checkout")
  checkout(@Req() req: AuthenticatedRequest, @Body() body: { plan?: unknown }) {
    return this.billingService.checkout(req.user.id, body.plan);
  }
}
