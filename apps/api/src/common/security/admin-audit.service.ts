import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma.service";
import { sanitizeSecurityMetadata } from "./request-security";

export type AdminAuditEntry = {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: unknown;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AdminAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  enabled(): boolean {
    return (
      this.config.get<string>("ADMIN_AUDIT_LOG_ENABLED", "true") !== "false"
    );
  }

  async record(entry: AdminAuditEntry): Promise<void> {
    if (!this.enabled()) {
      return;
    }

    const metadata = sanitizeSecurityMetadata(entry.metadata);
    await this.prisma.adminAuditLog.create({
      data: {
        adminUserId: entry.adminUserId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata:
          metadata === undefined
            ? undefined
            : (metadata as Prisma.InputJsonValue),
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  }

  list() {
    return this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        action: true,
        targetType: true,
        targetId: true,
        metadata: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        adminUser: {
          select: { id: true, email: true, name: true },
        },
      },
    });
  }
}
