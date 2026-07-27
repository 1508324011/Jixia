import { describe, expect, it } from "vitest";

import {
  createNcbiTestService,
  ncbiXmlResponse,
  readNcbiFixture
} from "./ncbi.test-fixture.js";

describe("PubMed PMID seed refetch", () => {
  it("normalizes ordered EFetch metadata and canonical ArticleIds", async () => {
    // Given
    const body = await readNcbiFixture("efetch-rich.xml");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    // When
    const article = await fixture.adapters.pubmed.fetchSeed({
      recordKey: "1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    const requestUrl = new URL(
      fixture.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.example"
    );
    expect(requestUrl.pathname).toBe("/entrez/eutils/efetch.fcgi");
    expect(requestUrl.searchParams.get("db")).toBe("pubmed");
    expect(requestUrl.searchParams.get("id")).toBe("1");
    expect(requestUrl.searchParams.get("retmode")).toBe("xml");
    expect(article).toEqual({
      source: { providerKey: "pubmed", recordKey: "1" },
      title: "Alpha discovery & validation",
      abstract: "BACKGROUND: Alpha & beta. RESULTS: Gamma result.",
      publicationYear: 2024,
      publicationDate: "2024-03-01",
      venue: "Journal of Exact Results",
      publicationType: "Journal Article; Randomized Controlled Trial",
      doi: "10.1000/alpha",
      authors: [
        { displayName: "Ada Author", orcid: "0000-0001-2345-6789" },
        { displayName: "Exact Consortium" }
      ],
      identifiers: [
        { scheme: "doi", value: "10.1000/alpha" },
        { scheme: "issn", value: "1234-5678" },
        { scheme: "issn", value: "8765-4321" },
        { scheme: "pmcid", value: "PMC100" },
        { scheme: "pmid", value: "1" }
      ],
      openAccess: null,
      publisher: null
    });
  });

  it("accepts a valid citation without a DOI or abstract", async () => {
    // Given
    const body = await readNcbiFixture("efetch-no-doi.xml");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    // When
    const article = await fixture.adapters.pubmed.fetchSeed({
      recordKey: "2",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(article).toMatchObject({
      source: { providerKey: "pubmed", recordKey: "2" },
      title: "Record without DOI",
      abstract: null,
      publicationYear: 2023,
      publicationDate: "2023",
      doi: null,
      authors: [{ displayName: "Sparse Group" }],
      identifiers: [{ scheme: "pmid", value: "2" }]
    });
  });

  it("rejects forbidden entity declarations at the XML boundary", async () => {
    // Given
    const body = await readNcbiFixture("efetch-entity.xml");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    // When
    const operation = fixture.adapters.pubmed.fetchSeed({
      recordKey: "1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pubmed",
      action: "fetch_seed",
      code: "invalid_response",
      statusClass: "2xx"
    });
  });

  it("rejects malformed and multi-article EFetch responses", async () => {
    // Given
    const multiple = await readNcbiFixture("efetch-multiple.xml");
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse("<PubmedArticleSet><PubmedArticle>"),
      () => ncbiXmlResponse(multiple)
    ]);

    // When
    const malformed = fixture.adapters.pubmed.fetchSeed({
      recordKey: "1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(malformed).rejects.toMatchObject({ code: "invalid_response" });
    await expect(fixture.adapters.pubmed.fetchSeed({
      recordKey: "1",
      operationDeadlineMs: fixture.operationDeadlineMs
    })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("rejects an EFetch article without a canonical PubMed ArticleId", async () => {
    // Given
    const body = [
      "<PubmedArticleSet><PubmedArticle><MedlineCitation>",
      "<PMID>1</PMID><Article><Journal><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue>",
      "<Title>Missing ID Journal</Title></Journal><ArticleTitle>Missing ID</ArticleTitle></Article>",
      "<MedlineJournalInfo><MedlineTA>Missing ID Journal</MedlineTA></MedlineJournalInfo>",
      "</MedlineCitation><PubmedData><ArticleIdList></ArticleIdList></PubmedData>",
      "</PubmedArticle></PubmedArticleSet>"
    ].join("");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    // When
    const operation = fixture.adapters.pubmed.fetchSeed({
      recordKey: "1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({ code: "invalid_response" });
  });
});
