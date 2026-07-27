import { LiteraturePayloadError } from "../provider-errors.js";
import { normalizeProviderReferenceUrl } from "../provider-reference-url.js";
import type { PmcLink, PmcResponse } from "./ncbi.schema.js";
import type {
  PmcOpenAccessPointer,
  PmcOpenAccessResource
} from "./ncbi.types.js";
import { normalizeNcbiXmlText } from "./ncbi.xml-text.js";

export function normalizePmcResponse(
  response: PmcResponse,
  expectedPmcid: string
): PmcOpenAccessPointer | null {
  if (response.OA.error !== undefined) {
    if (response.OA.records !== undefined) {
      throw invalidPmcPayload();
    }
    return null;
  }
  const records = response.OA.records;
  if (records === undefined) {
    throw invalidPmcPayload();
  }
  const returnedCount = parseCount(records["@_returned-count"]);
  const totalCount = parseCount(records["@_total-count"]);
  if (returnedCount === 0 && totalCount === 0 && records.record === undefined) {
    return null;
  }
  const entries = records.record ?? [];
  const record = entries[0];
  if (returnedCount !== 1 || totalCount !== 1 || entries.length !== 1 || record === undefined) {
    throw invalidPmcPayload();
  }
  if (record["@_id"] !== expectedPmcid) {
    throw invalidPmcPayload();
  }
  if (record["@_retracted"] === "yes") {
    return null;
  }
  const resources = record.link.map(normalizeResource);
  const bestUrl = resources.find(
    (resource: PmcOpenAccessResource) => resource.format === "pdf"
  )?.href;
  const license = normalizeNcbiXmlText(record["@_license"]);
  if (license.length === 0) {
    throw invalidPmcPayload();
  }

  return {
    source: { providerKey: "pmc", recordKey: expectedPmcid },
    openAccess: {
      isOpenAccess: true,
      ...(bestUrl === undefined ? {} : { bestUrl }),
      license,
      hostType: "repository"
    },
    resources
  };
}

function normalizeResource(link: PmcLink): PmcOpenAccessResource {
  const href = safeResourceUrl(link["@_href"], link["@_format"]);
  const updated = normalizeNcbiXmlText(link["@_updated"]);
  if (updated.length === 0) {
    throw invalidPmcPayload();
  }
  return { format: link["@_format"], updated, href };
}

function safeResourceUrl(value: string, format: "pdf" | "tgz"): string {
  return normalizeProviderReferenceUrl(
    normalizeNcbiXmlText(value),
    format === "pdf" ? ["http:", "https:"] : ["ftp:", "http:", "https:"]
  );
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw invalidPmcPayload();
  }
  return count;
}

function invalidPmcPayload(): LiteraturePayloadError {
  return new LiteraturePayloadError("invalid_response");
}
