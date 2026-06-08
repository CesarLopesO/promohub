import { Module } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import { AuthModule } from "../auth/auth.module";
import { PlansModule } from "../plans/plans.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";

@Module({
  imports: [AuthModule, PlansModule],
  controllers: [BillingController],
  providers: [PrismaService, BillingService],
})
export class BillingModule {}
