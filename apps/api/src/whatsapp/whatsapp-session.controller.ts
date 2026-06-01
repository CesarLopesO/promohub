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
import type { WhatsAppSessionStatusDto } from "./dto/whatsapp-session-status.dto";
import { WhatsAppSessionManager } from "./session/whatsapp-session.manager";

@Controller("whatsapp/session")
export class WhatsAppSessionController {
  constructor(
    @Inject(WhatsAppSessionManager)
    private readonly sessionManager: WhatsAppSessionManager,
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

  @Delete(":id")
  delete(@Param("id") id: string): Promise<WhatsAppSessionStatusDto> {
    return this.sessionManager.deleteSession(id);
  }
}
