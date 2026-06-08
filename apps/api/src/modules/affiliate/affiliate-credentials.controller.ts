import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt.guard";
import {
  AffiliateCredentialDto,
  AffiliateCredentialsService,
} from "./affiliate-credentials.service";
import { CreateAffiliateCredentialDto } from "./dto/create-affiliate-credential.dto";
import { UpdateAffiliateCredentialDto } from "./dto/update-affiliate-credential.dto";

@UseGuards(JwtAuthGuard)
@Controller("affiliate/credentials")
export class AffiliateCredentialsController {
  constructor(
    private readonly credentialsService: AffiliateCredentialsService,
  ) {}

  @Post()
  create(
    @Body() body: CreateAffiliateCredentialDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AffiliateCredentialDto> {
    return this.credentialsService.create({
      ...body,
      userId: req.user.id,
    });
  }

  @Get()
  list(@Req() req: AuthenticatedRequest): Promise<AffiliateCredentialDto[]> {
    return this.credentialsService.list(req.user.id);
  }

  @Get(":id")
  findOne(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AffiliateCredentialDto> {
    return this.credentialsService.findOne(id, req.user.id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: UpdateAffiliateCredentialDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<AffiliateCredentialDto> {
    return this.credentialsService.update(id, body, req.user.id);
  }

  @Delete(":id")
  delete(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<AffiliateCredentialDto> {
    return this.credentialsService.softDelete(id, req.user.id);
  }
}
