import { describe, expect, it } from "vitest";

import {
  createNcbiTestService,
  ncbiJsonResponse,
  readNcbiFixture
} from "./ncbi.test-fixture.js";

describe("PubMed page envelope contracts", () => {
  it("rejects an ESearch page that returns more records than requested", async () => {
    // Given
    const searchBody = await readNcbiFixture("esearch-page-0.json");
    const summaryBody = await readNcbiFixture("esummary-page-0.json");
    const fixture = createNcbiTestService([
      () => ncbiJsonResponse(searchBody),
      () => ncbiJsonResponse(summaryBody)
    ]);

    // When
    const operation = fixture.adapters.pubmed.search({
      query: "glioblastoma",
      limit: 1,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pubmed",
      action: "search",
      code: "invalid_response"
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty ESearch page before the reported count is exhausted", async () => {
    // Given
    const body = JSON.stringify({
      header: { type: "esearch", version: "0.3" },
      esearchresult: {
        count: "3",
        retmax: "0",
        retstart: "0",
        idlist: []
      }
    });
    const fixture = createNcbiTestService([() => ncbiJsonResponse(body)]);

    // When
    const operation = fixture.adapters.pubmed.search({
      query: "glioblastoma",
      limit: 2,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pubmed",
      action: "search",
      code: "invalid_response"
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("accepts an empty ESearch page exactly at the reported terminal offset", async () => {
    // Given
    const body = JSON.stringify({
      header: { type: "esearch", version: "0.3" },
      esearchresult: {
        count: "3",
        retmax: "0",
        retstart: "3",
        idlist: []
      }
    });
    const fixture = createNcbiTestService([() => ncbiJsonResponse(body)]);

    // When
    const result = await fixture.adapters.pubmed.search({
      query: "glioblastoma",
      limit: 1,
      cursor: "3",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result).toEqual({ records: [], nextCursor: null });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("closes pagination at the bounded PubMed window instead of emitting cursor 10000", async () => {
    // Given
    const searchBody = JSON.stringify({
      header: { type: "esearch", version: "0.3" },
      esearchresult: {
        count: "10001",
        retmax: "1",
        retstart: "9999",
        idlist: ["3"]
      }
    });
    const summaryBody = await readNcbiFixture("esummary-page-2.json");
    const fixture = createNcbiTestService([
      () => ncbiJsonResponse(searchBody),
      () => ncbiJsonResponse(summaryBody)
    ]);

    // When
    const result = await fixture.adapters.pubmed.search({
      query: "glioblastoma",
      limit: 1,
      cursor: "9999",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result.records.map(({ source }) => source.recordKey)).toEqual(["3"]);
    expect(result.nextCursor).toBeNull();
  });

  it("rejects ESummary keys beyond uids and the requested PMIDs", async () => {
    // Given
    const searchBody = await readNcbiFixture("esearch-page-2.json");
    const summaryBody = await readNcbiFixture("esummary-extra-key.json");
    const fixture = createNcbiTestService([
      () => ncbiJsonResponse(searchBody),
      () => ncbiJsonResponse(summaryBody)
    ]);

    // When
    const operation = fixture.adapters.pubmed.search({
      query: "glioblastoma",
      limit: 1,
      cursor: "2",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pubmed",
      action: "search",
      code: "invalid_response"
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
