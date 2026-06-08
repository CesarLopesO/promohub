import { Module } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import { PlanLimitsService } from "./plan-limits.service";

@Module({
  providers: [PrismaService, PlanLimitsService],
  exports: [PlanLimitsService],
})
export class PlansModule {}
