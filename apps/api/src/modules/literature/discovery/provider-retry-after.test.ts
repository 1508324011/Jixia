import { describe, expect, it } from "vitest";

import { boundedProviderRetryAfterMs } from "./provider-retry-after.js";

describe("literature provider Retry-After parsing", () => {
  it.each([
    " ",
    "+2",
    "-2",
    "2.5",
    "2e1",
    "Sun, 32 Jul 2026 12:00:00 GMT"
  ])("rejects non-DIGIT delay-seconds and malformed HTTP-date %j", (value) => {
    // Given
    const headers = new Headers({ "Retry-After": value });

    // When
    const delayMs = boundedProviderRetryAfterMs(headers, 1_000);

    // Then
    expect(delayMs).toBeNull();
  });

  it("bounds arbitrarily large DIGIT delay-seconds before numeric overflow", () => {
    // Given
    const headers = new Headers({ "Retry-After": "9".repeat(1_000) });

    // When
    const delayMs = boundedProviderRetryAfterMs(headers, 1_000);

    // Then
    expect(delayMs).toBe(2_000);
  });

  it("accepts zero-padded DIGIT delay-seconds and canonical HTTP-date", () => {
    // Given
    const nowMs = Date.parse("2026-07-18T12:00:00.000Z");
    const seconds = new Headers({ "Retry-After": "0002" });
    const date = new Headers({
      "Retry-After": new Date(nowMs + 1_000).toUTCString()
    });

    // When
    const delays = [
      boundedProviderRetryAfterMs(seconds, nowMs),
      boundedProviderRetryAfterMs(date, nowMs)
    ];

    // Then
    expect(delays).toEqual([2_000, 1_000]);
  });
});
