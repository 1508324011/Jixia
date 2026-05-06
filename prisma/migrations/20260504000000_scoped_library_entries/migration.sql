-- Move literature assets to explicit scoped library ownership.
-- PaperAsset remains a global deduplicated metadata/provenance row.
-- LibraryEntry expresses scoped user/project adoption and keeps legacy
-- space/visibility fields only as non-authoritative compatibility metadata.

CREATE TABLE IF NOT EXISTS "PaperAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canonicalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "abstractText" TEXT,
    "authors" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceLocator" TEXT NOT NULL,
    "storageKey" TEXT,
    "checksum" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedByUserId" TEXT NOT NULL,
    CONSTRAINT "PaperAsset_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaperAsset_canonicalId_key" ON "PaperAsset"("canonicalId");

CREATE TABLE IF NOT EXISTS "LibraryEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "paperAssetId" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "legacySpaceId" TEXT,
    "legacyVisibility" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryEntry_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryEntry_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "LibraryEntry_scope_asset_unique" ON "LibraryEntry"("scopeType", "scopeId", "paperAssetId");
