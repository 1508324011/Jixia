import { describe, expect, it } from "vitest";

import { parseApiEnv } from "../../../config/env.js";
import { LiteratureProviderError } from "./provider-errors.js";
import {
  loadLiteratureProviderConfig,
  requireLiteratureProviderConfig
} from "./provider-config.js";

describe("literature provider environment config", () => {
  it("keeps every adapter typed-disabled when provider environment is missing", () => {
    // Given
    const env = { NODE_ENV: "test" };

    // When
    const config = loadLiteratureProviderConfig(env);

    // Then
    expect(config).toEqual({
      providers: {
        openalex: { status: "disabled", providerKey: "openalex" },
        crossref: { status: "disabled", providerKey: "crossref" },
        pubmed: { status: "disabled", providerKey: "pubmed" },
        pmc: { status: "disabled", providerKey: "pmc" },
        unpaywall: { status: "disabled", providerKey: "unpaywall" }
      },
      cursor: { status: "disabled" }
    });
    expect(() => parseApiEnv(env)).not.toThrow();
  });

  it("loads complete server-only configuration into provider-specific states", () => {
    // Given
    const env = {
      OPENALEX_API_KEY: "openalex-secret",
      CROSSREF_MAILTO: "crossref@example.test",
      NCBI_API_KEY: "ncbi-secret",
      NCBI_TOOL: "jixia",
      NCBI_EMAIL: "ncbi@example.test",
      UNPAYWALL_EMAIL: "unpaywall@example.test",
      LITERATURE_CURSOR_SECRET: "c".repeat(32)
    };

    // When
    const config = loadLiteratureProviderConfig(env);

    // Then
    expect(config.providers.openalex).toEqual({
      status: "enabled",
      config: { providerKey: "openalex", apiKey: "openalex-secret" }
    });
    expect(config.providers.crossref).toEqual({
      status: "enabled",
      config: { providerKey: "crossref", mailto: "crossref@example.test" }
    });
    expect(config.providers.pubmed).toEqual({
      status: "enabled",
      config: {
        providerKey: "pubmed",
        apiKey: "ncbi-secret",
        tool: "jixia",
        email: "ncbi@example.test"
      }
    });
    expect(config.providers.pmc).toEqual({
      status: "enabled",
      config: {
        providerKey: "pmc",
        apiKey: "ncbi-secret",
        tool: "jixia",
        email: "ncbi@example.test"
      }
    });
    expect(config.providers.unpaywall).toEqual({
      status: "enabled",
      config: { providerKey: "unpaywall", email: "unpaywall@example.test" }
    });
    expect(config.cursor).toEqual({ status: "enabled", secret: "c".repeat(32) });
  });

  it("disables only providers whose present configuration is partial or malformed", () => {
    // Given
    const env = {
      OPENALEX_API_KEY: "openalex-secret",
      CROSSREF_MAILTO: "not-an-email",
      NCBI_API_KEY: "ncbi-secret",
      NCBI_TOOL: "jixia",
      UNPAYWALL_EMAIL: "unpaywall@example.test",
      LITERATURE_CURSOR_SECRET: "short"
    };

    // When
    const config = loadLiteratureProviderConfig(env);

    // Then
    expect(config.providers.openalex.status).toBe("enabled");
    expect(config.providers.crossref.status).toBe("disabled");
    expect(config.providers.pubmed.status).toBe("disabled");
    expect(config.providers.pmc.status).toBe("disabled");
    expect(config.providers.unpaywall.status).toBe("enabled");
    expect(config.cursor.status).toBe("disabled");
  });

  it("does not cache a stale environment snapshot", () => {
    // Given
    const first = loadLiteratureProviderConfig({});

    // When
    const second = loadLiteratureProviderConfig({ OPENALEX_API_KEY: "new-secret" });

    // Then
    expect(first.providers.openalex.status).toBe("disabled");
    expect(second.providers.openalex.status).toBe("enabled");
  });

  it("turns a disabled state into a sanitized typed provider error", () => {
    // Given
    const state = loadLiteratureProviderConfig({}).providers.openalex;

    // When
    let captured: unknown;
    try {
      requireLiteratureProviderConfig(state, "search");
    } catch (error) {
      if (error instanceof LiteratureProviderError) {
        captured = error;
      } else {
        throw error;
      }
    }

    // Then
    expect(captured).toBeInstanceOf(LiteratureProviderError);
    if (captured instanceof LiteratureProviderError) {
      expect(captured).toMatchObject({
        providerKey: "openalex",
        action: "search",
        code: "provider_unconfigured",
        attempt: 0
      });
      expect(JSON.stringify(captured)).not.toMatch(/\bapiKey\b|secret|environment/i);
    }
  });
});
