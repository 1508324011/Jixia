import { lookup } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";

import {
  Agent,
  fetch as undiciFetch,
  type Dispatcher,
  type RequestInit as UndiciRequestInit,
  type Response as UndiciResponse
} from "undici";

import type {
  AICapabilityFactState,
  AIConversationContextSnapshot,
  AIConversationMessageDTO,
  AIProviderAuthState,
  AIProviderDiscoveryState,
  AIProviderErrorCategory,
  AIProviderKind,
  AIProviderTransportState
} from "@jixia/shared";

export const providerOrigins: Readonly<Record<Exclude<AIProviderKind, "openai_compatible">, string>> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com/v1"
};

export type AIProviderExecutionConfig = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly provider: string;
  readonly providerKind?: AIProviderKind | undefined;
  readonly baseURL: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly apiKey: string;
};

export type AIProviderConnectionConfig = Omit<AIProviderExecutionConfig, "model" | "temperature" | "maxTokens">;
export type AIProviderModelDiscoveryConfig = AIProviderConnectionConfig;

export type AIProviderCapabilityFacts = {
  readonly contextWindowTokens?: number;
  readonly maxOutputTokens?: number;
  readonly inputModalities?: readonly string[];
  readonly outputModalities?: readonly string[];
  readonly supportedParameters?: readonly string[];
  readonly unsupported?: readonly (
    | "contextWindowTokens"
    | "maxOutputTokens"
    | "inputModalities"
    | "outputModalities"
    | "supportedParameters"
  )[];
};

export type AIProviderDiscoveredModel = {
  readonly id: string;
  readonly displayName?: string;
  readonly capabilities?: AIProviderCapabilityFacts;
};

export type AIProviderVerificationResult = {
  readonly providerKind: AIProviderKind;
  readonly endpointDisplay: string;
  readonly transport: AIProviderTransportState;
  readonly authentication: AIProviderAuthState;
  readonly errorCode: AIProviderErrorCategory | null;
};

export type AIProviderDiscoveryResult = {
  readonly providerKind: AIProviderKind;
  readonly endpointDisplay: string;
  readonly transport: AIProviderTransportState;
  readonly authentication: AIProviderAuthState;
  readonly discovery: AIProviderDiscoveryState;
  readonly errorCode: AIProviderErrorCategory | null;
  readonly models: readonly AIProviderDiscoveredModel[];
};

export type AIProviderUsageMetadata = {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly estimatedCostMicros?: number;
};

export type AIProviderRunInput = {
  readonly config: AIProviderExecutionConfig;
  readonly messages: readonly AIConversationMessageDTO[];
  readonly userMessage: AIConversationMessageDTO;
  readonly selectedContextSnapshot: AIConversationContextSnapshot;
  readonly signal?: AbortSignal;
};

export type AIProviderRunResult = {
  readonly assistantText: string;
  readonly usage?: AIProviderUsageMetadata;
};

export type AIProviderStreamEvent =
  | { readonly type: "delta"; readonly delta: string }
  | { readonly type: "final"; readonly assistantText: string; readonly usage?: AIProviderUsageMetadata };

export type AIProviderAdapter = {
  readonly verifyConnection: (input: { readonly config: AIProviderConnectionConfig }) => Promise<AIProviderVerificationResult>;
  readonly discoverModels: (input: { readonly config: AIProviderModelDiscoveryConfig }) => Promise<AIProviderDiscoveryResult>;
  readonly listModels: (input: { readonly config: AIProviderModelDiscoveryConfig }) => Promise<readonly AIProviderDiscoveredModel[]>;
  readonly runConversation: (input: AIProviderRunInput) => Promise<AIProviderRunResult>;
  readonly streamConversation: (input: AIProviderRunInput) => AsyncIterable<AIProviderStreamEvent>;
};

export type ProviderAddressResolver = (hostname: string) => Promise<readonly string[]>;

