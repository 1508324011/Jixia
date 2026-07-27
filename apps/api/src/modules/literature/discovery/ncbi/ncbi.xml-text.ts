import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import { normalizeLiteratureText } from "../../literature.normalization.js";
import { LiteraturePayloadError } from "../provider-errors.js";
import { assertNcbiXmlCharacters } from "./ncbi.payload.js";

const jsonValueSchema = z.json();
const orderedDocumentSchema = z.array(jsonValueSchema).max(4).readonly();
const orderedParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  processEntities: false,
  parseTagValue: false,
  trimValues: false
});

type JsonValue = z.infer<typeof jsonValueSchema>;

export type PubMedOrderedText = {
  readonly title: string;
  readonly abstractSections: readonly string[];
};

export function extractPubMedOrderedText(xml: string): PubMedOrderedText {
  const parsed: unknown = orderedParser.parse(xml);
  const document = orderedDocumentSchema.safeParse(parsed);
  if (!document.success) {
    throw invalidXmlPayload();
  }
  const titles: JsonValue[] = [];
  const abstractSections: JsonValue[] = [];
  for (const root of document.data) {
    findElementValues(root, "ArticleTitle", titles);
    findElementValues(root, "AbstractText", abstractSections);
  }
  const titleNode = titles[0];
  if (titles.length !== 1 || titleNode === undefined) {
    throw invalidXmlPayload();
  }
  const title = orderedText(titleNode);
  if (title.length === 0) {
    throw invalidXmlPayload();
  }
  return {
    title,
    abstractSections: abstractSections.map(orderedText)
  };
}

export function normalizeNcbiXmlText(value: string): string {
  assertNcbiXmlCharacters(value);
  const namedEntitiesDecoded = decodeNamedXmlEntities(value);
  assertNcbiXmlCharacters(namedEntitiesDecoded);
  const numericEntitiesDecoded = decodeNumericXmlEntities(namedEntitiesDecoded);
  assertNcbiXmlCharacters(numericEntitiesDecoded);
  return normalizeLiteratureText(numericEntitiesDecoded);
}

function findElementValues(
  value: JsonValue,
  target: string,
  matches: JsonValue[]
): void {
  if (Array.isArray(value)) {
    for (const child of value) {
      findElementValues(child, target, matches);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [name, child] of Object.entries(value)) {
    if (name === target) {
      matches.push(child);
      continue;
    }
    findElementValues(child, target, matches);
  }
}

function orderedText(value: JsonValue): string {
  const parts: string[] = [];
  collectTextNodes(value, parts);
  return normalizeNcbiXmlText(parts.join(""));
}

function collectTextNodes(value: JsonValue, parts: string[]): void {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectTextNodes(child, parts);
    }
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  for (const [name, child] of Object.entries(value)) {
    if (name === "#text" && typeof child === "string") {
      parts.push(child);
      continue;
    }
    if (name !== ":@") {
      collectTextNodes(child, parts);
    }
  }
}

function decodeNamedXmlEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/gu, (entity, name: string) => {
    switch (name) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return entity;
    }
  });
}

function decodeNumericXmlEntities(value: string): string {
  return value.replace(/&#(x[0-9a-f]+|[0-9]+);/giu, (_entity, encoded: string) => {
    const hexadecimal = encoded.toLowerCase().startsWith("x");
    const digits = hexadecimal ? encoded.slice(1) : encoded;
    const codePoint = Number.parseInt(digits, hexadecimal ? 16 : 10);
    return String.fromCodePoint(codePoint);
  });
}

function invalidXmlPayload(): LiteraturePayloadError {
  return new LiteraturePayloadError("invalid_response");
}
