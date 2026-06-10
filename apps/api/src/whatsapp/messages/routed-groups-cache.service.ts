import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../prisma.service";

const ROUTED_GROUPS_CACHE_TTL_MS = 15_000;

type RoutedGroupsCacheEntry = {
  expiresAt: number;
  sourceGroupJids: Set<string>;
};

@Injectable()
export class RoutedGroupsCacheService {
  private readonly entries = new Map<string, RoutedGroupsCacheEntry>();
  private readonly generations = new Map<string, number>();
  private readonly pendingLoads = new Map<
    string,
    { generation: number; promise: Promise<Set<string>> }
  >();

  constructor(private readonly prisma: PrismaService) {}

  async isRouted(sessionId: string, sourceGroupJid: string): Promise<boolean> {
    const sourceGroupJids = await this.getSourceGroupJids(sessionId);

    return sourceGroupJids.has(sourceGroupJid);
  }

  invalidate(sessionId: string): void {
    this.entries.delete(sessionId);
    this.generations.set(sessionId, this.getGeneration(sessionId) + 1);
  }

  private async getSourceGroupJids(sessionId: string): Promise<Set<string>> {
    const cached = this.entries.get(sessionId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.sourceGroupJids;
    }

    const generation = this.getGeneration(sessionId);
    const pending = this.pendingLoads.get(sessionId);

    if (pending?.generation === generation) {
      return pending.promise;
    }

    const load = this.loadSourceGroupJids(sessionId, generation);
    this.pendingLoads.set(sessionId, { generation, promise: load });

    try {
      return await load;
    } finally {
      if (this.pendingLoads.get(sessionId)?.promise === load) {
        this.pendingLoads.delete(sessionId);
      }
    }
  }

  private async loadSourceGroupJids(
    sessionId: string,
    generation: number,
  ): Promise<Set<string>> {
    const routes = await this.prisma.messageRoute.findMany({
      where: {
        sessionId,
        isActive: true,
      },
      select: {
        sourceGroupJid: true,
      },
      distinct: ["sourceGroupJid"],
    });
    const sourceGroupJids = new Set(
      routes.map((route) => route.sourceGroupJid),
    );

    if (this.getGeneration(sessionId) === generation) {
      this.entries.set(sessionId, {
        expiresAt: Date.now() + ROUTED_GROUPS_CACHE_TTL_MS,
        sourceGroupJids,
      });
    }

    return sourceGroupJids;
  }

  private getGeneration(sessionId: string): number {
    return this.generations.get(sessionId) ?? 0;
  }
}