type ProviderResponse = {
  readonly ok: boolean;
  readonly status: number;
  readonly body: ProviderBody | null;
};

type ProviderBody = NonNullable<Response["body"]> | NonNullable<UndiciResponse["body"]>;

type ProviderRequestInit = {
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
  readonly signal?: AbortSignal;
  readonly redirect?: "error";
};

type ProviderFetch = (url: string, init: ProviderRequestInit) => Promise<ProviderResponse>;

export type ApprovedProviderAddress = {
  readonly address: string;
  readonly family: 4 | 6;
};

export type AIProviderAdapterOptions = {
  readonly fetchImplementation?: ProviderFetch;
  readonly resolveAddresses?: ProviderAddressResolver;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
};

export class AIProviderExecutionError extends Error {
  constructor(
    readonly category: AIProviderErrorCategory = "unknown",
    message = safeProviderErrorMessage(category)
  ) {
    super(message);
    this.name = "AIProviderExecutionError";
  }
}

const defaultTimeoutMs = 30_000;
const defaultMaxResponseBytes = 1_000_000;
const maxDiscoveredModels = 500;
const anthropicVersion = "2023-06-01";
const maxPinnedDispatchers = 32;

export function createAIProviderAdapter(options: AIProviderAdapterOptions = {}): AIProviderAdapter {
  const fetchImplementation = options.fetchImplementation;
  const resolveAddresses = options.resolveAddresses ?? defaultResolveAddresses;
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const maxResponseBytes = options.maxResponseBytes ?? defaultMaxResponseBytes;
  const pinnedDispatchers = new Map<string, Agent>();

  async function request(config: AIProviderConnectionConfig, path: string, init: ProviderRequestInit): Promise<ProviderResponse> {
    const normalizedConfig = normalizeConnectionConfig(config);
    const url = providerRequestUrl(normalizedConfig, path);
    const signal = createProviderSignal(timeoutMs, init.signal ?? undefined);
    const requestInit: ProviderRequestInit = {
      ...init,
      redirect: "error",
      signal
    };

    try {
      const approvedAddresses = await resolvePublicDestination(url, resolveAddresses, signal);
      if (fetchImplementation) {
        return await fetchImplementation(url.toString(), requestInit);
      }

      const dispatcher = pinnedDispatcherFor(url, approvedAddresses, pinnedDispatchers);
      const undiciInit: UndiciRequestInit = {
        method: requestInit.method,
        headers: requestInit.headers,
        redirect: "error",
        signal,
        dispatcher,
        ...(typeof requestInit.body === "string" ? { body: requestInit.body } : {})
      };
      return await undiciFetch(url.toString(), undiciInit);
    } catch (error) {
      throw providerErrorFromUnknown(error, signal);
    }
  }

  async function verifyConnection(input: { readonly config: AIProviderConnectionConfig }): Promise<AIProviderVerificationResult> {
    const normalized = normalizeConnectionConfig(input.config);
    const path = normalized.providerKind === "openrouter"
      ? "key"
      : normalized.providerKind === "anthropic"
        ? "models?limit=1"
        : "models";

    try {
      const response = await request(normalized, path, {
        method: "GET",
        headers: providerHeaders(normalized, false)
      });

      if (response.ok) {
        validateVerificationPayload(await readBoundedBody(response, maxResponseBytes), normalized.providerKind);
        return verificationResult(normalized, "reachable", "verified", null);
      }

      await discardBoundedBody(response, maxResponseBytes);
      if (normalized.providerKind === "openai_compatible" && isUnsupportedStatus(response.status)) {
        return verificationResult(normalized, "reachable", "unverified", null);
      }

      return verificationResult(
        normalized,
        "reachable",
        response.status === 401 || response.status === 403 ? "rejected" : "unverified",
        categoryFromStatus(response.status)
      );
    } catch (error) {
      const providerError = providerErrorFromUnknown(error);
      return verificationResult(
        normalized,
        providerError.category === "response_parse_failure" ? "reachable" : "unreachable",
        providerError.category === "response_parse_failure" ? "unverified" : "not_checked",
        providerError.category
      );
    }
  }

  async function discoverModels(input: { readonly config: AIProviderModelDiscoveryConfig }): Promise<AIProviderDiscoveryResult> {
    const normalized = normalizeConnectionConfig(input.config);
    const path = normalized.providerKind === "openrouter" ? "models/user" : "models";

    try {
      const response = await request(normalized, path, {
        method: "GET",
        headers: providerHeaders(normalized, false)
      });

      if (!response.ok) {
        await discardBoundedBody(response, maxResponseBytes);
        if (normalized.providerKind === "openai_compatible" && isUnsupportedStatus(response.status)) {
          return discoveryResult(normalized, "reachable", "unverified", "unsupported", null, []);
        }

        const category = categoryFromStatus(response.status);
        return discoveryResult(
          normalized,
          "reachable",
          response.status === 401 || response.status === 403 ? "rejected" : "unverified",
          discoveryStateFromError(category),
          category,
          []
        );
      }

      const payload = parseJson(await readBoundedBody(response, maxResponseBytes));
      const models = normalizeProviderModels(payload, normalized.providerKind);
      return discoveryResult(
        normalized,
        "reachable",
        "verified",
        models.length === 0 ? "empty" : "available",
        null,
        models
      );
    } catch (error) {
      const providerError = providerErrorFromUnknown(error);
      return discoveryResult(
        normalized,
        providerError.category === "response_parse_failure" ? "reachable" : "unreachable",
        "not_checked",
        discoveryStateFromError(providerError.category),
        providerError.category,
        []
      );
    }
  }

  async function runConversation(input: AIProviderRunInput): Promise<AIProviderRunResult> {
    const normalized = normalizeExecutionConfig(input.config);
    const anthropic = normalized.providerKind === "anthropic";
    const response = await request(normalized, anthropic ? "messages" : "chat/completions", {
      method: "POST",
      headers: providerHeaders(normalized, true),
      body: JSON.stringify(anthropic ? anthropicRequestBody(input, false) : openAIRequestBody(input, false)),
      ...(input.signal === undefined ? {} : { signal: input.signal })
    });

    if (!response.ok) {
      await discardBoundedBody(response, maxResponseBytes);
      throw new AIProviderExecutionError(categoryFromStatus(response.status));
    }

    const payload = parseJson(await readBoundedBody(response, maxResponseBytes));
    return anthropic ? normalizeAnthropicResponse(payload) : normalizeOpenAICompatibleResponse(payload);
  }

  async function* streamConversation(input: AIProviderRunInput): AsyncIterable<AIProviderStreamEvent> {
    const normalized = normalizeExecutionConfig(input.config);
    const anthropic = normalized.providerKind === "anthropic";
    const response = await request(normalized, anthropic ? "messages" : "chat/completions", {
      method: "POST",
      headers: providerHeaders(normalized, true),
      body: JSON.stringify(anthropic ? anthropicRequestBody(input, true) : openAIRequestBody(input, true)),
      ...(input.signal === undefined ? {} : { signal: input.signal })
    });

    if (!response.ok) {
      await discardBoundedBody(response, maxResponseBytes);
      throw new AIProviderExecutionError(categoryFromStatus(response.status));
    }

    if (!response.body) {
      throw new AIProviderExecutionError("response_parse_failure");
    }

    yield* streamProviderResponse(response.body, anthropic, maxResponseBytes);
  }

  return {
    verifyConnection,
    discoverModels,
    async listModels(input) {
      const result = await discoverModels(input);
      if (result.discovery === "available" || result.discovery === "empty") {
        return result.models;
      }
      if (result.discovery === "unsupported") {
        return [];
      }
      throw new AIProviderExecutionError(result.errorCode ?? "unknown");
    },
    runConversation,
    streamConversation
  };
}

