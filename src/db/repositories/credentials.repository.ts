import {
  type Prisma,
  type ProviderCredential,
  type WorkbenchSettings,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeSpacePersistence } from './space.repository';

const CREDENTIAL_SECRET_ALGORITHM = 'aes-256-gcm';

export type PersistedDefaultImportTarget =
  | 'personal-library'
  | 'project-workspace';

export interface PersistedEncryptedSecretRecord {
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
}

export interface PersistedCredentialRecord {
  createdAt: string;
  credentialRef: string;
  provider: string;
  updatedAt: string;
  userId: string;
}

export interface PersistedCredentialWithSecretRecord
  extends PersistedCredentialRecord,
    PersistedEncryptedSecretRecord {}

export interface CreatePersistedCredentialParams {
  createdAt?: string;
  credentialRef: string;
  encryptedSecret: PersistedEncryptedSecretRecord;
  provider: string;
  userId: string;
}

export interface CredentialSecretLookup {
  credentialRef: string;
  userId: string;
}

export interface PersistedWorkbenchSettingsRecord {
  createdAt: string;
  credentialRef: string | null;
  defaultImportTarget: PersistedDefaultImportTarget;
  updatedAt: string;
  userId: string;
}

export interface UpsertWorkbenchSettingsParams {
  createdAt?: string;
  credentialRef: string | null;
  defaultImportTarget: PersistedDefaultImportTarget;
  updatedAt?: string;
  userId: string;
}

export interface LegacyCredentialBootstrapInput
  extends PersistedEncryptedSecretRecord {
  createdAt: string;
  credentialRef: string;
  provider: string;
  userId: string;
}

export interface LegacyWorkbenchSettingsBootstrapInput {
  credentialRef: string | null;
  defaultImportTarget: PersistedDefaultImportTarget;
  updatedAt: string;
  userId: string;
}

export interface BootstrapLegacyCredentialAuthorityInput {
  credentials: LegacyCredentialBootstrapInput[];
  workbenchSettings: LegacyWorkbenchSettingsBootstrapInput[];
}

export interface CredentialsRepository {
  bootstrapLegacyAuthority(
    input: BootstrapLegacyCredentialAuthorityInput,
  ): Promise<void>;
  createCredential(
    input: CreatePersistedCredentialParams,
  ): Promise<PersistedCredentialRecord>;
  replaceCredentialSecret(input: {
    credentialRef: string;
    encryptedSecret: PersistedEncryptedSecretRecord;
    userId: string;
  }): Promise<PersistedCredentialWithSecretRecord>;
  getCredentialForUser(
    query: CredentialSecretLookup,
  ): Promise<PersistedCredentialWithSecretRecord | null>;
  getCredentialByRef(
    credentialRef: string,
  ): Promise<PersistedCredentialWithSecretRecord | null>;
  getWorkbenchSettings(
    userId: string,
  ): Promise<PersistedWorkbenchSettingsRecord | null>;
  hasStoredCredentials(): Promise<boolean>;
  listCredentialsForUser(userId: string): Promise<PersistedCredentialRecord[]>;
  upsertWorkbenchSettings(
    input: UpsertWorkbenchSettingsParams,
  ): Promise<PersistedWorkbenchSettingsRecord>;
}

type TransactionClient = Prisma.TransactionClient;
type CredentialsClient = JixiaPrismaClient | TransactionClient;

const PROVIDER_CREDENTIAL_WITH_SECRET = {
  secret: true,
} satisfies Prisma.ProviderCredentialInclude;

type ProviderCredentialWithSecret = Prisma.ProviderCredentialGetPayload<{
  include: typeof PROVIDER_CREDENTIAL_WITH_SECRET;
}>;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function optionalDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function mapCredential(
  credential: ProviderCredential,
): PersistedCredentialRecord {
  return {
    createdAt: toIsoString(credential.createdAt),
    credentialRef: credential.id,
    provider: credential.provider,
    updatedAt: toIsoString(credential.updatedAt),
    userId: credential.userId,
  };
}

