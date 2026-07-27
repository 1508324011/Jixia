import type {
  LiteratureAuthorValue,
  LiteratureDiscoveryCandidateDTO,
  LiteratureDiscoverySourceMatchDTO,
  LiteratureIdentifierValue,
  LiteratureOpenAccessValue,
  LiteraturePublisherValue,
  LiteratureSearchProviderKey
} from "@jixia/shared";

import type { LiteratureCursorSeenIdentity } from "./cursor-codec.js";
import type { LiteratureDiscoveryNormalizedRecord } from "./discovery.types.js";

export type LiteratureDiscoveryQuotas = Readonly<Record<LiteratureSearchProviderKey, number>>;

export type RankedLiteratureDiscoveryCandidate = {
  readonly candidate: LiteratureDiscoveryCandidateDTO;
  readonly seenIdentities: readonly LiteratureCursorSeenIdentity[];
};

type RankedRecord = {
  readonly record: LiteratureDiscoveryNormalizedRecord;
  readonly sourceMatch: LiteratureDiscoverySourceMatchDTO;
};

type MergeGroup = {
  readonly records: readonly RankedRecord[];
};

type ScoredCandidate = RankedLiteratureDiscoveryCandidate & {
  readonly exactIdentityKey: string;
  readonly providerPriority: number;
  readonly score: number;
};

class LiteratureDiscoveryMergeError extends Error {
  readonly name = "LiteratureDiscoveryMergeError";
}

const providerPriority = {
  openalex: 0,
  crossref: 1,
  pubmed: 2
} as const satisfies Readonly<Record<LiteratureSearchProviderKey, number>>;

export function allocateLiteratureDiscoveryQuotas(limit: number): LiteratureDiscoveryQuotas {
  const floor = Math.floor(limit / 3);
  const remainder = limit % 3;
  return {
    openalex: floor + (remainder >= 1 ? 1 : 0),
    crossref: floor + (remainder >= 2 ? 1 : 0),
    pubmed: floor
  };
}

export function mergeAndRankLiteratureDiscoveryRecords(input: {
  readonly openalex: readonly LiteratureDiscoveryNormalizedRecord[];
  readonly crossref: readonly LiteratureDiscoveryNormalizedRecord[];
  readonly pubmed: readonly LiteratureDiscoveryNormalizedRecord[];
}): readonly RankedLiteratureDiscoveryCandidate[] {
  const rankedRecords: readonly RankedRecord[] = [
    ...rankProviderRecords("openalex", input.openalex),
    ...rankProviderRecords("crossref", input.crossref),
    ...rankProviderRecords("pubmed", input.pubmed)
  ];
  let groups: readonly MergeGroup[] = [];
  for (const rankedRecord of rankedRecords) {
    const matchingGroups = groups.filter((group) =>
      group.records.some((existing) => sharesExactIdentity(existing, rankedRecord))
    );
    const mergedGroup = {
      records: [...matchingGroups.flatMap((group) => group.records), rankedRecord]
    };
    groups = [
      ...groups.filter((group) => !matchingGroups.includes(group)),
      mergedGroup
    ];
  }
  return groups
    .map(toScoredCandidate)
    .sort(compareScoredCandidates)
    .map(({ candidate, seenIdentities }) => ({ candidate, seenIdentities }));
}

function rankProviderRecords(
  providerKey: LiteratureSearchProviderKey,
  records: readonly LiteratureDiscoveryNormalizedRecord[]
): readonly RankedRecord[] {
  return records.map((record, index) => ({
    record,
    sourceMatch: { providerKey, recordKey: record.source.recordKey, providerRank: index + 1 }
  }));
}

function sharesExactIdentity(left: RankedRecord, right: RankedRecord): boolean {
  return (
    left.record.doi !== null && left.record.doi === right.record.doi
  ) || (
    left.sourceMatch.providerKey === right.sourceMatch.providerKey &&
    left.sourceMatch.recordKey === right.sourceMatch.recordKey
  );
}

