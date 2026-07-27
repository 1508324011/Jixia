import type { Prisma } from "@jixia/db";

export const storedAssertionSelect = {
  id: true,
  literatureId: true,
  providerRecordId: true,
  ordinal: true,
  kind: true,
  textValue: true,
  integerValue: true,
  structuredItemCount: true,
  valueFingerprint: true,
  createdAt: true,
  authors: {
    orderBy: { position: "asc" },
    select: { position: true, displayName: true, orcid: true }
  },
  identifiers: {
    orderBy: { position: "asc" },
    select: { position: true, scheme: true, value: true }
  },
  openAccess: {
    select: {
      isOpenAccess: true,
      bestUrl: true,
      license: true,
      version: true,
      hostType: true
    }
  },
  publisher: { select: { name: true, landingPageUrl: true } }
} satisfies Prisma.AssertionSelect;
