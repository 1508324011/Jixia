import type {
  CanonicalAssertionKind,
  LiteratureAssertionHistoryDTO,
  LiteratureAuthorValue,
  LiteratureFieldProjectionDTO,
  LiteratureIdentifierValue,
  LiteratureOpenAccessValue,
  LiteratureProjectionDTO,
  LiteraturePublisherValue,
  ProjectedAssertionValueDTO
} from "@jixia/shared";

import { canonicalImportAssertionsEqual } from "./literature.import-assertions.js";
import { decodeStoredLiteratureAssertion } from "./literature.history-value.js";
import type { CanonicalImportAssertion } from "./literature.import-repository.js";
import type { ProviderRecord } from "./literature.repository.js";
import { LiteratureProjectionError } from "./literature.projection.js";
import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";

export type LiteratureHistoryProjection = {
  readonly assertions: readonly LiteratureAssertionHistoryDTO[];
  readonly projection: LiteratureProjectionDTO;
  readonly conflictKinds: readonly CanonicalAssertionKind[];
};

export function projectLiteratureHistory(input: {
  readonly literatureId: string;
  readonly providerRecords: readonly ProviderRecord[];
  readonly assertions: readonly StoredCanonicalLiteratureAssertion[];
}): LiteratureHistoryProjection {
  const providerRecordIds = new Set(
    input.providerRecords.map((record) => {
      if (record.literatureId !== input.literatureId) {
        throw new LiteratureProjectionError(record.id);
      }
      return record.id;
    })
  );
  if (providerRecordIds.size !== input.providerRecords.length) {
    throw new LiteratureProjectionError(input.literatureId);
  }

  const ordered = [...input.assertions].sort(
    (left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id)
  );
  const decoded = [];
  let previousOrdinal = 0;
  for (const assertion of ordered) {
    if (!Number.isInteger(assertion.ordinal) || assertion.ordinal !== previousOrdinal + 1) {
      throw new LiteratureProjectionError(assertion.id);
    }
    previousOrdinal = assertion.ordinal;
    decoded.push(
      decodeStoredLiteratureAssertion(assertion, input.literatureId, providerRecordIds)
    );
  }

  const histories = new Map<CanonicalAssertionKind, typeof decoded>();
  for (const assertion of decoded) {
    const history = histories.get(assertion.canonical.kind) ?? [];
    history.push(assertion);
    histories.set(assertion.canonical.kind, history);
  }
  const conflictKinds = [...histories.entries()]
    .filter(([, history]) => {
      const current = history[history.length - 1];
      return current !== undefined && history.some(
        (candidate) => !canonicalImportAssertionsEqual(candidate.canonical, current.canonical)
      );
    })
    .map(([kind]) => kind);

  return {
    assertions: decoded.map((assertion) => assertion.dto),
    projection: projectDecodedHistory(decoded),
    conflictKinds
  };
}

type ProjectedHistoryEntry<TValue> = {
  readonly canonical: CanonicalImportAssertion;
  readonly value: ProjectedAssertionValueDTO<TValue>;
};

function projectDecodedHistory(
  decoded: readonly ReturnType<typeof decodeStoredLiteratureAssertion>[]
): LiteratureProjectionDTO {
  const title: ProjectedHistoryEntry<string>[] = [];
  const abstract: ProjectedHistoryEntry<string>[] = [];
  const publicationYear: ProjectedHistoryEntry<number>[] = [];
  const doi: ProjectedHistoryEntry<string>[] = [];
  const publicationDate: ProjectedHistoryEntry<string>[] = [];
  const venue: ProjectedHistoryEntry<string>[] = [];
  const publicationType: ProjectedHistoryEntry<string>[] = [];
  const authors: ProjectedHistoryEntry<readonly LiteratureAuthorValue[]>[] = [];
  const identifiers: ProjectedHistoryEntry<readonly LiteratureIdentifierValue[]>[] = [];
  const openAccess: ProjectedHistoryEntry<LiteratureOpenAccessValue>[] = [];
  const publisher: ProjectedHistoryEntry<LiteraturePublisherValue>[] = [];

  for (const assertion of decoded) {
    const provenance = {
      assertionId: assertion.dto.assertionId,
      providerRecordId: assertion.dto.providerRecordId,
      ordinal: assertion.dto.ordinal
    };
    const canonical = assertion.canonical;
    switch (assertion.dto.kind) {
      case "title":
        title.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      case "abstract":
        abstract.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      case "publicationYear":
        publicationYear.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      case "doi":
        doi.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      case "publicationDate":
        publicationDate.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      case "venue":
        venue.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      case "publicationType":
        publicationType.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      case "authors":
        authors.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      case "identifiers":
        identifiers.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      case "openAccess":
        openAccess.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      case "publisher":
        publisher.push({ canonical, value: { ...provenance, value: assertion.dto.value } });
        break;
      default: {
        const unreachable: never = assertion.dto;
        throw unreachable;
      }
    }
  }

  return {
    title: projectField(title),
    abstract: projectField(abstract),
    publicationYear: projectField(publicationYear),
    doi: projectField(doi),
    publicationDate: projectField(publicationDate),
    venue: projectField(venue),
    publicationType: projectField(publicationType),
    authors: projectField(authors),
    identifiers: projectField(identifiers),
    openAccess: projectField(openAccess),
    publisher: projectField(publisher)
  };
}

function projectField<TValue>(
  history: readonly ProjectedHistoryEntry<TValue>[]
): LiteratureFieldProjectionDTO<TValue> {
  const current = history[history.length - 1];
  return {
    current: current?.value ?? null,
    history: history.map((assertion) => assertion.value),
    conflicts: current === undefined
      ? []
      : history
          .filter((assertion) => !canonicalImportAssertionsEqual(assertion.canonical, current.canonical))
          .map((assertion) => assertion.value)
  };
}
