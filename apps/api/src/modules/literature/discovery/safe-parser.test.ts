import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { LiteraturePayloadError } from "./provider-errors.js";
import { parseLiteratureJson, parseLiteratureXml } from "./safe-parser.js";

async function capturePayloadError(operation: () => unknown): Promise<LiteraturePayloadError> {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(LiteraturePayloadError);
    if (error instanceof LiteraturePayloadError) {
      return error;
    }
    throw error;
  }
  throw new LiteraturePayloadError("internal_error");
}

describe("literature provider payload boundaries", () => {
  it("parses strict bounded JSON directly into its schema type", () => {
    // Given
    const schema = z.object({ ok: z.literal(true), items: z.array(z.string()).max(2) }).strict();

    // When
    const result = parseLiteratureJson({
      text: '{"ok":true,"items":["a","b"]}',
      schema
    });

    // Then
    expect(result).toEqual({ ok: true, items: ["a", "b"] });
  });

  it("rejects malformed JSON, unknown fields, and over-limit collections", async () => {
    // Given
    const schema = z.object({ items: z.array(z.string()).max(2) }).strict();
    const payloads = [
      "{",
      '{"items":[],"providerPayload":{"secret":"hidden"}}',
      '{"items":["a","b","c"]}'
    ];

    // When
    const errors = await Promise.all(payloads.map((text) => capturePayloadError(
      () => parseLiteratureJson({ text, schema })
    )));

    // Then
    expect(errors.map((error) => error.code)).toEqual([
      "invalid_response",
      "invalid_response",
      "invalid_response"
    ]);
    expect(JSON.stringify(errors)).not.toMatch(/providerPayload|secret|hidden|items/i);
  });

  it("applies a UTF-8 byte bound before JSON parsing", async () => {
    // Given
    const text = '"éé"';

    // When
    const error = await capturePayloadError(
      () => parseLiteratureJson({ text, schema: z.string(), maxBytes: 5 })
    );

    // Then
    expect(error.code).toBe("response_too_large");
  });

  it("validates and parses XML with entity processing disabled", () => {
    // Given
    const schema = z.object({
      root: z.object({ item: z.string() }).strict()
    }).strict();

    // When
    const result = parseLiteratureXml({
      text: "<root><item>safe text</item></root>",
      schema
    });

    // Then
    expect(result).toEqual({ root: { item: "safe text" } });
  });

  it("validates XML through the parser package before parsing", () => {
    // Given
    const text = "<root><item>safe text</item></root>";
    const validate = vi.spyOn(XMLValidator, "validate");

    try {
      // When
      parseLiteratureXml({
        text,
        schema: z.object({
          root: z.object({ item: z.string() }).strict()
        }).strict()
      });

      // Then
      expect(validate).toHaveBeenCalledWith(text);
    } finally {
      validate.mockRestore();
    }
  });

  it("rejects DOCTYPE and entity declarations before XML parse", async () => {
    // Given
    const malicious = [
      '<!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>',
      '<!ENTITY xxe "expanded"><root>&xxe;</root>'
    ];

    // When
    const errors = await Promise.all(malicious.map((text) => capturePayloadError(
      () => parseLiteratureXml({ text, schema: z.object({ root: z.unknown() }).strict() })
    )));

    // Then
    expect(errors.map((error) => error.code)).toEqual([
      "unsafe_response",
      "unsafe_response"
    ]);
    expect(JSON.stringify(errors)).not.toMatch(/etc\/passwd|xxe|expanded/i);
  });

  it("rejects malformed, schema-invalid, and oversized XML", async () => {
    // Given
    const cases = [
      {
        text: "<root><item></root>",
        schema: z.object({ root: z.object({ item: z.string() }) }).strict(),
        code: "invalid_response" as const
      },
      {
        text: "<root><unexpected>value</unexpected></root>",
        schema: z.object({ root: z.object({ item: z.string() }).strict() }).strict(),
        code: "invalid_response" as const
      },
      {
        text: `<root>${"é".repeat(20)}</root>`,
        schema: z.unknown(),
        maxBytes: 20,
        code: "response_too_large" as const
      }
    ];

    // When
    for (const testCase of cases) {
      const error = await capturePayloadError(() => parseLiteratureXml({
        text: testCase.text,
        schema: testCase.schema,
        ...(testCase.maxBytes === undefined ? {} : { maxBytes: testCase.maxBytes })
      }));
      expect(error.code).toBe(testCase.code);
    }

    // Then
    expect(cases).toHaveLength(3);
  });
});
