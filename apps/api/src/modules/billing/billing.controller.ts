import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { PlanLimitsService } from "../plans/plan-limits.service";
import { BillingService } from "./billing.service";
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RateLimitGuard } from "../../common/security/rate-limit.guard";

@Controller("billing")
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: AuthenticatedRequest) {
    return this.billingService.me(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get("plans")
  plans() {
    return this.billingService.plans();
  }

  @UseGuards(JwtAuthGuard)
  @Get("usage")
  usage(@Req() req: AuthenticatedRequest) {
    return this.planLimits.getUsage(req.user.id);
  }

  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @Post("checkout")
  @RateLimit({
    name: "billing-checkout",
    limit: 10,
    windowMs: 60 * 60 * 1000,
    key: "user",
  })
  checkout(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: { plan?: unknown; cpfCnpj?: unknown; paymentMethod?: unknown },
  ) {
    return this.billingService.checkout(
      req.user.id,
      body.plan,
      body.cpfCnpj,
      body.paymentMethod,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get("subscription")
  subscription(@Req() req: AuthenticatedRequest) {
    return this.billingService.subscription(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("subscription")
  cancelSubscription(@Req() req: AuthenticatedRequest) {
    return this.billingService.cancel(req.user.id);
  }

  @Post("webhook/asaas")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    name: "billing-webhook-asaas",
    limit: 60,
    windowMs: 60 * 1000,
    key: "ip",
  })
  webhookAsaas(
    @Headers("asaas-access-token") token: string | undefined,
    @Body() body: unknown,
  ) {
    return this.billingService.handleAsaasWebhook(token, body);
  }
}
