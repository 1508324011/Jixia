import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { z } from "zod";

import { LiteraturePayloadError } from "./provider-errors.js";

const defaultPayloadLimitBytes = 1024 * 1024;
const unsafeXmlDeclarationPattern = /<!(?:DOCTYPE|ENTITY)\b/iu;
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false
});

export type LiteraturePayloadBoundary<TSchema extends z.ZodType> = {
  readonly text: string;
  readonly schema: TSchema;
  readonly maxBytes?: number;
};

export function parseLiteratureJson<TSchema extends z.ZodType>(
  input: LiteraturePayloadBoundary<TSchema>
): z.infer<TSchema> {
  assertPayloadSize(input.text, input.maxBytes);
  try {
    const value: unknown = JSON.parse(input.text);
    return input.schema.parse(value);
  } catch (error) {
    if (error instanceof LiteraturePayloadError) {
      throw error;
    }
    throw new LiteraturePayloadError("invalid_response");
  }
}

export function parseLiteratureXml<TSchema extends z.ZodType>(
  input: LiteraturePayloadBoundary<TSchema>
): z.infer<TSchema> {
  assertPayloadSize(input.text, input.maxBytes);
  if (unsafeXmlDeclarationPattern.test(input.text)) {
    throw new LiteraturePayloadError("unsafe_response");
  }
  try {
    if (XMLValidator.validate(input.text) !== true) {
      throw new LiteraturePayloadError("invalid_response");
    }
    const value: unknown = xmlParser.parse(input.text);
    return input.schema.parse(value);
  } catch (error) {
    if (error instanceof LiteraturePayloadError) {
      throw error;
    }
    throw new LiteraturePayloadError("invalid_response");
  }
}

function assertPayloadSize(text: string, maxBytes = defaultPayloadLimitBytes): void {
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new LiteraturePayloadError("response_too_large");
  }
}
