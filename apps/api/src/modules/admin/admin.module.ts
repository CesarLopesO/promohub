import { Module } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";
import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { PlansModule } from "../plans/plans.module";
import { AffiliateModule } from "../affiliate/affiliate.module";
import { WorkerNodesModule } from "../workers/worker-nodes.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { AdminAuditController } from "../../common/security/admin-audit.controller";

@Module({
  imports: [
    AffiliateModule,
    AuthModule,
    BillingModule,
    PlansModule,
    WorkerNodesModule,
  ],
  controllers: [AdminController, AdminAuditController],
  providers: [PrismaService, AdminService],
})
export class AdminModule {}
