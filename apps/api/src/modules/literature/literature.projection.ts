import type {
  AssertionKind,
  LiteratureFieldProjectionDTO,
  LiteratureProjectionDTO,
  ProjectedAssertionValueDTO
} from "@jixia/shared";

import {
  isCanonicalLiteratureDoi,
  normalizeLiteratureText
} from "./literature.normalization.js";

export type StoredLiteratureAssertion = {
  readonly id: string;
  readonly providerRecordId: string;
  readonly ordinal: number;
  readonly kind: AssertionKind;
  readonly textValue: string | null;
  readonly integerValue: number | null;
};

type ProjectedStoredAssertion =
  | {
      readonly kind: "title";
      readonly value: ProjectedAssertionValueDTO<string>;
    }
  | {
      readonly kind: "abstract";
      readonly value: ProjectedAssertionValueDTO<string>;
    }
  | {
      readonly kind: "publicationYear";
      readonly value: ProjectedAssertionValueDTO<number>;
    }
  | {
      readonly kind: "doi";
      readonly value: ProjectedAssertionValueDTO<string>;
    };

export class LiteratureProjectionError extends Error {
  readonly assertionId: string;

  constructor(assertionId: string) {
    super(`Invalid persisted literature assertion: ${assertionId}`);
    this.name = "LiteratureProjectionError";
    this.assertionId = assertionId;
  }
}

export function replayLiteratureAssertions(
  assertions: readonly StoredLiteratureAssertion[]
): LiteratureProjectionDTO {
  const title: ProjectedAssertionValueDTO<string>[] = [];
  const abstract: ProjectedAssertionValueDTO<string>[] = [];
  const publicationYear: ProjectedAssertionValueDTO<number>[] = [];
  const doi: ProjectedAssertionValueDTO<string>[] = [];
  const orderedAssertions = [...assertions].sort(
    (left, right) => left.ordinal - right.ordinal || left.id.localeCompare(right.id)
  );
  let previousOrdinal = 0;

  for (const assertion of orderedAssertions) {
    if (assertion.ordinal <= previousOrdinal) {
      throw new LiteratureProjectionError(assertion.id);
    }
    previousOrdinal = assertion.ordinal;

    const parsed = parseStoredAssertion(assertion);
    switch (parsed.kind) {
      case "title":
        title.push(parsed.value);
        break;
      case "abstract":
        abstract.push(parsed.value);
        break;
      case "publicationYear":
        publicationYear.push(parsed.value);
        break;
      case "doi":
        doi.push(parsed.value);
        break;
      default: {
        const unreachable: never = parsed;
        throw unreachable;
      }
    }
  }

  return {
    title: projectField(title),
    abstract: projectField(abstract),
    publicationYear: projectField(publicationYear),
    doi: projectField(doi),
    publicationDate: { current: null, history: [], conflicts: [] },
    venue: { current: null, history: [], conflicts: [] },
    publicationType: { current: null, history: [], conflicts: [] },
    authors: { current: null, history: [], conflicts: [] },
    identifiers: { current: null, history: [], conflicts: [] },
    openAccess: { current: null, history: [], conflicts: [] },
    publisher: { current: null, history: [], conflicts: [] }
  };
}

function parseStoredAssertion(assertion: StoredLiteratureAssertion): ProjectedStoredAssertion {
  if (!Number.isInteger(assertion.ordinal) || assertion.ordinal < 1) {
    throw new LiteratureProjectionError(assertion.id);
  }

  const provenance = {
    assertionId: assertion.id,
    providerRecordId: assertion.providerRecordId,
    ordinal: assertion.ordinal
  };

  switch (assertion.kind) {
    case "title":
    case "abstract":
      if (
        assertion.textValue === null ||
        assertion.textValue.length === 0 ||
        normalizeLiteratureText(assertion.textValue) !== assertion.textValue ||
        assertion.integerValue !== null
      ) {
        throw new LiteratureProjectionError(assertion.id);
      }
      return {
        kind: assertion.kind,
        value: { ...provenance, value: assertion.textValue }
      };
    case "doi":
      if (
        assertion.textValue === null ||
        !isCanonicalLiteratureDoi(assertion.textValue) ||
        assertion.integerValue !== null
      ) {
        throw new LiteratureProjectionError(assertion.id);
      }
      return {
        kind: assertion.kind,
        value: { ...provenance, value: assertion.textValue }
      };
    case "publicationYear":
      if (
        assertion.textValue !== null ||
        assertion.integerValue === null ||
        !Number.isInteger(assertion.integerValue) ||
        assertion.integerValue < 1000 ||
        assertion.integerValue > 9999
      ) {
        throw new LiteratureProjectionError(assertion.id);
      }
      return {
        kind: assertion.kind,
        value: { ...provenance, value: assertion.integerValue }
      };
    default: {
      const unreachable: never = assertion.kind;
      throw unreachable;
    }
  }
}

function projectField<TValue extends string | number>(
  history: readonly ProjectedAssertionValueDTO<TValue>[]
): LiteratureFieldProjectionDTO<TValue> {
  const current = history.slice(-1)[0] ?? null;
  return {
    current,
    history,
    conflicts:
      current === null ? [] : history.filter((assertion) => assertion.value !== current.value)
  };
}
