import { describe, expect, it } from "vitest";

import {
  createNcbiTestService,
  ncbiJsonResponse,
  ncbiXmlResponse,
  readNcbiFixture
} from "./ncbi.test-fixture.js";

const supplementaryCharacter = String.fromCodePoint(0x10_000);
const emoji = String.fromCodePoint(0x1_f600);

describe("PubMed residual metadata policy", () => {
  it.each([
    ["raw U+FFFE", String.fromCodePoint(0xfffe)],
    ["raw U+FFFF", String.fromCodePoint(0xffff)],
    ["hexadecimal U+FFFE reference", "&#xFFFE;"],
    ["hexadecimal U+FFFF reference", "&#xFFFF;"],
    ["decimal U+FFFE reference", "&#65534;"],
    ["decimal U+FFFF reference", "&#65535;"]
  ])("rejects %s in modeled XML metadata", async (_caseName, title) => {
    await expectInvalidFetch(pubMedFetchXml(title));
  });

  it.each([
    ["raw U+FFFE", String.fromCodePoint(0xfffe)],
    ["raw U+FFFF", String.fromCodePoint(0xffff)]
  ])("rejects %s in modeled JSON metadata", async (_caseName, character) => {
    await expectInvalidSearch(pubMedSummaryJson(`Before${character}After`));
  });

  it("rejects a forbidden numeric reference in schema-stripped XML", async () => {
    await expectInvalidFetch(pubMedFetchXml(
      "Clean title",
      "<ProviderExtension>&#65535;</ProviderExtension>"
    ));
  });

  it.each([
    ["C0 control", String.fromCodePoint(0x01)],
    ["C1 control", String.fromCodePoint(0x85)],
    ["lone high surrogate", String.fromCharCode(0xd800)],
    ["lone low surrogate", String.fromCharCode(0xdc00)]
  ])("rejects a %s in a schema-stripped JSON key", async (_caseName, key) => {
    await expectInvalidSearch(pubMedSummaryJson("Clean title", key));
  });

  it("keeps deeply nested schema-stripped JSON failures typed", async () => {
    let extension: unknown = {
      [String.fromCodePoint(0x01)]: "forbidden provider metadata"
    };
    for (let depth = 0; depth < 4_000; depth += 1) {
      extension = { nested: extension };
    }

    await expectInvalidSearch(pubMedSummaryJsonWithMetadata(
      "Clean title",
      { extension }
    ));
  });

  it.each([
    ["entity-decoded C0 control", "A&amp;#1;B"],
    ["entity-decoded C1 control", "A&amp;#x85;B"],
    ["entity-decoded U+FFFE", "A&amp;#xFFFE;B"]
  ])("rejects %s", async (_caseName, title) => {
    await expectInvalidFetch(pubMedFetchXml(title));
  });

  it("preserves legal XML whitespace, supplementary scalars, and ampersand text", async () => {
    const title = [
      "Line&#9;one&#10;Line&#13;two",
      `${supplementaryCharacter}${emoji}`,
      "&#x10000;&#128512;",
      "R&amp;D",
      "&amp;#safe;"
    ].join(" ");
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse(pubMedFetchXml(title))
    ]);

    const article = await fixture.adapters.pubmed.fetchSeed({
      recordKey: "1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    expect(article.title).toBe([
      "Line one Line two",
      `${supplementaryCharacter}${emoji}`,
      `${supplementaryCharacter}${emoji}`,
      "R&D",
      "&#safe;"
    ].join(" "));
  });

  it("preserves legal JSON whitespace and supplementary scalars in keys and values", async () => {
    const searchBody = await readNcbiFixture("esearch-page-2.json");
    const fixture = createNcbiTestService([
      () => ncbiJsonResponse(searchBody),
      () => ncbiJsonResponse(pubMedSummaryJson(
        `Line\tone\nLine\rtwo ${supplementaryCharacter}${emoji}`,
        `provider${supplementaryCharacter}${emoji}`
      ))
    ]);

    const result = await fixture.adapters.pubmed.search({
      query: "glioblastoma",
      limit: 1,
      cursor: "2",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    expect(result.records[0]?.title).toBe(
      `Line one Line two ${supplementaryCharacter}${emoji}`
    );
  });
});

async function expectInvalidFetch(body: string): Promise<void> {
  const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);
  const operation = fixture.adapters.pubmed.fetchSeed({
    recordKey: "1",
    operationDeadlineMs: fixture.operationDeadlineMs
  });

  await expect(operation).rejects.toMatchObject({
    providerKey: "pubmed",
    action: "fetch_seed",
    code: "invalid_response"
  });
  expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
}

async function expectInvalidSearch(summaryBody: string): Promise<void> {
  const searchBody = await readNcbiFixture("esearch-page-2.json");
  const fixture = createNcbiTestService([
    () => ncbiJsonResponse(searchBody),
    () => ncbiJsonResponse(summaryBody)
  ]);
  const operation = fixture.adapters.pubmed.search({
    query: "glioblastoma",
    limit: 1,
    cursor: "2",
    operationDeadlineMs: fixture.operationDeadlineMs
  });

  await expect(operation).rejects.toMatchObject({
    providerKey: "pubmed",
    action: "search",
    code: "invalid_response"
  });
  expect(fixture.fetchImplementation).toHaveBeenCalledTimes(2);
}

function pubMedFetchXml(title: string, providerExtension = ""): string {
  return [
    "<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>1</PMID><Article>",
    "<Journal><JournalIssue><PubDate><Year>2024</Year></PubDate></JournalIssue>",
    "<Title>Policy Journal</Title></Journal>",
    `<ArticleTitle>${title}</ArticleTitle>${providerExtension}`,
    "</Article></MedlineCitation><PubmedData><ArticleIdList>",
    '<ArticleId IdType="pubmed">1</ArticleId>',
    "</ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>"
  ].join("");
}

function pubMedSummaryJson(title: string, providerKey?: string): string {
  return pubMedSummaryJsonWithMetadata(
    title,
    providerKey === undefined ? {} : { [providerKey]: "provider metadata" }
  );
}

function pubMedSummaryJsonWithMetadata(
  title: string,
  providerMetadata: Readonly<Record<string, unknown>>
): string {
  return JSON.stringify({
    header: {
      type: "esummary",
      version: "0.3",
      ...providerMetadata
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
