-- CreateTable
CREATE TABLE "AIModelProfile" (
    "id" TEXT NOT NULL,
    "providerConfigId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIModelProfile_pkey" PRIMARY KEY ("id")
);

-- BackfillData
INSERT INTO "AIModelProfile" (
    "id",
    "providerConfigId",
    "model",
    "displayName",
    "temperature",
    "maxTokens",
    "enabled",
    "isDefault",
    "createdAt",
    "updatedAt"
)
SELECT
    "id" || '-default-model',
    "id",
    "model",
    "model",
    "temperature",
    "maxTokens",
    true,
    true,
    "createdAt",
    "updatedAt"
FROM "AIProviderConfig";

-- CreateIndex
CREATE INDEX "AIModelProfile_providerConfigId_isDefault_idx" ON "AIModelProfile"("providerConfigId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelProfile_providerConfigId_displayName_key" ON "AIModelProfile"("providerConfigId", "displayName");

-- CreateIndex
CREATE UNIQUE INDEX "AIModelProfile_one_default_per_provider_config_key" ON "AIModelProfile"("providerConfigId") WHERE "isDefault" = true;

-- AddForeignKey
ALTER TABLE "AIModelProfile" ADD CONSTRAINT "AIModelProfile_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "AIProviderConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropColumns
ALTER TABLE "AIProviderConfig" DROP COLUMN "model", DROP COLUMN "temperature", DROP COLUMN "maxTokens";
