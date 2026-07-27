/// <reference types="node" />

import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";

import type { LiteratureProviderKey } from "@jixia/shared";

import { LiteratureProviderError } from "./provider-errors.js";
import { awaitWithLiteratureProviderSignal } from "./provider-timing.js";
import type { LiteratureProviderAddressResolver } from "./provider-types.js";

export type ApprovedLiteratureProviderAddress = {
  readonly address: string;
  readonly family: 4 | 6;
};

export const resolveLiteratureProviderAddresses: LiteratureProviderAddressResolver = async (
  hostname
) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
};

export async function approveLiteratureProviderDestination(input: {
  readonly providerKey: LiteratureProviderKey;
  readonly url: URL;
  readonly resolveAddresses: LiteratureProviderAddressResolver;
  readonly signal: AbortSignal;
}): Promise<readonly ApprovedLiteratureProviderAddress[]> {
  const hostname = normalizeHostname(input.url.hostname);
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw unsafeDestination(input.providerKey);
  }
  if (isIP(hostname) !== 0 && !isPublicAddress(hostname)) {
    throw unsafeDestination(input.providerKey);
  }

  const addresses = await awaitWithLiteratureProviderSignal(
    input.resolveAddresses(hostname, input.signal),
    input.signal
  );
  if (addresses.length === 0) {
    throw unsafeDestination(input.providerKey);
  }

  const approved: ApprovedLiteratureProviderAddress[] = [];
  for (const address of addresses) {
    const normalized = normalizeAddress(address);
    const family = isIP(normalized);
    if (!isPublicAddress(normalized) || (family !== 4 && family !== 6)) {
      throw unsafeDestination(input.providerKey);
    }
    approved.push({ address: normalized, family });
  }
  return approved;
}

export function createPinnedLookup(
  expectedHostname: string,
  addresses: readonly ApprovedLiteratureProviderAddress[]
): LookupFunction {
  const expected = normalizeHostname(expectedHostname);
  let nextAddress = 0;
  return (hostname, options, callback) => {
    if (normalizeHostname(hostname) !== expected) {
      callback(lookupError(), "", 0);
      return;
    }

    const requestedFamily = options.family === 4 || options.family === 6
      ? options.family
      : 0;
    const candidates = requestedFamily === 0
      ? addresses
      : addresses.filter((candidate) => candidate.family === requestedFamily);
    if (candidates.length === 0) {
      callback(lookupError(), "", requestedFamily);
      return;
    }
    if (options.all) {
      callback(null, candidates.map(({ address, family }) => ({ address, family })));
      return;
    }

    const candidate = candidates[nextAddress % candidates.length];
    nextAddress += 1;
    callback(null, candidate?.address ?? "", candidate?.family ?? 0);
  };
}

function lookupError(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error("Provider destination resolution failed.");
  error.code = "ENOTFOUND";
  return error;
}

function unsafeDestination(providerKey: LiteratureProviderKey): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey,
    action: "resolve_destination",
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "unsafe_destination"
  });
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/u, "$1").replace(/\.$/u, "");
}

function normalizeAddress(address: string): string {
  return address.toLowerCase().replace(/^\[(.*)\]$/u, "$1").split("%")[0] ?? "";
}

function isPublicAddress(address: string): boolean {
  const normalized = normalizeAddress(address);
  const version = isIP(normalized);
  if (version === 4) {
    return isPublicIpv4(normalized);
  }
  return version === 6 && isPublicIpv6(normalized);
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [first = 0, second = 0, third = 0] = parts;
  return !(
    first === 0 || first === 10 || first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0 && (third === 0 || third === 2)) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && third === 100) ||
    (first === 203 && second === 0 && third === 113) ||
    first >= 224
  );
}

function isPublicIpv6(address: string): boolean {
  const words = parseIpv6Words(address);
  if (words === null) {
    return false;
  }
  const [first = 0, second = 0] = words;
  const sixth = words[6] ?? 0;
  const seventh = words[7] ?? 0;
  const embeddedIpv4 = `${sixth >> 8}.${sixth & 0xff}.${seventh >> 8}.${seventh & 0xff}`;
  const compatible = words.slice(0, 6).every((word) => word === 0);
  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  if (compatible || mapped) {
    return isPublicIpv4(embeddedIpv4);
  }
  return !(
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first & 0xffc0) === 0xfec0 ||
    (first === 0x2001 && second === 0x0db8) ||
    (first === 0x2001 && second === 0) ||
    first === 0x2002 ||
    (first === 0x0064 && second === 0xff9b)
  );
}

function parseIpv6Words(address: string): readonly number[] | null {
  let normalized = address;
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const octets = normalized.slice(lastColon + 1).split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return null;
    }
    const [a = 0, b = 0, c = 0, d = 0] = octets;
    normalized = `${normalized.slice(0, lastColon)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) {
    return null;
  }
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) {
    return null;
  }
  const parts = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (parts.length !== 8) {
    return null;
  }
  const words = parts.map((part) => Number.parseInt(part, 16));
  return words.every((word, index) => /^[0-9a-f]{1,4}$/iu.test(parts[index] ?? "") && Number.isInteger(word))
    ? words
    : null;
}
