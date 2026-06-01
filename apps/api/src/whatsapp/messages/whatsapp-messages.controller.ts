import { Controller, Get, Param, Query } from "@nestjs/common";

import type {
  WhatsAppMessageDto,
  WhatsAppMessageListDto,
} from "../dto/whatsapp-message.dto";
import { WhatsAppMessagesService } from "./whatsapp-messages.service";

type MessageQueryParams = {
  groupJid?: string;
  includeRaw?: string;
  limit?: string;
  page?: string;
};

@Controller("whatsapp/session/:id/messages")
export class WhatsAppMessagesController {
  constructor(private readonly messagesService: WhatsAppMessagesService) {}

  @Get()
  list(
    @Param("id") id: string,
    @Query() query: MessageQueryParams,
  ): Promise<WhatsAppMessageListDto> {
    return this.messagesService.listMessages(id, query);
  }

  @Get("recent")
  recent(
    @Param("id") id: string,
    @Query("includeRaw") includeRaw?: string,
  ): Promise<WhatsAppMessageDto[]> {
    return this.messagesService.listRecentMessages(id, includeRaw === "true");
  }
}
