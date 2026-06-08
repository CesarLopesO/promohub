import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "../modules/auth/auth.types";
import { JwtAuthGuard } from "../modules/auth/jwt.guard";
import { ConnectWhatsAppDto } from "./dto/connect-whatsapp.dto";
import type {
  WhatsAppGroupDto,
  WhatsAppGroupSyncResultDto,
} from "./dto/whatsapp-group.dto";
import type { WhatsAppSessionStatusDto } from "./dto/whatsapp-session-status.dto";
import { WhatsAppGroupDiscoveryService } from "./groups/whatsapp-group-discovery.service";
import { WhatsAppSessionManager } from "./session/whatsapp-session.manager";
import type { WhatsAppSessionDebugDto } from "./session/whatsapp-session.manager";

@UseGuards(JwtAuthGuard)
@Controller("whatsapp/session")
export class WhatsAppSessionController {
  constructor(
    @Inject(WhatsAppSessionManager)
    private readonly sessionManager: WhatsAppSessionManager,
    private readonly groupDiscovery: WhatsAppGroupDiscoveryService,
  ) {}

  @Post()
  create(
    @Body() body: ConnectWhatsAppDto = {},
    @Req() req: AuthenticatedRequest,
  ): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.createSession(req.user.id, body.sessionId);
  }

  @Get(":id/status")
  status(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.readStatus(id, req.user.id);
  }

  @Get(":id/qr")
  qr(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.sessionManager.readQr(id, req.user.id);
  }

  @Get(":id/groups")
  groups(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WhatsAppGroupDto[]> {
    return this.groupDiscovery.listGroups(id, req.user.id);
  }

  @Get(":id/debug")
  debug(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WhatsAppSessionDebugDto> {
    return this.sessionManager.readDebug(id, req.user.id);
  }

  @Post(":id/reconnect")
  reconnect(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.reconnectSession(id, req.user.id);
  }

  @Post(":id/groups/sync")
  syncGroups(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WhatsAppGroupSyncResultDto> {
    return this.groupDiscovery.syncGroups(id, req.user.id);
  }

  @Delete(":id")
  delete(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.deleteSession(id, req.user.id);
  }
}

@UseGuards(JwtAuthGuard)
@Controller("whatsapp")
export class WhatsAppSessionsController {
  constructor(
    @Inject(WhatsAppSessionManager)
    private readonly sessionManager: WhatsAppSessionManager,
  ) {}

  @Get("sessions")
  list(@Req() req: AuthenticatedRequest): Promise<WhatsAppSessionStatusDto[]> {
    return this.sessionManager.listSessions(req.user.id);
  }
}