function mapCredentialWithSecret(
  credential: ProviderCredentialWithSecret,
): PersistedCredentialWithSecretRecord | null {
  if (!credential.secret) {
    return null;
  }

  return {
    ...mapCredential(credential),
    encryptedSecret: credential.secret.encryptedSecret,
    encryptionIv: credential.secret.encryptionIv,
    encryptionTag: credential.secret.encryptionTag,
  };
}

function mapWorkbenchSettings(
  settings: WorkbenchSettings,
): PersistedWorkbenchSettingsRecord {
  return {
    createdAt: toIsoString(settings.createdAt),
    credentialRef: settings.credentialRef,
    defaultImportTarget:
      settings.defaultImportTarget as PersistedDefaultImportTarget,
    updatedAt: toIsoString(settings.updatedAt),
    userId: settings.userId,
  };
}

async function ensureUser(
  prisma: CredentialsClient,
  userId: string,
): Promise<void> {
  await prisma.user.upsert({
    create: {
      displayName: userId,
      email: `${userId}@jixia.local`,
      id: userId,
    },
    update: { updatedAt: new Date() },
    where: { id: userId },
  });
}

async function readTableColumns(
  prisma: JixiaPrismaClient,
  tableName: string,
): Promise<Set<string>> {
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${tableName}")`,
  );

  return new Set(columns.map((column) => column.name));
}

async function assertRequiredColumns(
  prisma: JixiaPrismaClient,
  tableName: string,
  requiredColumns: string[],
): Promise<void> {
  const availableColumns = await readTableColumns(prisma, tableName);

  for (const requiredColumn of requiredColumns) {
    if (!availableColumns.has(requiredColumn)) {
      throw new Error(
        `Credential persistence requires ${tableName}.${requiredColumn}. Existing SQLite schema is too old for the credentials/settings Prisma authority cutover.`,
      );
    }
  }
}

async function ensureCredentialReference(
  prisma: CredentialsClient,
  input: {
    createdAt?: string;
    credentialRef: string;
    provider: string;
    userId: string;
  },
): Promise<ProviderCredential> {
  await ensureUser(prisma, input.userId);

  const existingCredential = await prisma.providerCredential.findUnique({
    where: { id: input.credentialRef },
  });

  if (existingCredential) {
    if (existingCredential.userId !== input.userId) {
      throw new Error(
        `Credential ${input.credentialRef} already belongs to another user.`,
      );
    }

    return existingCredential;
  }

  return prisma.providerCredential.create({
    data: {
      createdAt: optionalDate(input.createdAt),
      id: input.credentialRef,
      provider: input.provider,
      secretRef: input.credentialRef,
      userId: input.userId,
    },
  });
}

