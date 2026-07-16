-- CreateEnum
CREATE TYPE "AIProviderKind" AS ENUM ('openai', 'openrouter', 'anthropic', 'openai_compatible');
CREATE TYPE "AIProviderTransportState" AS ENUM ('not_checked', 'reachable', 'unreachable');
CREATE TYPE "AIProviderAuthState" AS ENUM ('not_checked', 'verified', 'rejected', 'unverified');
CREATE TYPE "AIProviderDiscoveryState" AS ENUM ('not_attempted', 'available', 'unsupported', 'empty', 'rate_limited', 'unavailable', 'malformed');
CREATE TYPE "AIInventoryFreshnessState" AS ENUM ('never', 'fresh', 'stale');
CREATE TYPE "AIModelProfileOrigin" AS ENUM ('manual', 'discovered');
CREATE TYPE "AIModelAvailabilityState" AS ENUM ('unknown', 'available', 'unavailable');
CREATE TYPE "AICapabilityFactState" AS ENUM ('unknown', 'observed', 'unsupported');

-- AlterTable
ALTER TABLE "AIProviderConfig"
ADD COLUMN "providerKind" "AIProviderKind" NOT NULL DEFAULT 'openai_compatible',
ADD COLUMN "transportState" "AIProviderTransportState" NOT NULL DEFAULT 'not_checked',
ADD COLUMN "authState" "AIProviderAuthState" NOT NULL DEFAULT 'not_checked',
ADD COLUMN "discoveryState" "AIProviderDiscoveryState" NOT NULL DEFAULT 'not_attempted',
ADD COLUMN "inventoryFreshness" "AIInventoryFreshnessState" NOT NULL DEFAULT 'never',
ADD COLUMN "lastConnectionAttemptAt" TIMESTAMP(3),
ADD COLUMN "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN "verificationAttemptToken" TEXT,
ADD COLUMN "lastSyncAttemptAt" TIMESTAMP(3),
ADD COLUMN "syncAttemptToken" TEXT,
ADD COLUMN "lastSuccessfulSyncAt" TIMESTAMP(3),
ADD COLUMN "connectionErrorCode" TEXT,
ADD COLUMN "discoveryErrorCode" TEXT;

UPDATE "AIProviderConfig" SET
  "providerKind" = CASE
    WHEN lower("provider") = 'openai' AND regexp_replace(lower(btrim("baseURL")), '/+$', '') = 'https://api.openai.com/v1' THEN 'openai'::"AIProviderKind"
    WHEN lower("provider") = 'openrouter' AND regexp_replace(lower(btrim("baseURL")), '/+$', '') = 'https://openrouter.ai/api/v1' THEN 'openrouter'::"AIProviderKind"
    WHEN lower("provider") = 'anthropic' AND regexp_replace(lower(btrim("baseURL")), '/+$', '') = 'https://api.anthropic.com/v1' THEN 'anthropic'::"AIProviderKind"
    ELSE 'openai_compatible'::"AIProviderKind"
  END,
  "baseURL" = CASE
    WHEN lower("provider") = 'openai' AND regexp_replace(lower(btrim("baseURL")), '/+$', '') = 'https://api.openai.com/v1' THEN 'https://api.openai.com/v1'
    WHEN lower("provider") = 'openrouter' AND regexp_replace(lower(btrim("baseURL")), '/+$', '') = 'https://openrouter.ai/api/v1' THEN 'https://openrouter.ai/api/v1'
    WHEN lower("provider") = 'anthropic' AND regexp_replace(lower(btrim("baseURL")), '/+$', '') = 'https://api.anthropic.com/v1' THEN 'https://api.anthropic.com/v1'
    ELSE "baseURL"
  END;

ALTER TABLE "AIModelProfile"
ADD COLUMN "origin" "AIModelProfileOrigin" NOT NULL DEFAULT 'manual',
ADD COLUMN "availability" "AIModelAvailabilityState" NOT NULL DEFAULT 'unknown',
ADD COLUMN "lastSeenAt" TIMESTAMP(3),
ADD COLUMN "contextWindowState" "AICapabilityFactState" NOT NULL DEFAULT 'unknown',
ADD COLUMN "contextWindowTokens" INTEGER,
ADD COLUMN "maxOutputState" "AICapabilityFactState" NOT NULL DEFAULT 'unknown',
ADD COLUMN "maxOutputTokens" INTEGER,
ADD COLUMN "inputModalitiesState" "AICapabilityFactState" NOT NULL DEFAULT 'unknown',
ADD COLUMN "inputModalities" JSONB,
ADD COLUMN "outputModalitiesState" "AICapabilityFactState" NOT NULL DEFAULT 'unknown',
ADD COLUMN "outputModalities" JSONB,
ADD COLUMN "supportedParametersState" "AICapabilityFactState" NOT NULL DEFAULT 'unknown',
ADD COLUMN "supportedParameters" JSONB,
ADD COLUMN "capabilitySource" "AIProviderKind",
ADD COLUMN "capabilitiesObservedAt" TIMESTAMP(3);

ALTER TABLE "AIModelProfile" ADD CONSTRAINT "AIModelProfile_context_window_fact_check"
CHECK (("contextWindowState" = 'observed' AND "contextWindowTokens" IS NOT NULL AND "contextWindowTokens" > 0) OR ("contextWindowState" <> 'observed' AND "contextWindowTokens" IS NULL));
ALTER TABLE "AIModelProfile" ADD CONSTRAINT "AIModelProfile_max_output_fact_check"
CHECK (("maxOutputState" = 'observed' AND "maxOutputTokens" IS NOT NULL AND "maxOutputTokens" > 0) OR ("maxOutputState" <> 'observed' AND "maxOutputTokens" IS NULL));
