import { describe, expect, it } from "vitest";

import {
  createCrossrefTestAdapter,
  crossrefJsonResponse,
  readCrossrefFixture
} from "./crossref.test-fixture.js";

function crossrefWorkBody(abstract: string): string {
  return JSON.stringify({
    status: "ok",
    "message-type": "work",
    "message-version": "1.0.0",
    message: { DOI: "10.1000/alpha", abstract }
  });
}

describe("Crossref adapter JATS abstract boundary", () => {
  it("decodes each built-in and numeric entity exactly once", async () => {
    // Given
    const body = crossrefWorkBody(
      "<jats:p>&amp;#65; &#65; &#x42; &amp;amp;</jats:p>"
    );
    const fixture = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);

    // When
    const result = await fixture.adapter.fetchSeed({
      recordKey: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result.abstract).toBe("&#65; A B &amp;");
  });

  it.each([
    { label: "literal C1 control", abstract: "<jats:p>before\u0085after</jats:p>" },
    { label: "numeric C0 control", abstract: "<jats:p>before&#1;after</jats:p>" },
    { label: "numeric C1 control", abstract: "<jats:p>before&#x85;after</jats:p>" }
  ])("rejects a $label", async ({ abstract }) => {
    // Given
    const body = crossrefWorkBody(abstract);
    const fixture = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);

    // When
    const operation = fixture.adapter.fetchSeed({
      recordKey: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "crossref",
      action: "fetch_seed",
      code: "invalid_response",
      statusClass: "2xx"
    });
  });

  it.each([
    { label: "hexadecimal U+FFFE entity", value: "&#xFFFE;" },
    { label: "decimal U+FFFE entity", value: "&#65534;" },
    { label: "literal U+FFFE character", value: "\uFFFE" },
    { label: "hexadecimal U+FFFF entity", value: "&#xFFFF;" },
    { label: "decimal U+FFFF entity", value: "&#65535;" },
    { label: "literal U+FFFF character", value: "\uFFFF" },
    { label: "isolated high surrogate", value: "\uD800" },
    { label: "isolated low surrogate", value: "\uDFFF" }
  ])("rejects a $label", async ({ value }) => {
    // Given
    const body = crossrefWorkBody(`<jats:p>before${value}after</jats:p>`);
    const fixture = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);

    // When
    const operation = fixture.adapter.fetchSeed({
      recordKey: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("accepts U+FFFD and supplementary XML characters in literal and numeric forms", async () => {
    // Given
    const body = crossrefWorkBody(
      "<jats:p>\uFFFD &#65533; &#xFFFD; \u{10000} &#65536; &#x10000;</jats:p>"
    );
    const fixture = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);

    // When
    const result = await fixture.adapter.fetchSeed({
      recordKey: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result.abstract).toBe(
      "\uFFFD \uFFFD \uFFFD \u{10000} \u{10000} \u{10000}"
    );
  });

  it.each([
    { label: "unknown named entity", entity: "&copy;" },
    { label: "out-of-range numeric entity", entity: "&#x110000;" },
    { label: "malformed numeric entity", entity: "&#x;" }
  ])("rejects an $label", async ({ entity }) => {
    // Given
    const body = crossrefWorkBody(`<jats:p>${entity}</jats:p>`);
    const fixture = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);

    // When
    const operation = fixture.adapter.fetchSeed({
      recordKey: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("rejects a forbidden entity declaration through the safe XML parser", async () => {
    // Given
    const body = await readCrossrefFixture("work-unsafe-abstract.json");
    const fixture = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);

    // When
    const operation = fixture.adapter.fetchSeed({
      recordKey: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "crossref",
      action: "fetch_seed",
      code: "invalid_response",
      statusClass: "2xx"
    });
  });

  it("rejects malformed JATS without exposing the provider fragment", async () => {
    // Given
    const body = await readCrossrefFixture("work-malformed-abstract.json");
    const fixture = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);

    // When
    const operation = fixture.adapter.fetchSeed({
      recordKey: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "LiteratureProviderError",
      code: "invalid_response"
    });
    await expect(operation).rejects.not.toHaveProperty("abstract");
    await expect(operation).rejects.not.toHaveProperty("body");
  });

  it("rejects JATS that exceeds the provider-local XML boundary", async () => {
    // Given
    const body = JSON.stringify({
      status: "ok",
      "message-type": "work",
      "message-version": "1.0.0",
      message: {
        DOI: "10.1000/alpha",
        abstract: `<jats:p>${"x".repeat(64 * 1024)}</jats:p>`
      }
    });
    const fixture = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);

    // When
    const operation = fixture.adapter.fetchSeed({
      recordKey: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({ code: "response_too_large" });
  });
});
