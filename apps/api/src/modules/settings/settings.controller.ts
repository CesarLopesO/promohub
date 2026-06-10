import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { SettingsService } from "./settings.service";
import type { UpdateSettingsInput } from "./settings.types";

@Controller("settings")
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get("public")
  publicSettings() {
    return this.settings.getPublicSettings();
  }
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/settings")
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  settingsList() {
    return this.settings.getAdminSettings();
  }

  @Patch()
  updateSettings(@Body() body: UpdateSettingsInput) {
    return this.settings.updateSettings(body);
  }
}
