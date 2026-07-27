import type { CanonicalAssertionKind } from "@jixia/shared";

export type StoredCanonicalLiteratureAssertion = {
  readonly id: string;
  readonly literatureId: string;
  readonly providerRecordId: string;
  readonly ordinal: number;
  readonly kind: CanonicalAssertionKind;
  readonly textValue: string | null;
  readonly integerValue: number | null;
  readonly structuredItemCount: number | null;
  readonly valueFingerprint: string | null;
  readonly createdAt: Date;
  readonly authors: readonly {
    readonly position: number;
    readonly displayName: string;
    readonly orcid: string | null;
  }[];
  readonly identifiers: readonly {
    readonly position: number;
    readonly scheme: string;
    readonly value: string;
  }[];
  readonly openAccess: {
    readonly isOpenAccess: boolean;
    readonly bestUrl: string | null;
    readonly license: string | null;
    readonly version: string | null;
    readonly hostType: string | null;
  } | null;
  readonly publisher: {
    readonly name: string | null;
    readonly landingPageUrl: string | null;
  } | null;
};
