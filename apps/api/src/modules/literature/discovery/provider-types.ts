import type { LiteratureProviderKey } from "@jixia/shared";

import type {
  LiteratureProviderErrorCode,
  LiteratureProviderStatusClass
} from "./provider-errors.js";

export type LiteratureProviderFetchResponse = {
  readonly status: number;
  readonly headers: Headers;
  readonly body: ReadableStream<Uint8Array> | null;
  readonly dispose?: () => Promise<void>;
};

export type LiteratureProviderFetchInit = {
  readonly method: "GET";
  readonly headers: Readonly<Record<string, string>>;
  readonly redirect: "manual";
  readonly signal: AbortSignal;
};

export type LiteratureProviderFetch = (
  url: string,
  init: LiteratureProviderFetchInit
) => Promise<LiteratureProviderFetchResponse>;

export type LiteratureProviderAddressResolver = (
  hostname: string,
  signal: AbortSignal
) => Promise<readonly string[]>;

export type LiteratureProviderSleep = (
  delayMs: number,
  signal: AbortSignal
) => Promise<void>;

export type LiteratureProviderLogEvent = {
  readonly providerKey: LiteratureProviderKey;
  readonly action: string;
  readonly attempt: number;
  readonly statusClass: LiteratureProviderStatusClass | null;
  readonly latencyMs: number;
  readonly code: LiteratureProviderErrorCode | "ok";
};

export type LiteratureProviderLogger = {
  readonly record: (event: LiteratureProviderLogEvent) => void;
};

export type LiteratureProviderErrorRedactor = (
  error: unknown,
  signal: AbortSignal
) => LiteratureProviderErrorCode;

export type LiteratureProviderTransportDependencies = {
  readonly fetchImplementation?: LiteratureProviderFetch;
  readonly resolveAddresses?: LiteratureProviderAddressResolver;
  readonly now?: () => number;
  readonly sleep?: LiteratureProviderSleep;
  readonly logger?: LiteratureProviderLogger;
  readonly redactError?: LiteratureProviderErrorRedactor;
  readonly random?: () => number;
};

export type LiteratureProviderRateContext = {
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

export type LiteratureProviderRateGate = {
  readonly run: <T>(
    context: LiteratureProviderRateContext,
    operation: () => Promise<T>
  ) => Promise<T>;
  readonly applyServerFeedback: (headers: Headers) => void;
};

export type AdapterOwnedLiteratureRequest = {
  readonly action: string;
  readonly pathname: string;
  readonly query: readonly (readonly [string, string])[];
  readonly headers: Readonly<Record<string, string>>;
  readonly expectedContentTypes: readonly string[];
};

export type LiteratureProviderTransportSpec<TRequest> = {
  readonly providerKey: LiteratureProviderKey;
  readonly origin: string;
  readonly buildRequest: (request: TRequest) => AdapterOwnedLiteratureRequest;
  readonly rateGate: LiteratureProviderRateGate;
};

export type LiteratureProviderCallInput<TRequest> = {
  readonly request: TRequest;
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

export type LiteratureProviderCallResult = {
  readonly body: string;
  readonly headers: Headers;
  readonly attempts: number;
};

export type LiteratureProviderTransport<TRequest> = {
  readonly get: (
    input: LiteratureProviderCallInput<TRequest>
  ) => Promise<LiteratureProviderCallResult>;
};