export function createOpenAICompatibleProviderAdapter(fetchImplementation: typeof fetch = fetch): AIProviderAdapter {
  return createAIProviderAdapter({ fetchImplementation });
}

export function normalizeAIProviderKind(provider: string, providerKind?: AIProviderKind): AIProviderKind {
  if (providerKind) {
    return providerKind;
  }
  const normalized = provider.trim().toLowerCase();
  if (normalized === "openai" || normalized === "openrouter" || normalized === "anthropic") {
    return normalized;
  }
  return "openai_compatible";
}

function providerKindForConnection(config: AIProviderConnectionConfig): AIProviderKind {
  return normalizeAIProviderKind(config.provider, config.providerKind);
}

export function normalizeAIProviderBaseURL(baseURL: string): string {
  let url: URL;
  try {
    url = new URL(baseURL.trim());
  } catch {
    throw new AIProviderExecutionError("invalid_base_url");
  }

  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || isUnsafeLiteralHost(url.hostname)) {
    throw new AIProviderExecutionError("invalid_base_url");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (url.pathname.endsWith("/chat/completions")) {
    url.pathname = url.pathname.slice(0, -"/chat/completions".length) || "/";
  }
  return url.toString().replace(/\/$/, "");
}

export function safeProviderErrorMessage(category: AIProviderErrorCategory): string {
  switch (category) {
    case "invalid_base_url": return "The provider endpoint must be a public HTTPS destination.";
    case "missing_key": return "The provider API key is missing. Add or replace the write-only key and try again.";
    case "invalid_key": return "The provider rejected the API key. Check the key and account permissions.";
    case "model_not_found": return "The provider could not find or run the selected model. Check the model id.";
    case "rate_limit": return "The provider rate limit was reached. Try again later.";
    case "timeout": return "The provider request timed out.";
    case "provider_unavailable": return "The provider endpoint is unavailable. Check the base URL or provider status.";
    case "response_parse_failure": return "The provider returned an unsupported response shape.";
    case "cancelled": return "The AI run was cancelled.";
    case "unknown": return "The AI provider request failed.";
  }
}

