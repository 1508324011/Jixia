import { describe, expect, it } from "vitest";

import {
  createNcbiTestService,
  ncbiXmlResponse,
  readNcbiFixture
} from "./ncbi.test-fixture.js";

describe("PMC open-access pointer lookup", () => {
  it("returns license and resource pointers without following them", async () => {
    // Given
    const body = await readNcbiFixture("pmc-oa.xml");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    // When
    const result = await fixture.adapters.pmc.lookup({
      pmcid: "PMC100",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    const requestUrl = new URL(
      fixture.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.example"
    );
    expect(requestUrl.origin).toBe("https://www.ncbi.nlm.nih.gov");
    expect(requestUrl.pathname).toBe("/pmc/utils/oa/oa.fcgi");
    expect(requestUrl.searchParams.get("id")).toBe("PMC100");
    expect(requestUrl.searchParams.get("tool")).toBe("jixia-test");
    expect(requestUrl.searchParams.get("email")).toBe("ncbi-test@example.com");
    expect(result).toEqual({
      source: { providerKey: "pmc", recordKey: "PMC100" },
      openAccess: {
        isOpenAccess: true,
        bestUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC100/bin/alpha.pdf",
        license: "CC BY",
        hostType: "repository"
      },
      resources: [
        {
          format: "tgz",
          updated: "2026-07-18 09:00:00",
          href: "ftp://ftp.ncbi.nlm.nih.gov/pub/pmc/oa_package/alpha.tar.gz"
        },
        {
          format: "pdf",
          updated: "2026-07-18 09:00:01",
          href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC100/bin/alpha.pdf"
        }
      ]
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
    expect(requestUrl.toString()).not.toContain("alpha.pdf");
    expect(requestUrl.toString()).not.toContain("alpha.tar.gz");
  });

  it("maps empty and non-OA service responses to null", async () => {
    // Given
    const zero = await readNcbiFixture("pmc-zero.xml");
    const nonOa = await readNcbiFixture("pmc-error.xml");
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse(zero),
      () => ncbiXmlResponse(nonOa)
    ]);

    // When
    const empty = await fixture.adapters.pmc.lookup({
      pmcid: "PMC999",
      operationDeadlineMs: fixture.operationDeadlineMs
    });
    const unavailable = await fixture.adapters.pmc.lookup({
      pmcid: "PMC999",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(empty).toBeNull();
    expect(unavailable).toBeNull();
  });

  it("rejects disagreement between PMC counts and the returned records", async () => {
    // Given
    const body = await readNcbiFixture("pmc-count-mismatch.xml");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    // When
    const operation = fixture.adapters.pmc.lookup({
      pmcid: "PMC100",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pmc",
      action: "oa_lookup",
      code: "invalid_response"
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("maps a retracted PMC record to null without following its resource", async () => {
    // Given
    const body = await readNcbiFixture("pmc-retracted.xml");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    // When
    const result = await fixture.adapters.pmc.lookup({
      pmcid: "PMC100",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result).toBeNull();
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
    expect(requestedUrl(fixture).toString()).not.toContain("retracted.pdf");
  });

  it("rejects an unsafe resource pointer without following it", async () => {
    // Given
    const body = await readNcbiFixture("pmc-invalid-pointer.xml");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    // When
    const operation = fixture.adapters.pmc.lookup({
      pmcid: "PMC100",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pmc",
      action: "oa_lookup",
      code: "invalid_response"
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
    expect(requestedUrl(fixture).protocol).toBe("https:");
    expect(requestedUrl(fixture).toString()).not.toContain("local-secret.pdf");
  });

  it("rejects malformed PMCID input before transport", async () => {
    // Given
    const fixture = createNcbiTestService([]);

    // When
    const operation = fixture.adapters.pmc.lookup({
      pmcid: "PMC100&url=http://127.0.0.1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pmc",
      action: "oa_lookup",
      code: "provider_rejected",
      attempt: 0
    });
    expect(fixture.fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects a pointer record for a different PMCID", async () => {
    // Given
    const body = [
      "<OA><request id=\"PMC100\">request</request><records returned-count=\"1\" total-count=\"1\">",
      "<record id=\"PMC200\" citation=\"Mismatch\" license=\"CC BY\" retracted=\"no\">",
      "<link format=\"pdf\" updated=\"2026-07-18 09:00:01\" href=\"https://example.com/file.pdf\"/>",
      "</record></records></OA>"
    ].join("");
    const fixture = createNcbiTestService([() => ncbiXmlResponse(body)]);

    // When
    const operation = fixture.adapters.pmc.lookup({
      pmcid: "PMC100",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pmc",
      action: "oa_lookup",
      code: "invalid_response"
    });
  });

  it("preserves HTTP not-found as a typed transport failure", async () => {
    // Given
    const fixture = createNcbiTestService([
      () => ncbiXmlResponse("not found", { status: 404 })
    ]);

    // When
    const operation = fixture.adapters.pmc.lookup({
      pmcid: "PMC999",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "pmc",
      action: "oa_lookup",
      code: "not_found",
      statusClass: "4xx"
    });
  });
});

function requestedUrl(fixture: ReturnType<typeof createNcbiTestService>): URL {
  return new URL(
    fixture.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.example"
  );
}
