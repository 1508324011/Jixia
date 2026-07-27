import { describe, expect, it } from "vitest";

import {
  createUnpaywallTestAdapter,
  readUnpaywallFixture,
  unpaywallJsonResponse
} from "./unpaywall.test-fixture.js";

const resourceUrl = "https://publisher.example/articles/alpha.pdf";

describe("Unpaywall reference URL security regressions", () => {
  it.each([
    { label: "semicolon-delimited signature", suffix: "?download=1;sig=provider-secret" },
    { label: "zero-width bearer separator", suffix: "?ref=Bearer%E2%80%8Bprovider-secret" },
    {
      label: "embedded credentialed query URL",
      suffix: "?ref=https%3A%2F%2Fuser%3Aprovider-secret%40other.example"
    },
    {
      label: "embedded credentialed fragment URL",
      suffix: "#//user:provider-secret@other.example"
    }
  ])("rejects a $label", async ({ suffix }) => {
    // Given
    const body = (await readUnpaywallFixture("oa-publisher.json"))
      .split(resourceUrl)
      .join(`${resourceUrl}${suffix}`);
    const fixture = createUnpaywallTestAdapter([() => unpaywallJsonResponse(body)]);

    // When
    const operation = fixture.adapter.enrichDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "unpaywall",
      action: "doi_enrichment",
      code: "invalid_response"
    });
  });
});