export function providerErrorFromUnknown(error: unknown, signal?: AbortSignal): AIProviderExecutionError {
  if (error instanceof AIProviderExecutionError) return error;
  if (isTimeoutError(error) || isTimeoutError(signal?.reason)) return new AIProviderExecutionError("timeout");
  if (isAbortError(error) || signal?.aborted) return new AIProviderExecutionError("cancelled");
  return new AIProviderExecutionError("provider_unavailable");
}

type NormalizedConnectionConfig = AIProviderConnectionConfig & { readonly providerKind: AIProviderKind; readonly baseURL: string };
type NormalizedExecutionConfig = AIProviderExecutionConfig & { readonly providerKind: AIProviderKind; readonly baseURL: string };

function normalizeConnectionConfig(config: AIProviderConnectionConfig): NormalizedConnectionConfig {
  const providerKind = providerKindForConnection(config);
  const baseURL = providerKind === "openai_compatible"
    ? normalizeAIProviderBaseURL(config.baseURL)
    : providerOrigins[providerKind];
  return { ...config, providerKind, baseURL };
}

function normalizeExecutionConfig(config: AIProviderExecutionConfig): NormalizedExecutionConfig {
  return { ...config, ...normalizeConnectionConfig(config) };
}

function providerRequestUrl(config: NormalizedConnectionConfig, path: string): URL {
  const base = new URL(`${config.baseURL.replace(/\/+$/, "")}/`);
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(`${base.pathname.replace(/\/+$/, "")}/`)) {
    throw new AIProviderExecutionError("invalid_base_url");
  }
  return url;
}

