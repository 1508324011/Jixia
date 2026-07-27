import { describe, expect, it } from "vitest";

import { LiteratureProviderError } from "../provider-errors.js";
import { openAlexSearchResponseSchema } from "./openalex.schemas.js";
import {
  createOpenAlexTestAdapter,
  openAlexJsonResponse,
  readOpenAlexFixture
} from "./openalex.test-fixture.js";

function withOpenAlexPerPage(body: string, perPage: number): string {
  const fixture: unknown = JSON.parse(body);
  const parsed = openAlexSearchResponseSchema.parse(fixture);
  return JSON.stringify(openAlexSearchResponseSchema.parse({
    ...parsed,
    meta: { ...parsed.meta, per_page: perPage }
  }));
}

describe("OpenAlex adapter search boundaries", () => {
  it("rejects a search page whose reported size differs from the requested limit", async () => {
    // Given
    const body = withOpenAlexPerPage(await readOpenAlexFixture("search-sparse.json"), 2);
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const operation = fixture.adapter.search({
      query: "oracle limit mismatch",
      limit: 1,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toEqual(expect.objectContaining({
      name: "LiteratureProviderError",
      message: "Literature provider request failed.",
      providerKey: "openalex",
      action: "search",
      code: "invalid_response",
      statusClass: "2xx"
    }));
    await expect(operation).rejects.toBeInstanceOf(LiteratureProviderError);
    await expect(operation).rejects.not.toHaveProperty("body");
    await expect(operation).rejects.not.toHaveProperty("query");
    const url = new URL(fixture.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.example");
    expect(url.searchParams.get("per_page")).toBe("1");
  });

  it.each([
    "?ref=Bearer%2509provider-secret",
    "#bearer=opaque",
    "?download=1;sig=provider-secret",
    "?ref=Bearer%E2%80%8Bprovider-secret",
    "?ref=https%3A%2F%2Fuser%3Aprovider-secret%40other.example",
    "#//user:provider-secret@other.example"
  ])("rejects credential-bearing normalized reference URLs", async (suffix) => {
    // Given
    const body = (await readOpenAlexFixture("search-rich.json"))
      .split("https://repository.example/alpha")
      .join(`https://repository.example/alpha${suffix}`);
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const operation = fixture.adapter.search({
      query: "encoded provider credential",
      limit: 2,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "openalex",
      action: "search",
      code: "invalid_response"
    });
  });

  it("rejects a search page that returns more records than requested", async () => {
    // Given
    const body = withOpenAlexPerPage(await readOpenAlexFixture("search-rich.json"), 1);
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const operation = fixture.adapter.search({
      query: "oracle result over-return",
      limit: 1,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toEqual(expect.objectContaining({
      name: "LiteratureProviderError",
      message: "Literature provider request failed.",
      providerKey: "openalex",
      action: "search",
      code: "invalid_response",
      statusClass: "2xx"
    }));
    await expect(operation).rejects.toBeInstanceOf(LiteratureProviderError);
    await expect(operation).rejects.not.toHaveProperty("body");
    await expect(operation).rejects.not.toHaveProperty("query");
  });

  it("accepts a short search page when its reported size matches the requested limit", async () => {
    // Given
    const body = withOpenAlexPerPage(await readOpenAlexFixture("search-sparse.json"), 2);
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const result = await fixture.adapter.search({
      query: "valid short page",
      limit: 2,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.source.recordKey).toBe("W2");
    expect(result.nextCursor).toBeNull();
  });

  it("rejects an upstream work identity that exceeds the import boundary", async () => {
    // Given
    const oversizedUrl = `https://openalex.org/W${"1".repeat(512)}`;
    const body = (await readOpenAlexFixture("search-sparse.json"))
      .split("https://openalex.org/W2")
      .join(oversizedUrl);
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const operation = fixture.adapter.search({
      query: "oversized provider identity",
      limit: 1,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({ code: "invalid_response" });
  });

  it.each([
    {
      currentValue: "https://pubmed.ncbi.nlm.nih.gov/12345",
      invalidValue: `https://pubmed.ncbi.nlm.nih.gov/${"1".repeat(17)}`
    },
    {
      currentValue: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7654321",
      invalidValue: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${"1".repeat(17)}`
    }
  ])("rejects an overlong external identity from OpenAlex", async ({ currentValue, invalidValue }) => {
    // Given
    const body = (await readOpenAlexFixture("search-rich.json")).replace(currentValue, invalidValue);
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const operation = fixture.adapter.search({
      query: "overlong external identity",
      limit: 2,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({ code: "invalid_response" });
  });
});
