import { describe, expect, it } from "vitest";

import {
  createNcbiTestService,
  ncbiJsonResponse,
  ncbiXmlResponse,
  readNcbiFixture
} from "./ncbi.test-fixture.js";

describe("PubMed exact DOI lookup", () => {
  it("resolves one exact AID match and refetches its PMID", async () => {
    // Given
    const searchBody = await readNcbiFixture("esearch-doi-one.json");
    const fetchBody = await readNcbiFixture("efetch-rich.xml");
    const fixture = createNcbiTestService([
      () => ncbiJsonResponse(searchBody),
      () => ncbiXmlResponse(fetchBody)
    ]);

    // When
    const article = await fixture.adapters.pubmed.lookupDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    const searchUrl = new URL(
      fixture.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.example"
    );
    const fetchUrl = new URL(
      fixture.fetchImplementation.mock.calls[1]?.[0] ?? "https://invalid.example"
    );
    expect(searchUrl.searchParams.get("term")).toBe("10.1000/alpha[AID]");
    expect(searchUrl.searchParams.get("retmax")).toBe("2");
    expect(fetchUrl.searchParams.get("id")).toBe("1");
    expect(article.doi).toBe("10.1000/alpha");
  });

  it("rejects a conflicting DOI from EFetch with a sanitized identity signal", async () => {
    // Given
    const searchBody = await readNcbiFixture("esearch-doi-one.json");
    const fetchBody = await readNcbiFixture("efetch-rich.xml");
    const fixture = createNcbiTestService([
      () => ncbiJsonResponse(searchBody),
      () => ncbiXmlResponse(fetchBody)
    ]);

    // When
    const operation = fixture.adapters.pubmed.lookupDoi({
      doi: "10.1000/other",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "LiteratureProviderIdentityConflictError",
      providerKey: "pubmed",
      action: "doi_lookup",
      code: "invalid_response",
      statusClass: "2xx"
    });
    await expect(operation).rejects.not.toHaveProperty("expectedDoi");
    await expect(operation).rejects.not.toHaveProperty("actualDoi");
    await expect(operation).rejects.not.toHaveProperty("body");
  });

  it("maps zero exact matches to not found without EFetch", async () => {
    // Given
    const body = await readNcbiFixture("esearch-zero.json");
    const fixture = createNcbiTestService([() => ncbiJsonResponse(body)]);

    // When
    const operation = fixture.adapters.pubmed.lookupDoi({
      doi: "10.1000/missing",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pubmed",
      action: "doi_lookup",
      code: "not_found",
      statusClass: "2xx"
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects ambiguous exact matches without EFetch", async () => {
    // Given
    const body = await readNcbiFixture("esearch-doi-multiple.json");
    const fixture = createNcbiTestService([() => ncbiJsonResponse(body)]);

    // When
    const operation = fixture.adapters.pubmed.lookupDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "LiteratureProviderError",
      action: "doi_lookup",
      code: "invalid_response",
      statusClass: "2xx"
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed DOI input and cancellation before transport", async () => {
    // Given
    const fixture = createNcbiTestService([]);
    const controller = new AbortController();
    controller.abort();

    // When
    const malformed = fixture.adapters.pubmed.lookupDoi({
      doi: "https://attacker.example/not-a-doi",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(malformed).rejects.toMatchObject({
      action: "doi_lookup",
      code: "provider_rejected",
      attempt: 0
    });
    await expect(fixture.adapters.pubmed.lookupDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs,
      signal: controller.signal
    })).rejects.toMatchObject({ code: "cancelled", attempt: 0 });
    expect(fixture.fetchImplementation).not.toHaveBeenCalled();
  });
});