export async function initializeCredentialPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeSpacePersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProviderCredential" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "secretRef" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProviderCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProviderCredential_userId_provider_idx" ON "ProviderCredential"("userId", "provider")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProviderCredentialSecret" (
      "credentialRef" TEXT NOT NULL PRIMARY KEY,
      "encryptedSecret" TEXT NOT NULL,
      "encryptionIv" TEXT NOT NULL,
      "encryptionTag" TEXT NOT NULL,
      "algorithm" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProviderCredentialSecret_credentialRef_fkey" FOREIGN KEY ("credentialRef") REFERENCES "ProviderCredential" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WorkbenchSettings" (
      "userId" TEXT NOT NULL PRIMARY KEY,
      "credentialRef" TEXT,
      "defaultImportTarget" TEXT NOT NULL DEFAULT 'personal-library',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "WorkbenchSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "WorkbenchSettings_credentialRef_fkey" FOREIGN KEY ("credentialRef") REFERENCES "ProviderCredential" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "WorkbenchSettings_credentialRef_idx" ON "WorkbenchSettings"("credentialRef")
  `);

  await assertRequiredColumns(prisma, 'ProviderCredential', [
    'id',
    'userId',
    'provider',
    'secretRef',
  ]);
  await assertRequiredColumns(prisma, 'ProviderCredentialSecret', [
    'credentialRef',
    'encryptedSecret',
    'encryptionIv',
    'encryptionTag',
    'algorithm',
  ]);
  await assertRequiredColumns(prisma, 'WorkbenchSettings', [
    'userId',
    'credentialRef',
    'defaultImportTarget',
  ]);
}

export function createCredentialsRepository(
  prisma: JixiaPrismaClient,
): CredentialsRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeCredentialPersistence(prisma);
    await initialized;
  }

  return {
    async bootstrapLegacyAuthority(
      input: BootstrapLegacyCredentialAuthorityInput,
    ): Promise<void> {
      await ensureInitialized();
      const seenCredentialRefs = new Set<string>();

      for (const credential of input.credentials) {
        if (seenCredentialRefs.has(credential.credentialRef)) {
          continue;
        }

        seenCredentialRefs.add(credential.credentialRef);

        await prisma.$transaction(async (transaction) => {
          await ensureCredentialReference(transaction, credential);

          const existingSecret = await transaction.providerCredentialSecret.findUnique({
            where: { credentialRef: credential.credentialRef },
          });

          if (!existingSecret) {
            await transaction.providerCredentialSecret.create({
              data: {
                algorithm: CREDENTIAL_SECRET_ALGORITHM,
                createdAt: optionalDate(credential.createdAt),
                credentialRef: credential.credentialRef,
                encryptedSecret: credential.encryptedSecret,
                encryptionIv: credential.encryptionIv,
                encryptionTag: credential.encryptionTag,
              },
            });
          }
        });
      }

      for (const settings of input.workbenchSettings) {
        const existingSettings = await prisma.workbenchSettings.findUnique({
          where: { userId: settings.userId },
        });

        if (existingSettings) {
          continue;
        }

        await ensureUser(prisma, settings.userId);

        const credentialRef = settings.credentialRef
          ? await prisma.providerCredential.findFirst({
              where: {
                id: settings.credentialRef,
                userId: settings.userId,
              },
            }).then((credential) => credential?.id ?? null)
          : null;

        await prisma.workbenchSettings.create({
          data: {
            createdAt: optionalDate(settings.updatedAt),
            credentialRef,
            defaultImportTarget: settings.defaultImportTarget,
            updatedAt: optionalDate(settings.updatedAt) ?? new Date(),
            userId: settings.userId,
          },
        });
      }
    },
    async createCredential(
      input: CreatePersistedCredentialParams,
    ): Promise<PersistedCredentialRecord> {
      await ensureInitialized();

      const credential = await prisma.$transaction(async (transaction) => {
        const createdCredential = await ensureCredentialReference(transaction, input);

        const existingSecret = await transaction.providerCredentialSecret.findUnique({
          where: { credentialRef: input.credentialRef },
        });

        if (existingSecret) {
          throw new Error(
            `Credential ${input.credentialRef} already has stored secret material.`,
          );
        }

        await transaction.providerCredentialSecret.create({
          data: {
            algorithm: CREDENTIAL_SECRET_ALGORITHM,
            createdAt: optionalDate(input.createdAt),
            credentialRef: input.credentialRef,
            encryptedSecret: input.encryptedSecret.encryptedSecret,
            encryptionIv: input.encryptedSecret.encryptionIv,
            encryptionTag: input.encryptedSecret.encryptionTag,
          },
        });

        return createdCredential;
      });

      return mapCredential(credential);
    },
    async replaceCredentialSecret(input): Promise<PersistedCredentialWithSecretRecord> {
      await ensureInitialized();

      const credential = await prisma.$transaction(async (transaction) => {
        const existingCredential = await transaction.providerCredential.findUnique({
          include: PROVIDER_CREDENTIAL_WITH_SECRET,
          where: { id: input.credentialRef },
        });

        if (!existingCredential || existingCredential.userId !== input.userId) {
          throw new Error(
            `Credential ${input.credentialRef} does not belong to actor ${input.userId}.`,
          );
        }

        if (existingCredential.secret) {
          await transaction.providerCredentialSecret.update({
            data: {
              encryptedSecret: input.encryptedSecret.encryptedSecret,
              encryptionIv: input.encryptedSecret.encryptionIv,
              encryptionTag: input.encryptedSecret.encryptionTag,
            },
            where: { credentialRef: input.credentialRef },
          });
        } else {
          await transaction.providerCredentialSecret.create({
            data: {
              algorithm: CREDENTIAL_SECRET_ALGORITHM,
              credentialRef: input.credentialRef,
              encryptedSecret: input.encryptedSecret.encryptedSecret,
              encryptionIv: input.encryptedSecret.encryptionIv,
              encryptionTag: input.encryptedSecret.encryptionTag,
            },
          });
        }

        return transaction.providerCredential.findUnique({
          include: PROVIDER_CREDENTIAL_WITH_SECRET,
          where: { id: input.credentialRef },
        });
      });

      if (!credential) {
        throw new Error(
          `Credential ${input.credentialRef} disappeared while replacing secret material.`,
        );
      }

      const persistedCredential = mapCredentialWithSecret(credential);

      if (!persistedCredential) {
        throw new Error(
          `Credential ${input.credentialRef} is missing encrypted secret material after replacement.`,
        );
      }

      return persistedCredential;
    },
    async getCredentialForUser(
      query: CredentialSecretLookup,
    ): Promise<PersistedCredentialWithSecretRecord | null> {
      await ensureInitialized();

      const credential = await prisma.providerCredential.findFirst({
        include: PROVIDER_CREDENTIAL_WITH_SECRET,
        where: {
          id: query.credentialRef,
          userId: query.userId,
        },
      });

      if (!credential) {
        return null;
      }

      return mapCredentialWithSecret(credential);
    },
    async getCredentialByRef(
      credentialRef: string,
    ): Promise<PersistedCredentialWithSecretRecord | null> {
      await ensureInitialized();

      const credential = await prisma.providerCredential.findUnique({
        include: PROVIDER_CREDENTIAL_WITH_SECRET,
        where: { id: credentialRef },
      });

      if (!credential) {
        return null;
      }

      return mapCredentialWithSecret(credential);
    },
    async getWorkbenchSettings(
      userId: string,
    ): Promise<PersistedWorkbenchSettingsRecord | null> {
      await ensureInitialized();

      const settings = await prisma.workbenchSettings.findUnique({
        include: { credential: true },
        where: { userId },
      });

      if (!settings) {
        return null;
      }

      return mapWorkbenchSettings({
        ...settings,
        credentialRef: settings.credential ? settings.credentialRef : null,
      });
    },
    async hasStoredCredentials(): Promise<boolean> {
      await ensureInitialized();

      return (await prisma.providerCredentialSecret.count()) > 0;
    },
    async listCredentialsForUser(
      userId: string,
    ): Promise<PersistedCredentialRecord[]> {
      await ensureInitialized();

      const credentials = await prisma.providerCredential.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        where: { userId },
      });

      return credentials.map(mapCredential);
    },
    async upsertWorkbenchSettings(
      input: UpsertWorkbenchSettingsParams,
    ): Promise<PersistedWorkbenchSettingsRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.userId);

      if (input.credentialRef) {
        const credential = await prisma.providerCredential.findUnique({
          where: { id: input.credentialRef },
        });

        if (!credential || credential.userId !== input.userId) {
          throw new Error(
            `Credential ${input.credentialRef} does not belong to actor ${input.userId}.`,
          );
        }
      }

      const settings = await prisma.workbenchSettings.upsert({
        create: {
          createdAt: optionalDate(input.createdAt),
          credentialRef: input.credentialRef,
          defaultImportTarget: input.defaultImportTarget,
          updatedAt: optionalDate(input.updatedAt),
          userId: input.userId,
        },
        update: {
          credentialRef: input.credentialRef,
          defaultImportTarget: input.defaultImportTarget,
          updatedAt: optionalDate(input.updatedAt) ?? new Date(),
        },
        where: { userId: input.userId },
      });

      return mapWorkbenchSettings(settings);
    },
  };
}
