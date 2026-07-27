import type { ListLiteratureResponse } from "@jixia/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { LiteratureRouteSurface } from "./LiteratureRouteSurface";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("announces successful partial-import warnings at the Library destination", async () => {
  // Given: navigation opens the imported record with a provider enrichment warning.
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({
    literature: [],
    nextCursor: null
  } satisfies ListLiteratureResponse)));

  // When: the personal Library destination renders.
  render(
    <LiteratureRouteSurface
      importWarnings={["unpaywall_enrichment_unavailable"]}
      locale="en"
      onOpenLiterature={vi.fn()}
      surface="library"
      target={{ scope: "personal" }}
    />
  );

  // Then: the warning is visible in the destination status region.
  expect(screen.getByLabelText("Import completed with warnings").textContent).toMatch(/Unpaywall enrichment was unavailable/i);
  expect(await screen.findByText("No personal literature")).toBeTruthy();
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
