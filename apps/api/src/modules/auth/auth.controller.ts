import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";

import { AuthService, LoginDto, RegisterDto } from "./auth.service";
import type { AuthenticatedRequest, AuthenticatedUser } from "./auth.types";
import { JwtAuthGuard } from "./jwt.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() body: RegisterDto): Promise<{ id: string; email: string }> {
    return this.authService.register(body);
  }

  @Post("login")
  login(@Body() body: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.login(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@Req() req: AuthenticatedRequest): Promise<AuthenticatedUser> {
    return this.authService.me(req.user.id);
  }
}