function toScoredCandidate(group: MergeGroup): ScoredCandidate {
  const records = [...group.records].sort(compareRankedRecords);
  const sourceMatches = uniqueSourceMatches(records);
  const firstSourceMatch = sourceMatches[0];
  if (firstSourceMatch === undefined) {
    throw new LiteratureDiscoveryMergeError("Discovery merge group has no source");
  }
  const doi = pickString(records, (entry) => entry.record.doi);
  const seenDoi = new Set<string>();
  const seenIdentities: LiteratureCursorSeenIdentity[] = [];
  for (const record of records) {
    const recordDoi = record.record.doi;
    if (recordDoi !== null && !seenDoi.has(recordDoi)) {
      seenDoi.add(recordDoi);
      seenIdentities.push({ kind: "doi", doi: recordDoi });
    }
  }
  seenIdentities.push(...sourceMatches.map((sourceMatch) => ({
    kind: "provider",
    providerKey: sourceMatch.providerKey,
    recordKey: sourceMatch.recordKey
  } satisfies LiteratureCursorSeenIdentity)));
  const minimumProviderRanks = new Map<LiteratureSearchProviderKey, number>();
  for (const sourceMatch of sourceMatches) {
    const currentMinimum = minimumProviderRanks.get(sourceMatch.providerKey);
    if (currentMinimum === undefined || sourceMatch.providerRank < currentMinimum) {
      minimumProviderRanks.set(sourceMatch.providerKey, sourceMatch.providerRank);
    }
  }
  const exactIdentityKey = doi !== null
    ? `doi:${doi}`
    : `provider:${firstSourceMatch.providerKey}:${firstSourceMatch.recordKey}`;
  return {
    candidate: {
      title: pickString(records, (entry) => entry.record.title),
      abstract: pickString(records, (entry) => entry.record.abstract),
      publicationYear: pickNonNull(records, (entry) => entry.record.publicationYear),
      publicationDate: pickString(records, (entry) => entry.record.publicationDate),
      venue: pickString(records, (entry) => entry.record.venue),
      publicationType: pickString(records, (entry) => entry.record.publicationType),
      doi,
      authors: pickArray<LiteratureAuthorValue>(records, (entry) => entry.record.authors),
      identifiers: pickArray<LiteratureIdentifierValue>(records, (entry) => entry.record.identifiers),
      openAccess: pickNonNull<LiteratureOpenAccessValue>(records, (entry) => entry.record.openAccess),
      publisher: pickNonNull<LiteraturePublisherValue>(records, (entry) => entry.record.publisher),
      sourceMatches
    },
    seenIdentities,
    exactIdentityKey,
    providerPriority: providerPriority[firstSourceMatch.providerKey],
    score: [...minimumProviderRanks.values()].reduce(
      (total, providerRank) => total + 1 / (60 + providerRank),
      0
    )
  };
}

function uniqueSourceMatches(records: readonly RankedRecord[]): readonly LiteratureDiscoverySourceMatchDTO[] {
  const identityKeys = new Set<string>();
  const matches: LiteratureDiscoverySourceMatchDTO[] = [];
  for (const record of records) {
    const identityKey = `${record.sourceMatch.providerKey}:${record.sourceMatch.recordKey}`;
    if (!identityKeys.has(identityKey)) {
      identityKeys.add(identityKey);
      matches.push(record.sourceMatch);
    }
  }
  return matches;
}

function compareRankedRecords(left: RankedRecord, right: RankedRecord): number {
  return providerPriority[left.sourceMatch.providerKey] - providerPriority[right.sourceMatch.providerKey]
    || left.sourceMatch.providerRank - right.sourceMatch.providerRank
    || compareText(left.sourceMatch.recordKey, right.sourceMatch.recordKey);
}

function compareScoredCandidates(left: ScoredCandidate, right: ScoredCandidate): number {
  return right.score - left.score
    || left.providerPriority - right.providerPriority
    || compareText(left.exactIdentityKey, right.exactIdentityKey);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pickString(
  records: readonly RankedRecord[],
  select: (record: RankedRecord) => string | null
): string | null {
  for (const record of records) {
    const value = select(record);
    if (value !== null && value.length > 0) {
      return value;
    }
  }
  return null;
}

function pickNonNull<TValue>(
  records: readonly RankedRecord[],
  select: (record: RankedRecord) => TValue | null
): TValue | null {
  for (const record of records) {
    const value = select(record);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function pickArray<TValue>(
  records: readonly RankedRecord[],
  select: (record: RankedRecord) => readonly TValue[]
): readonly TValue[] {
  for (const record of records) {
    const value = select(record);
    if (value.length > 0) {
      return value;
    }
  }
  return [];
}