function providerHeaders(config: NormalizedConnectionConfig, jsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (jsonBody) headers["Content-Type"] = "application/json";
  if (config.providerKind === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = anthropicVersion;
  } else {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return headers;
}

function verificationResult(
  config: NormalizedConnectionConfig,
  transport: AIProviderTransportState,
  authentication: AIProviderAuthState,
  errorCode: AIProviderErrorCategory | null
): AIProviderVerificationResult {
  return { providerKind: config.providerKind, endpointDisplay: config.baseURL, transport, authentication, errorCode };
}

function discoveryResult(
  config: NormalizedConnectionConfig,
  transport: AIProviderTransportState,
  authentication: AIProviderAuthState,
  discovery: AIProviderDiscoveryState,
  errorCode: AIProviderErrorCategory | null,
  models: readonly AIProviderDiscoveredModel[]
): AIProviderDiscoveryResult {
  return { providerKind: config.providerKind, endpointDisplay: config.baseURL, transport, authentication, discovery, errorCode, models };
}

function discoveryStateFromError(category: AIProviderErrorCategory): AIProviderDiscoveryState {
  if (category === "rate_limit") return "rate_limited";
  if (category === "response_parse_failure") return "malformed";
  return "unavailable";
}

function isUnsupportedStatus(status: number): boolean {
  return status === 404 || status === 405 || status === 501;
}

function categoryFromStatus(status: number): AIProviderErrorCategory {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 404) return "model_not_found";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "provider_unavailable";
  return "unknown";
}

async function defaultResolveAddresses(hostname: string): Promise<readonly string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

async function resolvePublicDestination(
  url: URL,
  resolver: ProviderAddressResolver,
  signal: AbortSignal
): Promise<readonly ApprovedProviderAddress[]> {
  if (isUnsafeLiteralHost(url.hostname)) throw new AIProviderExecutionError("invalid_base_url");
  let addresses: readonly string[];
  try {
    addresses = await resolveWithSignal(
      resolver(url.hostname.replace(/^\[(.*)\]$/, "$1")),
      signal
    );
  } catch (error) {
    if (signal.aborted) throw providerErrorFromUnknown(error, signal);
    throw new AIProviderExecutionError("provider_unavailable");
  }
  if (addresses.length === 0) throw new AIProviderExecutionError("provider_unavailable");
  if (addresses.some((address) => !isPublicAddress(address))) throw new AIProviderExecutionError("invalid_base_url");
  return addresses.map((address) => ({
    address: normalizeIPAddress(address),
    family: isIP(normalizeIPAddress(address)) === 6 ? 6 : 4
  }));
}

function pinnedDispatcherFor(
  url: URL,
  addresses: readonly ApprovedProviderAddress[],
  dispatchers: Map<string, Agent>
): Dispatcher {
  const snapshotKey = addresses
    .map(({ address, family }) => `${family}:${address}`)
    .sort()
    .join(",");
  const cacheKey = `${url.origin}|${snapshotKey}`;
  const existing = dispatchers.get(cacheKey);
  if (existing) {
    dispatchers.delete(cacheKey);
    dispatchers.set(cacheKey, existing);
    return existing;
  }

  const dispatcher = new Agent({
    connect: {
      lookup: createPinnedLookup(url.hostname, addresses)
    }
  });
  dispatchers.set(cacheKey, dispatcher);
  if (dispatchers.size > maxPinnedDispatchers) {
    const oldestKey = dispatchers.keys().next().value;
    if (oldestKey !== undefined) {
      const oldest = dispatchers.get(oldestKey);
      dispatchers.delete(oldestKey);
      void oldest?.close().catch(() => undefined);
    }
  }
  return dispatcher;
}

export function createPinnedLookup(
  expectedHostname: string,
  addresses: readonly ApprovedProviderAddress[]
): LookupFunction {
  const normalizedExpectedHostname = normalizeHostname(expectedHostname);
  let nextAddress = 0;
  return (hostname, options, callback) => {
    if (normalizeHostname(hostname) !== normalizedExpectedHostname) {
      callback(providerLookupError(), "", 0);
      return;
    }

    const requestedFamily = options.family === 4 || options.family === 6 ? options.family : 0;
    const candidates = requestedFamily === 0
      ? addresses
      : addresses.filter(({ family }) => family === requestedFamily);
    if (candidates.length === 0) {
      callback(providerLookupError(), "", requestedFamily);
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

function providerLookupError(): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error("The provider destination could not be resolved.");
  error.code = "ENOTFOUND";
  return error;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "");
}

function normalizeIPAddress(address: string): string {
  return address.toLowerCase().replace(/^\[(.*)\]$/, "$1").split("%")[0] ?? "";
}

async function resolveWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason;
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}

