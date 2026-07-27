import { fingerprintStructuredImportAssertion } from "./literature.import-assertions.js";
import type { CanonicalImportAssertion } from "./literature.import-repository.js";
import type { ProviderRecord } from "./literature.repository.js";
import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";

export const historyLiteratureId = "literature-history-1";

export const historyProviderRecords: readonly ProviderRecord[] = [
  {
    id: "provider-1",
    literatureId: historyLiteratureId,
    providerKey: "crossref",
    recordKey: "10.1000/history",
    createdByUserId: "user-1",
    createdAt: new Date("2026-07-20T00:00:00.000Z")
  },
  {
    id: "provider-2",
    literatureId: historyLiteratureId,
    providerKey: "openalex",
    recordKey: "W1",
    createdByUserId: "user-1",
    createdAt: new Date("2026-07-20T00:00:01.000Z")
  }
];

export function storedHistoryAssertion(input: {
  readonly id: string;
  readonly ordinal: number;
  readonly assertion: CanonicalImportAssertion;
  readonly providerRecordId?: string;
}): StoredCanonicalLiteratureAssertion {
  const common = {
    id: input.id,
    literatureId: historyLiteratureId,
    providerRecordId: input.providerRecordId ?? "provider-1",
    ordinal: input.ordinal,
    kind: input.assertion.kind,
    createdAt: new Date(`2026-07-20T00:00:${String(input.ordinal).padStart(2, "0")}.000Z`),
    authors: [],
    identifiers: [],
    openAccess: null,
    publisher: null
  } as const;
  switch (input.assertion.kind) {
    case "title":
    case "abstract":
    case "doi":
    case "publicationDate":
    case "venue":
    case "publicationType":
      return {
        ...common,
        textValue: input.assertion.value,
        integerValue: null,
        structuredItemCount: null,
        valueFingerprint: null
      };
    case "publicationYear":
      return {
        ...common,
        textValue: null,
        integerValue: input.assertion.value,
        structuredItemCount: null,
        valueFingerprint: null
      };
    case "authors":
      return {
        ...common,
        textValue: null,
        integerValue: null,
        structuredItemCount: input.assertion.value.length,
        valueFingerprint: fingerprintStructuredImportAssertion(input.assertion),
        authors: input.assertion.value.map((author, position) => ({
          position,
          displayName: author.displayName,
          orcid: author.orcid ?? null
        }))
      };
    case "identifiers":
      return {
        ...common,
        textValue: null,
        integerValue: null,
        structuredItemCount: input.assertion.value.length,
        valueFingerprint: fingerprintStructuredImportAssertion(input.assertion),
        identifiers: input.assertion.value.map((identifier, position) => ({
          position,
          scheme: identifier.scheme,
          value: identifier.value
        }))
      };
    case "openAccess":
      return {
        ...common,
        textValue: null,
        integerValue: null,
        structuredItemCount: 1,
        valueFingerprint: fingerprintStructuredImportAssertion(input.assertion),
        openAccess: {
          isOpenAccess: input.assertion.value.isOpenAccess,
          bestUrl: input.assertion.value.bestUrl ?? null,
          license: input.assertion.value.license ?? null,
          version: input.assertion.value.version ?? null,
          hostType: input.assertion.value.hostType ?? null
        }
      };
    case "publisher":
      return {
        ...common,
        textValue: null,
        integerValue: null,
        structuredItemCount: 1,
        valueFingerprint: fingerprintStructuredImportAssertion(input.assertion),
        publisher: {
          name: input.assertion.value.name ?? null,
          landingPageUrl: input.assertion.value.landingPageUrl ?? null
        }
      };
    default: {
      const unreachable: never = input.assertion;
      throw unreachable;
    }
  }
}
