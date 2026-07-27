import { providerRecordKeyMaxLength } from "@jixia/shared";
import { describe, expect, it } from "vitest";

import {
  isCanonicalOpenAlexRecordKey,
  isCanonicalPmcRecordKey,
  isCanonicalPubmedRecordKey
} from "./provider-identities.js";

describe("provider record identities", () => {
  it("bounds canonical OpenAlex keys to the shared record-key limit", () => {
    expect(isCanonicalOpenAlexRecordKey(
      `W${"1".repeat(providerRecordKeyMaxLength - 1)}`
    )).toBe(true);
    expect(isCanonicalOpenAlexRecordKey(
      `W${"1".repeat(providerRecordKeyMaxLength)}`
    )).toBe(false);
  });

  it("bounds PubMed and PMC keys to 16 digits", () => {
    expect(isCanonicalPubmedRecordKey("1".repeat(16))).toBe(true);
    expect(isCanonicalPubmedRecordKey("1".repeat(17))).toBe(false);
    expect(isCanonicalPmcRecordKey(`PMC${"1".repeat(16)}`)).toBe(true);
    expect(isCanonicalPmcRecordKey(`PMC${"1".repeat(17)}`)).toBe(false);
  });
});
