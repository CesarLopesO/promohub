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

import {
  AffiliateCredentialDto,
  AffiliateCredentialsService,
} from "./affiliate-credentials.service";
import { CreateAffiliateCredentialDto } from "./dto/create-affiliate-credential.dto";
import { UpdateAffiliateCredentialDto } from "./dto/update-affiliate-credential.dto";

@Controller("affiliate/credentials")
export class AffiliateCredentialsController {
  constructor(
    private readonly credentialsService: AffiliateCredentialsService,
  ) {}

  @Post()
  create(
    @Body() body: CreateAffiliateCredentialDto,
  ): Promise<AffiliateCredentialDto> {
    return this.credentialsService.create(body);
  }

  @Get()
  list(@Query("userId") userId?: string): Promise<AffiliateCredentialDto[]> {
    return this.credentialsService.list(userId);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<AffiliateCredentialDto> {
    return this.credentialsService.findOne(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: UpdateAffiliateCredentialDto,
  ): Promise<AffiliateCredentialDto> {
    return this.credentialsService.update(id, body);
  }

  @Delete(":id")
  delete(@Param("id") id: string): Promise<AffiliateCredentialDto> {
    return this.credentialsService.softDelete(id);
  }
}
