import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";

import { CreateMessageRouteDto } from "./dto/create-message-route.dto";
import { ForwardMessageRouteDto } from "./dto/forward-message-route.dto";
import { PreviewMessageRouteDto } from "./dto/preview-message-route.dto";
import { UpdateMessageRouteDto } from "./dto/update-message-route.dto";
import type { ForwardMessageResponseDto } from "./message-forwarding.service";
import {
  ForwardedMessageDto,
  MessageRouteDto,
  MessageRoutePreviewDto,
  MessageRoutesService,
} from "./message-routes.service";

@Controller("routes")
export class MessageRoutesController {
  constructor(private readonly routesService: MessageRoutesService) {}

  @Post()
  create(@Body() body: CreateMessageRouteDto): Promise<MessageRouteDto> {
    return this.routesService.create(body);
  }

  @Get()
  list(
    @Query("userId") userId?: string,
    @Query("sessionId") sessionId?: string,
  ): Promise<MessageRouteDto[]> {
    return this.routesService.list({ userId, sessionId });
  }

  @Get("forwarded")
  forwarded(@Query("userId") userId?: string): Promise<ForwardedMessageDto[]> {
    return this.routesService.listForwarded({ userId });
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<MessageRouteDto> {
    return this.routesService.findOne(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: UpdateMessageRouteDto,
  ): Promise<MessageRouteDto> {
    return this.routesService.update(id, body);
  }

  @Delete(":id")
  delete(@Param("id") id: string): Promise<MessageRouteDto> {
    return this.routesService.softDelete(id);
  }

  @Post("preview")
  preview(@Body() body: PreviewMessageRouteDto): Promise<MessageRoutePreviewDto> {
    return this.routesService.preview(body);
  }

  @Post("forward/:messageId")
  forward(
    @Param("messageId") messageId: string,
    @Body() body: ForwardMessageRouteDto,
  ): Promise<ForwardMessageResponseDto> {
    return this.routesService.forward(messageId, body);
  }
}
