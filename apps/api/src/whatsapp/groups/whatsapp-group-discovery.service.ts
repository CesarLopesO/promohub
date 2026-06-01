import { BadRequestException, Injectable } from "@nestjs/common";
import type { WhatsAppGroup } from "@prisma/client";
import type { GroupMetadata } from "@whiskeysockets/baileys";
import { isJidGroup, isJidNewsletter } from "@whiskeysockets/baileys";

import { PrismaService } from "../../prisma.service";
import type {
  WhatsAppGroupDto,
  WhatsAppGroupSyncResultDto,
} from "../dto/whatsapp-group.dto";
import { WhatsAppSessionManager } from "../session/whatsapp-session.manager";

@Injectable()
export class WhatsAppGroupDiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionManager: WhatsAppSessionManager,
  ) {}

  async listGroups(sessionRecordId: string): Promise<WhatsAppGroupDto[]> {
    const session = await this.sessionManager.readStatus(sessionRecordId);

    if (session.status !== "CONNECTED") {
      throw new BadRequestException(
        "WhatsApp session is not connected yet. Scan the QR Code before listing groups.",
      );
    }

    const groups = await this.prisma.whatsAppGroup.findMany({
      where: {
        sessionId: session.sessionId,
      },
      orderBy: {
        name: "asc",
      },
    });

    return groups.map((group) => this.toDto(group));
  }

  async syncGroups(
    sessionRecordId: string,
  ): Promise<WhatsAppGroupSyncResultDto> {
    const { session, socket } =
      await this.sessionManager.getConnectedSocket(sessionRecordId);
    const participatingGroups = await socket.groupFetchAllParticipating();
    const groupMetadata = Object.values(participatingGroups).filter((group) =>
      this.isDiscoverableGroup(group),
    );

    if (groupMetadata.length === 0) {
      return {
        sessionId: session.sessionId,
        syncedCount: 0,
        groups: [],
      };
    }

    await this.prisma.$transaction(
      groupMetadata.map((group) =>
        this.prisma.whatsAppGroup.upsert({
          where: {
            sessionId_groupJid: {
              sessionId: session.sessionId,
              groupJid: group.id,
            },
          },
          create: {
            sessionId: session.sessionId,
            groupJid: group.id,
            name: group.subject,
            participantCount: this.readParticipantCount(group),
            isCommunity: Boolean(group.isCommunity),
          },
          update: {
            name: group.subject,
            participantCount: this.readParticipantCount(group),
            isCommunity: Boolean(group.isCommunity),
          },
        }),
      ),
    );

    const groups = await this.prisma.whatsAppGroup.findMany({
      where: {
        sessionId: session.sessionId,
        groupJid: {
          in: groupMetadata.map((group) => group.id),
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return {
      sessionId: session.sessionId,
      syncedCount: groups.length,
      groups: groups.map((group) => this.toDto(group)),
    };
  }

  private isDiscoverableGroup(group: GroupMetadata): boolean {
    return Boolean(
      group.id &&
      isJidGroup(group.id) &&
      !isJidNewsletter(group.id) &&
      !group.isCommunityAnnounce,
    );
  }

  private readParticipantCount(group: GroupMetadata): number {
    return group.size ?? group.participants?.length ?? 0;
  }

  private toDto(group: WhatsAppGroup): WhatsAppGroupDto {
    return {
      id: group.id,
      sessionId: group.sessionId,
      groupJid: group.groupJid,
      name: group.name,
      participantCount: group.participantCount,
      isCommunity: group.isCommunity,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
