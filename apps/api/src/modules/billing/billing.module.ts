import { Module } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import { AuthModule } from "../auth/auth.module";
import { PlansModule } from "../plans/plans.module";
import { ReferralsModule } from "../referrals/referrals.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { AsaasService } from "./asaas.service";

@Module({
  imports: [AuthModule, PlansModule, ReferralsModule],
  controllers: [BillingController],
  providers: [PrismaService, AsaasService, BillingService],
})
export class BillingModule {}
