-- Move credential secret material and workbench settings authority into
-- Prisma/SQLite while preserving stable ProviderCredential ids for jobs.

CREATE TABLE IF NOT EXISTS "ProviderCredentialSecret" (
    "credentialRef" TEXT NOT NULL PRIMARY KEY,
    "encryptedSecret" TEXT NOT NULL,
    "encryptionIv" TEXT NOT NULL,
    "encryptionTag" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderCredentialSecret_credentialRef_fkey" FOREIGN KEY ("credentialRef") REFERENCES "ProviderCredential" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "WorkbenchSettings" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "credentialRef" TEXT,
    "defaultImportTarget" TEXT NOT NULL DEFAULT 'personal-library',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkbenchSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkbenchSettings_credentialRef_fkey" FOREIGN KEY ("credentialRef") REFERENCES "ProviderCredential" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WorkbenchSettings_credentialRef_idx" ON "WorkbenchSettings"("credentialRef");
