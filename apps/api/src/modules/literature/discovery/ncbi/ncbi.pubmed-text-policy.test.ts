import { describe, expect, it } from "vitest";

import {
  createNcbiTestService,
  ncbiJsonResponse,
  ncbiXmlResponse,
  readNcbiFixture
} from "./ncbi.test-fixture.js";

describe("PubMed metadata text policy", () => {
  it("preserves lexical boundaries around inline XML markup", async () => {
    // Given
    const body = await readNcbiFixture("efetch-inline.xml");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    // When
    const article = await fixture.adapters.pubmed.fetchSeed({
      recordKey: "1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(article.title).toBe("BRCA1-mediated p53-dependent repair2.");
    expect(article.abstract).toBe(
      "RESULTS: The p53-response had q2-adjusted values."
    );
  });

  it.each([
    ["raw C0 control", String.fromCodePoint(0x01)],
    ["raw C1 control", String.fromCodePoint(0x85)],
    ["illegal decimal character reference", "&#1;"],
    ["surrogate character reference", "&#xD800;"],
    ["out-of-range character reference", "&#x110000;"]
  ])("rejects %s in XML metadata", async (_caseName, title) => {
    // Given
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse(pubMedFetchXml(title))
    ]);

    // When
    const operation = fixture.adapters.pubmed.fetchSeed({
      recordKey: "1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pubmed",
      action: "fetch_seed",
      code: "invalid_response"
    });
  });

  it("allows legal XML whitespace character references and normalizes them once", async () => {
    // Given
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse(pubMedFetchXml("Line&#9;one&#10;Line&#13;two"))
    ]);

    // When
    const article = await fixture.adapters.pubmed.fetchSeed({
      recordKey: "1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(article.title).toBe("Line one Line two");
  });

  it.each([
    ["C0 control", String.fromCodePoint(0x01)],
    ["DEL control", String.fromCodePoint(0x7f)],
    ["C1 control", String.fromCodePoint(0x85)],
    ["lone high surrogate", String.fromCharCode(0xd800)],
    ["lone low surrogate", String.fromCharCode(0xdc00)]
  ])("rejects %s in JSON metadata", async (_caseName, invalidCharacter) => {
    // Given
    const searchBody = await readNcbiFixture("esearch-page-2.json");
    const fixture = createNcbiTestService([
      () => ncbiJsonResponse(searchBody),
      () => ncbiJsonResponse(pubMedSummaryJson(`Before${invalidCharacter}After`))
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
  });

  it("allows JSON tab, newline, and carriage return metadata whitespace", async () => {
    // Given
    const searchBody = await readNcbiFixture("esearch-page-2.json");
    const fixture = createNcbiTestService([
      () => ncbiJsonResponse(searchBody),
      () => ncbiJsonResponse(pubMedSummaryJson("Line\tone\nLine\rtwo"))
    ]);

    // When
    const result = await fixture.adapters.pubmed.search({
      query: "glioblastoma",
      limit: 1,
      cursor: "2",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result.records[0]?.title).toBe("Line one Line two");
  });

  it("rejects forbidden characters in unmodeled JSON metadata", async () => {
    // Given
    const searchBody = await readNcbiFixture("esearch-page-2.json");
    const fixture = createNcbiTestService([
      () => ncbiJsonResponse(searchBody),
      () => ncbiJsonResponse(pubMedSummaryJson(
        "Clean title",
        String.fromCodePoint(0x01)
      ))
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
  });
});

function pubMedFetchXml(title: string): string {
  return [
    "<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>1</PMID><Article>",
    "<Journal><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue>",
    "<Title>Policy Journal</Title></Journal>",
    `<ArticleTitle>${title}</ArticleTitle>`,
    "</Article></MedlineCitation><PubmedData><ArticleIdList>",
    '<ArticleId IdType="pubmed">1</ArticleId>',
    "</ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>"
  ].join("");
}

function pubMedSummaryJson(title: string, providerNote?: string): string {
  return JSON.stringify({
    header: {
      type: "esummary",
      version: "0.3",
      ...(providerNote === undefined ? {} : { providerNote })
    },
    result: {
      uids: ["3"],
      "3": {
        uid: "3",
        pubdate: "2022 Dec",
        sortpubdate: "2022/12/01 00:00",
        source: "Policy Journal",
        authors: [],
        title,
        fulljournalname: "Policy Journal",
        issn: "",
        essn: "",
        pubtype: ["Journal Article"],
        articleids: [{ idtype: "pubmed", idtypen: 1, value: "3" }],
        publishername: ""
      }
    }
  });
}
