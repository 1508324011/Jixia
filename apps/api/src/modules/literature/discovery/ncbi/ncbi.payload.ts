import type { z } from "zod";

import { LiteraturePayloadError } from "../provider-errors.js";
import {
  parseLiteratureJson,
  parseLiteratureXml,
  type LiteraturePayloadBoundary
} from "../safe-parser.js";

const numericCharacterReferencePattern = /&#(?:x([0-9a-f]+)|([0-9]+));/giu;

export function parseNcbiJson<TSchema extends z.ZodType>(
  input: LiteraturePayloadBoundary<TSchema>
): z.infer<TSchema> {
  const value = parseLiteratureJson(input);
  const rawValue: unknown = JSON.parse(input.text);
  assertNcbiValueCharacters(rawValue);
  return value;
}

export function parseNcbiXml<TSchema extends z.ZodType>(
  input: LiteraturePayloadBoundary<TSchema>
): z.infer<TSchema> {
  assertNcbiXmlCharacters(input.text);
  const value = parseLiteratureXml(input);
  assertNcbiValueCharacters(value);
  return value;
}

export function assertNcbiXmlCharacters(text: string): void {
  assertNcbiTextCharacters(text);
  assertNumericCharacterReferences(text);
}

function assertNumericCharacterReferences(text: string): void {
  for (const match of text.matchAll(numericCharacterReferencePattern)) {
    const hexadecimalDigits = match[1];
    const decimalDigits = match[2];
    const digits = hexadecimalDigits ?? decimalDigits;
    if (digits === undefined) {
      throw invalidNcbiCharacters();
    }
    const codePoint = Number.parseInt(digits, hexadecimalDigits === undefined ? 10 : 16);
    if (!isAllowedNcbiCodePoint(codePoint)) {
      throw invalidNcbiCharacters();
    }
  }
}

function assertNcbiValueCharacters(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === "string") {
      assertNcbiTextCharacters(current);
      continue;
    }
    if (Array.isArray(current)) {
      for (const item of current) {
        pending.push(item);
      }
      continue;
    }
    if (current === null || typeof current !== "object") {
      continue;
    }
    for (const [key, item] of Object.entries(current)) {
      assertNcbiTextCharacters(key);
      pending.push(item);
    }
  }
}

function assertNcbiTextCharacters(value: string): void {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || !isAllowedNcbiCodePoint(codePoint)) {
      throw invalidNcbiCharacters();
    }
  }
}

function isAllowedNcbiCodePoint(codePoint: number): boolean {
  if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return false;
  }
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) {
    return true;
  }
  if (codePoint >= 0x7f && codePoint <= 0x9f) {
    return false;
  }
  return (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10_000 && codePoint <= 0x10_ffff);
}

function invalidNcbiCharacters(): LiteraturePayloadError {
  return new LiteraturePayloadError("invalid_response");
}
