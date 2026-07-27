import type {
  LiteratureImportSeedProviderKey,
  LiteratureSearchProviderKey
} from "@jixia/shared";
import { describe, expect, it } from "vitest";

import type { UnpaywallAdapter } from "./unpaywall.adapter.js";

type Equal<TLeft, TRight> = (<TValue>() => TValue extends TLeft ? 1 : 2) extends <
  TValue
>() => TValue extends TRight ? 1 : 2
  ? (<TValue>() => TValue extends TRight ? 1 : 2) extends <TValue>() =>
      TValue extends TLeft ? 1 : 2
    ? true
    : false
  : false;
type Expect<TValue extends true> = TValue;

type UnpaywallContractProofs = readonly [
  Expect<Equal<keyof UnpaywallAdapter, "enrichDoi">>,
  Expect<Equal<Extract<"unpaywall", LiteratureSearchProviderKey>, never>>,
  Expect<Equal<Extract<"unpaywall", LiteratureImportSeedProviderKey>, never>>
];

describe("Unpaywall adapter contract", () => {
  it("exposes only DOI enrichment and cannot be a search or import-seed provider", () => {
    const proofs: UnpaywallContractProofs = [true, true, true];

    expect(proofs).toEqual([true, true, true]);
  });
});
