import { createHmac } from "node:crypto";
import { ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";

export function hashReferralCpfCnpj(
  normalizedCpfCnpj: string,
  config: ConfigService,
): string {
  const pepper = config.get<string>("REFERRAL_CPF_HASH_PEPPER")?.trim();

  if (!pepper) {
    throw new ServiceUnavailableException(
      "Referral CPF/CNPJ hashing is not configured.",
    );
  }

  return createHmac("sha256", pepper).update(normalizedCpfCnpj).digest("hex");
}

export function maskCpfCnpj(normalizedCpfCnpj: string): string {
  return normalizedCpfCnpj.length === 11
    ? `***.***.***-${normalizedCpfCnpj.slice(-2)}`
    : `**.***.***/****-${normalizedCpfCnpj.slice(-2)}`;
}
