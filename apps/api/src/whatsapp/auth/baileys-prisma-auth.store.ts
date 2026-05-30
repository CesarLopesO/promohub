import { Injectable } from "@nestjs/common";
import {
  BufferJSON,
  initAuthCreds,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../prisma.service";

const CREDS_TYPE = "creds";
const CREDS_KEY_ID = "creds";

@Injectable()
export class BaileysPrismaAuthStore {
  constructor(private readonly prisma: PrismaService) {}

  async getAuthState(userId: string): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
    clear: () => Promise<void>;
  }> {
    let creds = await this.readCreds(userId);

    if (!creds) {
      creds = initAuthCreds();
      await this.writeAuthValue(userId, CREDS_TYPE, CREDS_KEY_ID, creds);
    }

    const state: AuthenticationState = {
      creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[],
        ) => {
          const records = await this.prisma.whatsAppAuthState.findMany({
            where: {
              userId,
              type,
              keyId: {
                in: ids,
              },
            },
          });
          const values = {} as { [id: string]: SignalDataTypeMap[T] };

          for (const record of records) {
            values[record.keyId] = this.deserialize(
              record.value,
            ) as SignalDataTypeMap[T];
          }

          return values;
        },
        set: async (data: SignalDataSet) => {
          const operations: Prisma.PrismaPromise<unknown>[] = [];

          for (const [type, entries] of Object.entries(data)) {
            for (const [keyId, value] of Object.entries(entries ?? {})) {
              if (value === null) {
                operations.push(
                  this.prisma.whatsAppAuthState.deleteMany({
                    where: {
                      userId,
                      type,
                      keyId,
                    },
                  }),
                );
                continue;
              }

              operations.push(this.writeAuthValue(userId, type, keyId, value));
            }
          }

          if (operations.length > 0) {
            await this.prisma.$transaction(operations);
          }
        },
        clear: async () => {
          await this.clear(userId);
        },
      },
    };

    return {
      state,
      saveCreds: async () => {
        await this.writeAuthValue(
          userId,
          CREDS_TYPE,
          CREDS_KEY_ID,
          state.creds,
        );
      },
      clear: async () => {
        await this.clear(userId);
      },
    };
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.whatsAppAuthState.deleteMany({
      where: {
        userId,
      },
    });
  }

  private async readCreds(
    userId: string,
  ): Promise<AuthenticationCreds | undefined> {
    const record = await this.prisma.whatsAppAuthState.findUnique({
      where: {
        userId_type_keyId: {
          userId,
          type: CREDS_TYPE,
          keyId: CREDS_KEY_ID,
        },
      },
    });

    if (!record) {
      return undefined;
    }

    return this.deserialize(record.value) as AuthenticationCreds;
  }

  private writeAuthValue(
    userId: string,
    type: string,
    keyId: string,
    value: unknown,
  ) {
    const serialized = this.serialize(value);

    return this.prisma.whatsAppAuthState.upsert({
      where: {
        userId_type_keyId: {
          userId,
          type,
          keyId,
        },
      },
      create: {
        userId,
        type,
        keyId,
        value: serialized,
      },
      update: {
        value: serialized,
      },
    });
  }

  private serialize(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
  }

  private deserialize(value: Prisma.JsonValue): unknown {
    return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
  }
}
