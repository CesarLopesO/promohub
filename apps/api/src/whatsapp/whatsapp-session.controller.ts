import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
} from "@nestjs/common";

import { ConnectWhatsAppDto } from "./dto/connect-whatsapp.dto";
import type {
  WhatsAppGroupDto,
  WhatsAppGroupSyncResultDto,
} from "./dto/whatsapp-group.dto";
import type { WhatsAppSessionStatusDto } from "./dto/whatsapp-session-status.dto";
import { WhatsAppGroupDiscoveryService } from "./groups/whatsapp-group-discovery.service";
import { WhatsAppSessionManager } from "./session/whatsapp-session.manager";

@Controller("whatsapp/session")
export class WhatsAppSessionController {
  constructor(
    @Inject(WhatsAppSessionManager)
    private readonly sessionManager: WhatsAppSessionManager,
    private readonly groupDiscovery: WhatsAppGroupDiscoveryService,
  ) {}

  @Post()
  create(@Body() body: ConnectWhatsAppDto): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.createSession(body.userId, body.sessionId);
  }

  @Get(":id/status")
  status(@Param("id") id: string): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.readStatus(id);
  }

  @Get(":id/qr")
  qr(@Param("id") id: string) {
    return this.sessionManager.readQr(id);
  }

  @Get(":id/groups")
  groups(@Param("id") id: string): Promise<WhatsAppGroupDto[]> {
    return this.groupDiscovery.listGroups(id);
  }

  @Post(":id/groups/sync")
  syncGroups(@Param("id") id: string): Promise<WhatsAppGroupSyncResultDto> {
    return this.groupDiscovery.syncGroups(id);
  }

  @Delete(":id")
  delete(@Param("id") id: string): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.deleteSession(id);
  }
}
