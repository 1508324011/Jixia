import { afterEach, describe, expect, it } from "vitest";

import { defaultLocaleForLanguage, synchronizeDocumentLanguage } from "./locale";

describe("locale boundary", () => {
  afterEach(() => {
    document.documentElement.lang = "en";
  });

  it("defaults Chinese browser languages to Simplified Chinese and all others to English", () => {
    expect(defaultLocaleForLanguage("zh-CN")).toBe("zh-CN");
    expect(defaultLocaleForLanguage("zh-Hans")).toBe("zh-CN");
    expect(defaultLocaleForLanguage("en-GB")).toBe("en");
    expect(defaultLocaleForLanguage(undefined)).toBe("en");
  });

  it("synchronizes the document language with the active locale", () => {
    synchronizeDocumentLanguage("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");

    synchronizeDocumentLanguage("en");
    expect(document.documentElement.lang).toBe("en");
  });
});