function isUnsafeLiteralHost(hostname: string): boolean {
  const value = normalizeHostname(hostname);
  return value === "localhost" || value.endsWith(".localhost") || (isIP(value) !== 0 && !isPublicAddress(value));
}

function isPublicAddress(address: string): boolean {
  const normalized = normalizeIPAddress(address);
  const version = isIP(normalized);
  if (version === 4) return isPublicIPv4(normalized);
  if (version === 6) return isPublicIPv6(normalized);
  return false;
}

function isPublicIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a = 0, b = 0, c = 0] = parts;
  return !(
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPublicIPv6(address: string): boolean {
  const words = parseIPv6Words(address);
  if (!words) return false;
  const [first = 0, second = 0] = words;
  const sixth = words[6] ?? 0;
  const seventh = words[7] ?? 0;
  const embeddedIPv4 = `${sixth >> 8}.${sixth & 0xff}.${seventh >> 8}.${seventh & 0xff}`;
  const isCompatible = words.slice(0, 6).every((word) => word === 0);
  const isMapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;

  if (isCompatible || isMapped) return isPublicIPv4(embeddedIPv4);
  return !(
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first & 0xffc0) === 0xfec0 ||
    (first === 0x2001 && second === 0x0db8) ||
    first === 0x2002 ||
    (first === 0x2001 && second === 0) ||
    (first === 0x0064 && second === 0xff9b)
  );
}

