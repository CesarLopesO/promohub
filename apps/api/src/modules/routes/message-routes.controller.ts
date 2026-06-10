import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt.guard";
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
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RateLimitGuard } from "../../common/security/rate-limit.guard";

@UseGuards(JwtAuthGuard)
@Controller("routes")
export class MessageRoutesController {
  constructor(private readonly routesService: MessageRoutesService) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit({
    name: "routes-mutate",
    limit: 30,
    windowMs: 60 * 1000,
    key: "user",
  })
  create(
    @Body() body: CreateMessageRouteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MessageRouteDto> {
    return this.routesService.create({
      ...body,
      userId: req.user.id,
    });
  }

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query("sessionId") sessionId?: string,
  ): Promise<MessageRouteDto[]> {
    return this.routesService.list({ userId: req.user.id, sessionId });
  }

  @Get("forwarded")
  forwarded(@Req() req: AuthenticatedRequest): Promise<ForwardedMessageDto[]> {
    return this.routesService.listForwarded({ userId: req.user.id });
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<MessageRouteDto> {
    return this.routesService.findOne(id, req.user.id);
  }

  @Patch(":id")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    name: "routes-mutate",
    limit: 30,
    windowMs: 60 * 1000,
    key: "user",
  })
  update(
    @Param("id") id: string,
    @Body() body: UpdateMessageRouteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MessageRouteDto> {
    return this.routesService.update(id, body, req.user.id);
  }

  @Delete(":id")
  delete(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<MessageRouteDto> {
    return this.routesService.softDelete(id, req.user.id);
  }

  @Post("preview")
  preview(
    @Body() body: PreviewMessageRouteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<MessageRoutePreviewDto> {
    return this.routesService.preview({
      ...body,
      userId: req.user.id,
    });
  }

  @Post("forward/:messageId")
  forward(
    @Param("messageId") messageId: string,
    @Body() _body: ForwardMessageRouteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ForwardMessageResponseDto> {
    return this.routesService.forward(messageId, req.user.id);
  }
}
