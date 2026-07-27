import { describe, expect, it } from "vitest";

import {
  createNcbiTestService,
  ncbiXmlResponse
} from "./ncbi.test-fixture.js";

describe("PMC error envelope coherence", () => {
  it.each([
    ["coherent empty counts", "0", "0"],
    ["inconsistent empty counts", "0", "1"]
  ])("rejects error plus records with %s", async (_caseName, returned, total) => {
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse(pmcErrorResponse(
        `<records returned-count="${returned}" total-count="${total}"></records>`
      ))
    ]);

    const operation = fixture.adapters.pmc.lookup({
      pmcid: "PMC999",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      providerKey: "pmc",
      action: "oa_lookup",
      code: "invalid_response"
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("keeps an error-only response as unavailable", async () => {
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse(pmcErrorResponse(""))
    ]);

    const result = await fixture.adapters.pmc.lookup({
      pmcid: "PMC999",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    expect(result).toBeNull();
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("decodes XML entities in license and resource attributes", async () => {
    const body = [
      "<OA>",
      '<request id="PMC100">request</request>',
      '<records returned-count="1" total-count="1">',
      '<record id="PMC100" license="CC &amp; BY" retracted="no">',
      '<link format="pdf" updated="2026-07-19" href="https://pmc.ncbi.nlm.nih.gov/file.pdf?a=1&amp;b=2"/>',
      "</record></records></OA>"
    ].join("");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    const result = await fixture.adapters.pmc.lookup({
      pmcid: "PMC100",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    expect(result?.openAccess).toMatchObject({
      license: "CC & BY",
      bestUrl: "https://pmc.ncbi.nlm.nih.gov/file.pdf?a=1&b=2"
    });
    expect(result?.resources[0]?.href).toBe(
      "https://pmc.ncbi.nlm.nih.gov/file.pdf?a=1&b=2"
    );
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("decodes an encoded HTTPS scheme before URL validation", async () => {
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse(pmcPointerResponse(
        "https&#x3a;//pmc.ncbi.nlm.nih.gov/encoded-scheme.pdf"
      ))
    ]);

    const result = await fixture.adapters.pmc.lookup({
      pmcid: "PMC100",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    expect(result?.openAccess.bestUrl).toBe(
      "https://pmc.ncbi.nlm.nih.gov/encoded-scheme.pdf"
    );
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects an encoded file scheme after XML decoding", async () => {
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse(pmcPointerResponse(
        "file&#x3a;///tmp/local-secret.pdf"
      ))
    ]);
    const operation = fixture.adapters.pmc.lookup({
      pmcid: "PMC100",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      providerKey: "pmc",
      action: "oa_lookup",
      code: "invalid_response"
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects credential-bearing resource URLs", async () => {
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse(pmcPointerResponse(
        "https://pmc.ncbi.nlm.nih.gov/file.pdf?X-Amz-Signature=provider-secret"
      ))
    ]);
    const operation = fixture.adapters.pmc.lookup({
      pmcid: "PMC100",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      providerKey: "pmc",
      action: "oa_lookup",
      code: "invalid_response"
    });
  });

  it.each([
    "?next=download%2526bearer%253Dprovider-secret",
    "#bearer=opaque",
    "?download=1;sig=provider-secret",
    "?ref=Bearer%E2%80%8Bprovider-secret",
    "?ref=https%3A%2F%2Fuser%3Aprovider-secret%40other.example",
    "#//user:provider-secret@other.example"
  ])("rejects credential-bearing resource URLs", async (suffix) => {
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse(pmcPointerResponse(
        `https://pmc.ncbi.nlm.nih.gov/file.pdf${suffix}`
      ))
    ]);
    const operation = fixture.adapters.pmc.lookup({
      pmcid: "PMC100",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      providerKey: "pmc",
      action: "oa_lookup",
      code: "invalid_response"
    });
  });

  it("rejects an overlong PMCID before transport", async () => {
    const fixture = createNcbiTestService([]);
    const operation = fixture.adapters.pmc.lookup({
      pmcid: `PMC${"1".repeat(17)}`,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      providerKey: "pmc",
      action: "oa_lookup",
      code: "provider_rejected"
    });
    expect(fixture.fetchImplementation).not.toHaveBeenCalled();
  });
});

function pmcErrorResponse(records: string): string {
  return [
    "<OA>",
    '<request id="PMC999">request</request>',
    '<error code="idIsNotOpenAccess">Identifier is not in the OA subset</error>',
    records,
    "</OA>"
  ].join("");
}

function pmcPointerResponse(href: string): string {
  return [
    "<OA>",
    '<request id="PMC100">request</request>',
    '<records returned-count="1" total-count="1">',
    '<record id="PMC100" license="CC BY" retracted="no">',
    `<link format="pdf" updated="2026-07-19" href="${href}"/>`,
    "</record></records></OA>"
  ].join("");
}