function parseIPv6Words(address: string): readonly number[] | null {
  let normalized = address;
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = normalized.slice(lastColon + 1);
    const octets = ipv4.split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return null;
    }
    const [a = 0, b = 0, c = 0, d = 0] = octets;
    normalized = `${normalized.slice(0, lastColon)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const parts = [...left, ...Array.from({ length: missing }, () => "0"), ...right];
  if (parts.length !== 8) return null;
  const words = parts.map((part) => Number.parseInt(part, 16));
  return words.every((word, index) => /^[0-9a-f]{1,4}$/i.test(parts[index] ?? "") && Number.isInteger(word))
    ? words
    : null;
}

function createProviderSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal;
}

async function readBoundedBody(response: ProviderResponse, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new AIProviderExecutionError("response_parse_failure");
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function discardBoundedBody(response: ProviderResponse, maxBytes: number): Promise<void> {
  try {
    await readBoundedBody(response, maxBytes);
  } catch {
    response.body?.cancel().catch(() => undefined);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AIProviderExecutionError("response_parse_failure");
  }
}

function validateVerificationPayload(text: string, providerKind: AIProviderKind): void {
  const payload = parseJson(text);
  if (!isRecord(payload)) throw new AIProviderExecutionError("response_parse_failure");
  if (providerKind === "openrouter") {
    if (!isRecord(payload.data)) throw new AIProviderExecutionError("response_parse_failure");
    return;
  }
  if (!Array.isArray(payload.data)) throw new AIProviderExecutionError("response_parse_failure");
}

function normalizeProviderModels(payload: unknown, providerKind: AIProviderKind): readonly AIProviderDiscoveredModel[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw new AIProviderExecutionError("response_parse_failure");
  if (payload.data.length > maxDiscoveredModels) throw new AIProviderExecutionError("response_parse_failure");
  const seen = new Set<string>();
  const models: AIProviderDiscoveredModel[] = [];
  for (const item of payload.data) {
    if (!isRecord(item)) throw new AIProviderExecutionError("response_parse_failure");
    const id = stringValue(item.id);
    if (!id) throw new AIProviderExecutionError("response_parse_failure");
    if (seen.has(id)) continue;
    seen.add(id);
    const displayName = stringValue(item.name) ?? stringValue(item.display_name);
    const capabilities = observedCapabilities(item, providerKind);
    models.push({ id, ...(displayName ? { displayName } : {}), ...(Object.keys(capabilities).length === 0 ? {} : { capabilities }) });
  }
  return models;
}

function observedCapabilities(item: Record<string, unknown>, providerKind: AIProviderKind): AIProviderCapabilityFacts {
  const architecture = isRecord(item.architecture) ? item.architecture : {};
  const contextWindowTokens = positiveInteger(item.context_length) ?? positiveInteger(item.context_window);
  const maxOutputTokens = positiveInteger(item.max_output_tokens);
  const inputModalities = stringArray(architecture.input_modalities ?? item.input_modalities);
  const outputModalities = stringArray(architecture.output_modalities ?? item.output_modalities);
  const supportedParameters = stringArray(item.supported_parameters);
  const result: AIProviderCapabilityFacts = {
    ...(contextWindowTokens === undefined ? {} : { contextWindowTokens }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(inputModalities === undefined ? {} : { inputModalities }),
    ...(outputModalities === undefined ? {} : { outputModalities }),
    ...(supportedParameters === undefined ? {} : { supportedParameters })
  };
  if (providerKind === "anthropic") {
    return result;
  }
  return result;
}

function openAIRequestBody(input: AIProviderRunInput, stream: boolean): Record<string, unknown> {
  return {
    model: input.config.model,
    temperature: input.config.temperature,
    max_tokens: input.config.maxTokens,
    ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
    messages: providerMessages(input)
  };
}

function anthropicRequestBody(input: AIProviderRunInput, stream: boolean): Record<string, unknown> {
  const messages = providerMessages(input);
  return {
    model: input.config.model,
    temperature: input.config.temperature,
    max_tokens: input.config.maxTokens,
    stream,
    system: messages[0]?.content ?? "",
    messages: messages.slice(1).map((message) => ({ role: message.role === "system" ? "user" : message.role, content: message.content }))
  };
}

function providerMessages(input: AIProviderRunInput): readonly { readonly role: "system" | "user" | "assistant"; readonly content: string }[] {
  return [
    { role: "system", content: "You are Jixia's private research assistant. Use only explicit server-provided context. Do not claim document writeback." },
    { role: "user", content: contextPrompt(input.selectedContextSnapshot) },
    ...input.messages.map((message) => ({ role: message.role, content: message.content })),
    { role: input.userMessage.role, content: input.userMessage.content }
  ];
}

function contextPrompt(snapshot: AIConversationContextSnapshot): string {
  if (snapshot.items.length === 0) return "No explicit context is attached to this private conversation.";
  return [
    "Explicit context snapshot for this private conversation:",
    ...snapshot.items.map((item, index) => `### ${item.title || `Context ${index + 1}`}\n${item.content}`)
  ].join("\n\n");
}

function normalizeOpenAICompatibleResponse(payload: unknown): AIProviderRunResult {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) throw new AIProviderExecutionError("response_parse_failure");
  const choice = payload.choices[0];
  const content = isRecord(choice) && isRecord(choice.message) ? stringValue(choice.message.content) : undefined;
  if (!content) throw new AIProviderExecutionError("response_parse_failure");
  const usage = openAIUsage(payload.usage);
  return { assistantText: content, ...(usage ? { usage } : {}) };
}

function normalizeAnthropicResponse(payload: unknown): AIProviderRunResult {
  if (!isRecord(payload) || !Array.isArray(payload.content)) throw new AIProviderExecutionError("response_parse_failure");
  const assistantText = payload.content
    .filter(isRecord)
    .map((part) => part.type === "text" ? stringValue(part.text) ?? "" : "")
    .join("")
    .trim();
  if (!assistantText) throw new AIProviderExecutionError("response_parse_failure");
  const usage = anthropicUsage(payload.usage);
  return { assistantText, ...(usage ? { usage } : {}) };
}

