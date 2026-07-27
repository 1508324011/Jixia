import { describe, expect, it } from "vitest";

import { normalizeProviderReferenceUrl } from "./provider-reference-url.js";

describe("provider reference URL normalization", () => {
  it.each([
    "https://publisher.example/file.pdf?%2574oken=secret",
    "https://publisher.example/file.pdf?ref=Bearer%2520secret",
    "https://publisher.example/file.pdf?bearer=secret",
    "https://publisher.example/file.pdf?ref=Bearer%2509secret",
    "https://publisher.example/file.pdf?ref=Bearer%250Asecret",
    "https://publisher.example/file.pdf?next=download%2526bearer%253Dsecret",
    "https://publisher.example/file.pdf?ref=download%2526token%253Dsecret",
    "https://publisher.example/file.pdf?ref=%25G%2526token%253Dsecret",
    "https://publisher.example/file.pdf?ref=%25ba%2526token%253Dsecret"
  ])("rejects nested query credentials in %s", (value) => {
    expect(() => normalizeProviderReferenceUrl(value)).toThrow();
  });

  it.each([
    "https://publisher.example/file.pdf?download=1;sig=secret",
    "https://publisher.example/file.pdf?download%253Bsig%253Dsecret",
    "https://publisher.example/file.pdf?ref=download%253Bsig%253Dsecret",
    "https://publisher.example/file.pdf?ref=Bearer%E2%80%8Bsecret",
    "https://publisher.example/file.pdf?ref=Bearer%25E2%2580%258Bsecret",
    "https://publisher.example/file.pdf?ref=https%3A%2F%2Fuser%3Apass%40other.example",
    "https://publisher.example/file.pdf?ref=https%253A%252F%252Fuser%253Apass%2540other.example",
    "https://publisher.example/file.pdf#https://user:pass@other.example",
    "https://publisher.example/file.pdf#%252F%252Fuser%253Apass%2540other.example"
  ])("rejects structurally hidden credentials in %s", (value) => {
    expect(() => normalizeProviderReferenceUrl(value)).toThrow();
  });

  it.each([
    "https://publisher.example/file.pdf?%2574oken%25=secret",
    "https://publisher.example/file.pdf?ref=Bearer%2520secret%25",
    "https://publisher.example/file.pdf?ref=download%2526token%253Dsecret%25"
  ])("rejects nested query credentials when a literal percent blocks a later decode in %s", (value) => {
    expect(() => normalizeProviderReferenceUrl(value)).toThrow();
  });

  it.each([
    "https://publisher.example/file.pdf?%E0%A4=value",
    "https://publisher.example/file.pdf?ref=%E0%A4"
  ])("rejects malformed query encoding in %s", (value) => {
    expect(() => normalizeProviderReferenceUrl(value)).toThrow();
  });

  it.each([
    "https://publisher.example/file.pdf#%74oken=secret",
    "https://publisher.example/file.pdf#file=%41WSAccessKeyId%3Dsecret",
    "https://publisher.example/file.pdf#%2574oken=secret",
    "https://publisher.example/file.pdf#bearer=opaque",
    "https://publisher.example/file.pdf#%62earer=opaque",
    "https://publisher.example/file.pdf#route?bearer=opaque",
    "https://publisher.example/file.pdf#next=download%2526bearer%253Dopaque"
  ])("rejects encoded fragment credentials in %s", (value) => {
    expect(() => normalizeProviderReferenceUrl(value)).toThrow();
  });

  it("rejects malformed fragment encoding", () => {
    expect(() => normalizeProviderReferenceUrl(
      "https://publisher.example/file.pdf#%E0%A4%A"
    )).toThrow();
  });

  it("retains an ordinary encoded fragment", () => {
    expect(normalizeProviderReferenceUrl(
      "https://publisher.example/file.pdf#section%202"
    )).toBe("https://publisher.example/file.pdf#section%202");
  });

  it("retains an ordinary encoded query value", () => {
    expect(normalizeProviderReferenceUrl(
      "https://publisher.example/file.pdf?section=%E7%BB%93%E6%9E%9C"
    )).toBe("https://publisher.example/file.pdf?section=%E7%BB%93%E6%9E%9C");
  });

  it("retains an encoded literal percent in a query value", () => {
    for (const value of [
      "https://publisher.example/file.pdf?progress=100%25",
      "https://publisher.example/file.pdf?label=%25bar",
      "https://publisher.example/file.pdf?label=around%2520here%25"
    ]) {
      expect(normalizeProviderReferenceUrl(value)).toBe(value);
    }
  });

  it.each([
    "https://publisher.example/file.pdf?label=alpha;beta",
    "https://publisher.example/file.pdf?label=Bearer-token",
    "https://publisher.example/file.pdf?ref=https%3A%2F%2Fother.example%2Fpath%3Fx%3D1",
    "https://publisher.example/file.pdf?ref=%252F%252Fother.example%252Fpath",
    "https://publisher.example/file.pdf#https://other.example/path"
  ])("retains an ordinary structured reference in %s", (value) => {
    expect(normalizeProviderReferenceUrl(value)).toBe(value);
  });
});
