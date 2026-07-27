import { LiteraturePayloadError } from "./provider-errors.js";

type ProviderReferenceProtocol = "ftp:" | "http:" | "https:";

const defaultProtocols: readonly ProviderReferenceProtocol[] = ["http:", "https:"];
const forbiddenParameterNames = new Set([
  "accesskey",
  "apikey",
  "auth",
  "authorization",
  "bearer",
  "credential",
  "key",
  "password",
  "secret",
  "session",
  "sig",
  "signature",
  "signedurl",
  "token",
  "xamzalgorithm",
  "xamzcredential",
  "xamzdate",
  "xamzexpires",
  "xamzsecuritytoken",
  "xamzsignature",
  "xamzsignedheaders",
  "xgoogalgorithm",
  "xgoogcredential",
  "xgoogdate",
  "xgoogexpires",
  "xgoogsignature",
  "xgoogsignedheaders"
]);
const forbiddenParameterFragments = [
  "apikey",
  "credential",
  "password",
  "secret",
  "signature",
  "signedurl",
  "token"
] as const;
const forbiddenValueFragments = [
  "awsaccesskeyid=",
  "bearer ",
  "x-amz-credential=",
  "x-amz-signature=",
  "x-goog-signature="
] as const;
const hexOctetPattern = /^[0-9a-f]{2}$/iu;
const maximumComponentDecodePasses = 8;
const maximumUtf8Octets = 4;

export function normalizeProviderReferenceUrl(
  value: string,
  allowedProtocols: readonly ProviderReferenceProtocol[] = defaultProtocols
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    if (error instanceof TypeError) {
      throw invalidReferenceUrl();
    }
    throw error;
  }

  if (
    !isProviderReferenceProtocol(url.protocol) ||
    !allowedProtocols.includes(url.protocol) ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw invalidReferenceUrl();
  }
  if (url.search.length > 0) {
    validateRawReferenceEncoding(url.search);
  }
  for (const [name, parameterValue] of url.searchParams) {
    const decodedName = decodeReferenceComponent(name);
    const decodedValue = decodeReferenceComponent(parameterValue);
    if (
      isSensitiveParameterName(decodedName) ||
      containsSensitiveEmbeddedParameters(decodedName) ||
      containsSensitiveValue(decodedValue) ||
      containsSensitiveEmbeddedParameters(decodedValue) ||
      containsCredentialedEmbeddedUrl(decodedValue)
    ) {
      throw invalidReferenceUrl();
    }
  }
  if (url.hash.length > 0) {
    validateRawReferenceEncoding(url.hash);
    const fragment = decodeReferenceComponent(url.hash);
    if (
      isSensitiveParameterName(fragment) ||
      containsSensitiveValue(fragment) ||
      containsSensitiveEmbeddedParameters(fragment) ||
      containsCredentialedEmbeddedUrl(fragment)
    ) {
      throw invalidReferenceUrl();
    }
  }
  return url.toString();
}

function isProviderReferenceProtocol(value: string): value is ProviderReferenceProtocol {
  return value === "ftp:" || value === "http:" || value === "https:";
}

function isSensitiveParameterName(value: string): boolean {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "");
  return forbiddenParameterNames.has(normalized) ||
    forbiddenParameterFragments.some((fragment) => normalized.includes(fragment));
}

function containsSensitiveValue(value: string): boolean {
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{White_Space}\p{Cf}]+/gu, " ");
  return forbiddenValueFragments.some((fragment) => normalized.includes(fragment));
}

function containsSensitiveEmbeddedParameters(value: string): boolean {
  if (!value.includes("=") && !value.includes("&") && !value.includes(";")) {
    return false;
  }
  const parameters = new URLSearchParams(value.replace(/[?#;]/gu, "&"));
  for (const [name, parameterValue] of parameters) {
    if (
      isSensitiveParameterName(name) ||
      containsSensitiveValue(parameterValue) ||
      containsCredentialedEmbeddedUrl(parameterValue)
    ) {
      return true;
    }
  }
  return false;
}

function containsCredentialedEmbeddedUrl(value: string): boolean {
  const candidate = value.trim().replace(/^[#?]+/u, "");
  let embeddedUrl: URL;
  try {
    embeddedUrl = new URL(candidate, "https://provider-reference.invalid");
  } catch (error) {
    if (error instanceof TypeError) {
      return false;
    }
    throw error;
  }
  return embeddedUrl.username.length > 0 || embeddedUrl.password.length > 0;
}

function decodeReferenceComponent(value: string): string {
  let decoded = value;
  for (let pass = 0; pass < maximumComponentDecodePasses; pass += 1) {
    const result = decodeReferenceOctets(decoded);
    if (!result.changed) {
      return decoded;
    }
    decoded = result.value;
  }
  if (decodeReferenceOctets(decoded).changed) {
    throw invalidReferenceUrl();
  }
  return decoded;
}

function decodeReferenceOctets(value: string): {
  readonly value: string;
  readonly changed: boolean;
} {
  let decoded = "";
  let changed = false;
  let index = 0;
  while (index < value.length) {
    if (!isEncodedOctetAt(value, index)) {
      decoded += value[index];
      index += 1;
      continue;
    }
    let octetCount = 1;
    while (
      octetCount < maximumUtf8Octets &&
      isEncodedOctetAt(value, index + octetCount * 3)
    ) {
      octetCount += 1;
    }
    let replacement: string | null = null;
    let consumedOctets = 0;
    for (let candidateCount = octetCount; candidateCount >= 1; candidateCount -= 1) {
      replacement = tryDecodeReferenceEncoding(
        value.slice(index, index + candidateCount * 3)
      );
      if (replacement !== null) {
        consumedOctets = candidateCount;
        break;
      }
    }
    if (replacement === null) {
      decoded += value.slice(index, index + 3);
      index += 3;
      continue;
    }
    decoded += replacement;
    index += consumedOctets * 3;
    changed = true;
  }
  return { value: decoded, changed };
}

function isEncodedOctetAt(value: string, index: number): boolean {
  return value[index] === "%" && hexOctetPattern.test(value.slice(index + 1, index + 3));
}

function validateRawReferenceEncoding(value: string): void {
  if (tryDecodeReferenceEncoding(value) === null) {
    throw invalidReferenceUrl();
  }
}

function tryDecodeReferenceEncoding(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) {
      return null;
    }
    throw error;
  }
}

function invalidReferenceUrl(): LiteraturePayloadError {
  return new LiteraturePayloadError("invalid_response");
}
