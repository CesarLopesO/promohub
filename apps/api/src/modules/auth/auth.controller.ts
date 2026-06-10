import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { AuthService, LoginDto, RegisterDto } from "./auth.service";
import type { AuthenticatedRequest, AuthenticatedUser } from "./auth.types";
import { JwtAuthGuard } from "./jwt.guard";
import { RateLimit } from "../../common/security/rate-limit.decorator";
import { RateLimitGuard } from "../../common/security/rate-limit.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    name: "auth-register",
    limit: 5,
    windowMs: 60 * 60 * 1000,
    key: "ip",
  })
  register(
    @Body() body: RegisterDto,
    @Query("ref") ref?: string,
  ): Promise<{ id: string; email: string }> {
    return this.authService.register({
      ...body,
      ref: ref ?? body.ref,
    });
  }

  @Post("login")
  @UseGuards(RateLimitGuard)
  @RateLimit({
    name: "auth-login",
    limit: 5,
    windowMs: 60 * 1000,
    key: "ip-email",
  })
  login(@Body() body: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.login(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: AuthenticatedRequest): Promise<AuthenticatedUser> {
    return this.authService.me(req.user.id);
  }
}
