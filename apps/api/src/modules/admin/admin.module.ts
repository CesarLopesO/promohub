import { Module } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import { AuthModule } from "../auth/auth.module";
import { PlansModule } from "../plans/plans.module";
import { AffiliateModule } from "../affiliate/affiliate.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [AffiliateModule, AuthModule, PlansModule],
  controllers: [AdminController],
  providers: [PrismaService, AdminService],
})
export class AdminModule {}
