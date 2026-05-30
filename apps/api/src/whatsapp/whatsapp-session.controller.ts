import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";

import { ConnectWhatsAppDto } from "./dto/connect-whatsapp.dto";
import type { WhatsAppSessionStatusDto } from "./dto/whatsapp-session-status.dto";
import { WhatsAppSessionManager } from "./session/whatsapp-session.manager";

@Controller("whatsapp/sessions")
export class WhatsAppSessionController {
  constructor(
    @Inject(WhatsAppSessionManager)
    private readonly sessionManager: WhatsAppSessionManager,
  ) {}

  @Post("connect")
  connect(@Body() body: ConnectWhatsAppDto): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.connect(body.userId);
  }

  @Get(":userId/status")
  status(@Param("userId") userId: string): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.readStatus(userId);
  }

  @Post(":userId/disconnect")
  disconnect(
    @Param("userId") userId: string,
  ): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.disconnect(userId);
  }
}
