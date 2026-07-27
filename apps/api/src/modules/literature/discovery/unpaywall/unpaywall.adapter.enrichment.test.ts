import { describe, expect, it } from "vitest";

import {
  createUnpaywallTestAdapter,
  readUnpaywallFixture,
  unpaywallJsonResponse
} from "./unpaywall.test-fixture.js";

describe("Unpaywall DOI enrichment", () => {
  it("requests one canonical DOI with server email and normalizes the best OA pointer", async () => {
    const body = await readUnpaywallFixture("oa-publisher.json");
    const fixture = createUnpaywallTestAdapter([() => unpaywallJsonResponse(body)]);

    const result = await fixture.adapter.enrichDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    const request = fixture.fetchImplementation.mock.calls[0];
    const url = new URL(request?.[0] ?? "https://invalid.example");
    expect(url.origin).toBe("https://api.unpaywall.org");
    expect(url.pathname).toBe("/v2/10.1000%2Falpha");
    expect(url.searchParams.get("email")).toBe("unpaywall-test@example.com");
    expect(request?.[1]).toMatchObject({
      method: "GET",
      redirect: "manual",
      headers: { Accept: "application/json" }
    });
    expect(result).toEqual({
      source: { providerKey: "unpaywall", recordKey: "10.1000/alpha" },
      doi: "10.1000/alpha",
      openAccess: {
        isOpenAccess: true,
        bestUrl: "https://publisher.example/articles/alpha.pdf",
        license: "cc-by",
        version: "published",
        hostType: "publisher"
      },
      publisher: {
        name: "Exact Press",
        landingPageUrl: "https://doi.org/10.1000/alpha"
      }
    });
  });

  it.each([
    {
      doi: "10.1000/../escape",
      expectedPathname: "/v2/10.1000%2F..%2Fescape"
    },
    {
      doi: "10.1000/path/with/slashes",
      expectedPathname: "/v2/10.1000%2Fpath%2Fwith%2Fslashes"
    }
  ])("encodes canonical DOI $doi as one path parameter", async ({ doi, expectedPathname }) => {
    const body = (await readUnpaywallFixture("oa-publisher.json")).replace(
      '"doi": "10.1000/alpha"',
      `"doi": "${doi}"`
    );
    const fixture = createUnpaywallTestAdapter([() => unpaywallJsonResponse(body)]);

    await fixture.adapter.enrichDoi({
      doi,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    const request = fixture.fetchImplementation.mock.calls[0];
    const url = new URL(request?.[0] ?? "https://invalid.example");
    expect(url.origin).toBe("https://api.unpaywall.org");
    expect(url.pathname).toBe(expectedPathname);
    expect(url.searchParams.get("email")).toBe("unpaywall-test@example.com");
  });

  it("normalizes a closed record with no OA location as a valid enrichment", async () => {
    const body = await readUnpaywallFixture("closed-no-location.json");
    const fixture = createUnpaywallTestAdapter([() => unpaywallJsonResponse(body)]);

    const result = await fixture.adapter.enrichDoi({
      doi: "10.1000/closed",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    expect(result.openAccess).toEqual({ isOpenAccess: false });
    expect(result.publisher).toEqual({
      landingPageUrl: "https://doi.org/10.1000/closed"
    });
  });

  it("uses best_oa_location rather than another advertised OA location", async () => {
    const body = await readUnpaywallFixture("oa-multiple-locations.json");
    const fixture = createUnpaywallTestAdapter([() => unpaywallJsonResponse(body)]);

    const result = await fixture.adapter.enrichDoi({
      doi: "10.1000/multiple",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    expect(result.openAccess).toEqual({
      isOpenAccess: true,
      bestUrl: "https://best-repository.example/items/multiple.pdf",
      license: "cc-by-nc",
      version: "accepted",
      hostType: "repository"
    });
  });

  it("accepts an OA location whose version and license are unknown", async () => {
    const body = await readUnpaywallFixture("oa-null-version.json");
    const fixture = createUnpaywallTestAdapter([() => unpaywallJsonResponse(body)]);

    const result = await fixture.adapter.enrichDoi({
      doi: "10.1000/null-version",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    expect(result.openAccess).toEqual({
      isOpenAccess: true,
      bestUrl: "https://repository.example/items/null-version",
      hostType: "repository"
    });
  });

  it("rejects a DOI mismatch in an otherwise valid response", async () => {
    const body = await readUnpaywallFixture("mismatched-doi.json");
    const fixture = createUnpaywallTestAdapter([() => unpaywallJsonResponse(body)]);

    const operation = fixture.adapter.enrichDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      name: "LiteratureProviderIdentityConflictError",
      providerKey: "unpaywall",
      action: "doi_enrichment",
      code: "invalid_response",
      statusClass: "2xx"
    });
    await expect(operation).rejects.not.toHaveProperty("expectedDoi");
    await expect(operation).rejects.not.toHaveProperty("actualDoi");
    await expect(operation).rejects.not.toHaveProperty("body");
  });

  it.each([
    {
      field: "OA resource",
      currentValue: "https://publisher.example/articles/alpha.pdf",
      sensitiveValue:
        "https://publisher.example/articles/alpha.pdf?X-Amz-Signature=provider-secret"
    },
    {
      field: "publisher landing page",
      currentValue: "https://doi.org/10.1000/alpha",
      sensitiveValue: "https://doi.org/10.1000/alpha?access_token=provider-secret"
    },
    {
      field: "nested encoded query name",
      currentValue: "https://publisher.example/articles/alpha.pdf",
      sensitiveValue:
        "https://publisher.example/articles/alpha.pdf?%2574oken=provider-secret"
    },
    {
      field: "tab-separated bearer query value",
      currentValue: "https://publisher.example/articles/alpha.pdf",
      sensitiveValue:
        "https://publisher.example/articles/alpha.pdf?ref=Bearer%2509provider-secret"
    },
    {
      field: "malformed query name",
      currentValue: "https://publisher.example/articles/alpha.pdf",
      sensitiveValue:
        "https://publisher.example/articles/alpha.pdf?%E0%A4=value"
    },
    {
      field: "malformed query value",
      currentValue: "https://publisher.example/articles/alpha.pdf",
      sensitiveValue:
        "https://publisher.example/articles/alpha.pdf?ref=%E0%A4"
    },
    {
      field: "OA resource fragment",
      currentValue: "https://publisher.example/articles/alpha.pdf",
      sensitiveValue:
        "https://publisher.example/articles/alpha.pdf#access_token=provider-secret"
    },
    {
      field: "encoded OA resource fragment name",
      currentValue: "https://publisher.example/articles/alpha.pdf",
      sensitiveValue:
        "https://publisher.example/articles/alpha.pdf#%74oken=provider-secret"
    },
    {
      field: "encoded OA resource fragment value",
      currentValue: "https://publisher.example/articles/alpha.pdf",
      sensitiveValue:
        "https://publisher.example/articles/alpha.pdf#file=%41WSAccessKeyId%3Dprovider-secret"
    },
    {
      field: "neutral bearer fragment",
      currentValue: "https://publisher.example/articles/alpha.pdf",
      sensitiveValue:
        "https://publisher.example/articles/alpha.pdf#bearer=opaque"
    }
  ])("rejects a credential-bearing $field URL", async ({ currentValue, sensitiveValue }) => {
    const body = (await readUnpaywallFixture("oa-publisher.json"))
      .split(currentValue)
      .join(sensitiveValue);
    const fixture = createUnpaywallTestAdapter([() => unpaywallJsonResponse(body)]);

    const operation = fixture.adapter.enrichDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      providerKey: "unpaywall",
      action: "doi_enrichment",
      code: "invalid_response"
    });
  });

  it.each([
    "malformed-location-url.json",
    "malformed-version.json",
    "malformed-host.json",
    "malformed-schema.json",
    "inconsistent-open-access.json"
  ])("rejects malformed controlled response data from %s", async (fixtureName) => {
    const body = await readUnpaywallFixture(fixtureName);
    const fixture = createUnpaywallTestAdapter([() => unpaywallJsonResponse(body)]);

    const operation = fixture.adapter.enrichDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      name: "LiteratureProviderError",
      providerKey: "unpaywall",
      action: "doi_enrichment",
      code: "invalid_response",
      statusClass: "2xx"
    });
  });

  it("rejects noncanonical input before transport", async () => {
    const fixture = createUnpaywallTestAdapter([]);

    const operation = fixture.adapter.enrichDoi({
      doi: "DOI:10.1000/ALPHA",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      providerKey: "unpaywall",
      action: "doi_enrichment",
      code: "provider_rejected",
      attempt: 0
    });
    expect(fixture.fetchImplementation).not.toHaveBeenCalled();
  });
});