async function* streamProviderResponse(
  body: ProviderBody,
  anthropic: boolean,
  maxBytes: number
): AsyncIterable<AIProviderStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let buffer = "";
  let assistantText = "";
  let usage: AIProviderUsageMetadata | undefined;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new AIProviderExecutionError("response_parse_failure");
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const event = parseStreamLine(line, anthropic);
        if (event?.type === "delta") {
          assistantText += event.delta;
          yield event;
        } else if (event?.type === "usage") {
          usage = mergeUsage(usage, event.usage);
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = parseStreamLine(buffer, anthropic);
      if (event?.type === "delta") {
        assistantText += event.delta;
        yield event;
      } else if (event?.type === "usage") usage = mergeUsage(usage, event.usage);
    }
  } finally {
    reader.releaseLock();
  }
  if (!assistantText.trim()) throw new AIProviderExecutionError("response_parse_failure");
  yield { type: "final", assistantText: assistantText.trim(), ...(usage ? { usage } : {}) };
}

type ParsedStreamEvent = AIProviderStreamEvent | { readonly type: "usage"; readonly usage: AIProviderUsageMetadata };

function parseStreamLine(line: string, anthropic: boolean): ParsedStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  const payload = parseJson(data);
  if (!isRecord(payload)) return null;
  if (anthropic) {
    if (payload.type === "content_block_delta" && isRecord(payload.delta)) {
      const delta = stringValue(payload.delta.text);
      return delta ? { type: "delta", delta } : null;
    }
    const usage = anthropicUsage(payload.usage);
    return usage ? { type: "usage", usage } : null;
  }
  if (Array.isArray(payload.choices) && isRecord(payload.choices[0])) {
    const deltaRecord = isRecord(payload.choices[0].delta) ? payload.choices[0].delta : null;
    const delta = deltaRecord ? stringValue(deltaRecord.content) : undefined;
    if (delta) return { type: "delta", delta };
  }
  const usage = openAIUsage(payload.usage);
  return usage ? { type: "usage", usage } : null;
}

function openAIUsage(value: unknown): AIProviderUsageMetadata | undefined {
  if (!isRecord(value)) return undefined;
  return compactUsage(
    positiveOrZeroInteger(value.prompt_tokens),
    positiveOrZeroInteger(value.completion_tokens),
    positiveOrZeroInteger(value.estimated_cost_micros)
  );
}

function anthropicUsage(value: unknown): AIProviderUsageMetadata | undefined {
  if (!isRecord(value)) return undefined;
  return compactUsage(positiveOrZeroInteger(value.input_tokens), positiveOrZeroInteger(value.output_tokens));
}

function compactUsage(promptTokens?: number, completionTokens?: number, estimatedCostMicros?: number): AIProviderUsageMetadata | undefined {
  if (promptTokens === undefined && completionTokens === undefined && estimatedCostMicros === undefined) return undefined;
  return {
    ...(promptTokens === undefined ? {} : { promptTokens }),
    ...(completionTokens === undefined ? {} : { completionTokens }),
    ...(estimatedCostMicros === undefined ? {} : { estimatedCostMicros })
  };
}

function mergeUsage(current: AIProviderUsageMetadata | undefined, next: AIProviderUsageMetadata): AIProviderUsageMetadata {
  return { ...current, ...next };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = Array.from(new Set(value.map(stringValue).filter((item): item is string => item !== undefined)));
  return values;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function positiveOrZeroInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError" || isRecord(error) && error.name === "AbortError";
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "TimeoutError" || isRecord(error) && error.name === "TimeoutError";
}

export function capabilityFactState(value: unknown, unsupported: boolean): AICapabilityFactState {
  return unsupported ? "unsupported" : value === undefined ? "unknown" : "observed";
}
