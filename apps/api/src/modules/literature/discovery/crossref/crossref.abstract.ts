import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import { normalizeLiteratureText } from "../../literature.normalization.js";
import { LiteraturePayloadError } from "../provider-errors.js";
import { parseLiteratureXml } from "../safe-parser.js";

const crossrefAbstractLimitBytes = 64 * 1024;
const invalidXmlAmpersandPattern = /&(?!(?:amp|lt|gt|quot|apos|#(?:x[0-9A-Fa-f]+|[0-9]+));)/u;
const unsafeXmlCharacterPattern =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ud800-\udfff\ufffe\uffff]/u;
const xmlEntityPattern = /&(?:amp|lt|gt|quot|apos|#(?:x[0-9A-Fa-f]+|[0-9]+));/gu;
const jsonValueSchema = z.json();
const orderedXmlDocumentSchema = z.array(jsonValueSchema).max(4).readonly();
const validatedXmlDocumentSchema = z.object({
  "crossref-abstract": jsonValueSchema
}).readonly();
const orderedJatsParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: true,
  processEntities: false,
  parseTagValue: false
});

type JsonValue = z.infer<typeof jsonValueSchema>;

export function normalizeCrossrefAbstract(fragment: string): string | null {
  assertSafeXmlText(fragment);
  const wrapped = `<crossref-abstract>${fragment}</crossref-abstract>`;
  parseLiteratureXml({
    text: wrapped,
    schema: validatedXmlDocumentSchema,
    maxBytes: crossrefAbstractLimitBytes
  });

  const parsed: unknown = orderedJatsParser.parse(wrapped);
  const ordered = orderedXmlDocumentSchema.safeParse(parsed);
  if (!ordered.success) {
    throw new LiteraturePayloadError("invalid_response");
  }

  const textParts: string[] = [];
  for (const root of ordered.data) {
    collectTextNodes(root, textParts);
  }
  const normalized = normalizeLiteratureText(decodeXmlEntities(textParts.join(" ")));
  return normalized.length === 0 ? null : normalized;
}

function collectTextNodes(value: JsonValue, textParts: string[]): void {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectTextNodes(child, textParts);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [name, child] of Object.entries(value)) {
    if (name === "#text" && typeof child === "string") {
      textParts.push(child);
      continue;
    }
    collectTextNodes(child, textParts);
  }
}

function decodeXmlEntities(value: string): string {
  return value.replace(xmlEntityPattern, (entity) => {
    switch (entity) {
      case "&amp;":
        return "&";
      case "&lt;":
        return "<";
      case "&gt;":
        return ">";
      case "&quot;":
        return '"';
      case "&apos;":
        return "'";
    }

    const hexadecimal = entity.startsWith("&#x");
    const digits = entity.slice(hexadecimal ? 3 : 2, -1);
    const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
    if (
      !Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff) || isUnsafeXmlCharacter(codePoint)
    ) {
      throw new LiteraturePayloadError("invalid_response");
    }
    return String.fromCodePoint(codePoint);
  });
}

function assertSafeXmlText(value: string): void {
  if (unsafeXmlCharacterPattern.test(value) || invalidXmlAmpersandPattern.test(value)) {
    throw new LiteraturePayloadError("invalid_response");
  }
}

function isUnsafeXmlCharacter(codePoint: number): boolean {
  return (
    (codePoint >= 0 && codePoint <= 0x08) || codePoint === 0x0b || codePoint === 0x0c ||
    (codePoint >= 0x0e && codePoint <= 0x1f) ||
    (codePoint >= 0x7f && codePoint <= 0x9f) || codePoint === 0xfffe || codePoint === 0xffff
  );
}
