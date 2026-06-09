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

  @UseGuards(JwtAuthGuard)
  @Post("checkout")
  checkout(
    @Req() req: AuthenticatedRequest,
    @Body() body: { plan?: unknown; cpfCnpj?: unknown },
  ) {
    return this.billingService.checkout(req.user.id, body.plan, body.cpfCnpj);
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
  webhookAsaas(
    @Headers("asaas-access-token") token: string | undefined,
    @Body() body: unknown,
  ) {
    return this.billingService.handleAsaasWebhook(token, body);
  }
}
