import { Module } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import { AuthModule } from "../auth/auth.module";
import {
  AdminReferralsController,
  ReferralsController,
} from "./referrals.controller";
import { ReferralsEligibilityJob } from "./referrals.job";
import { ReferralsService } from "./referrals.service";

@Module({
  imports: [AuthModule],
  controllers: [ReferralsController, AdminReferralsController],
  providers: [PrismaService, ReferralsService, ReferralsEligibilityJob],
  exports: [ReferralsService],
})
export class ReferralsModule {}
