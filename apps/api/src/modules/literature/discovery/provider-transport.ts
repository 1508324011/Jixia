import {
  LiteratureProviderError,
  sanitizeLiteratureProviderAction
} from "./provider-errors.js";
import { handleLiteratureProviderResponse } from "./provider-response.js";
import {
  buildFixedLiteratureProviderUrl,
  parseFixedLiteratureProviderOrigin
} from "./provider-request.js";
import {
  approveLiteratureProviderDestination,
  fetchPinnedLiteratureProvider,
  resolveLiteratureProviderAddresses
} from "./provider-network.js";
import {
  createLiteratureProviderSignal,
  sleepForLiteratureProvider
} from "./provider-timing.js";
import {
  boundedProviderRetryAfterMs,
  boundProviderDelayMs
} from "./provider-retry-after.js";
import type {
  LiteratureProviderErrorRedactor,
  LiteratureProviderTransport,
  LiteratureProviderTransportDependencies,
  LiteratureProviderTransportSpec
} from "./provider-types.js";

const providerAttemptTimeoutMs = 4_000;
const providerMaximumAttempts = 3;
const providerInitialRetryDelayMs = 250;
const providerMaximumRetryDelayMs = 500;

type AttemptContext = {
  readonly attempt: number;
  readonly action: string;
  readonly operationDeadlineMs: number;
  readonly signal?: AbortSignal;
};

export function createLiteratureProviderTransport<TRequest>(
  spec: LiteratureProviderTransportSpec<TRequest>,
  dependencies: LiteratureProviderTransportDependencies = {}
): LiteratureProviderTransport<TRequest> {
  const fixedOrigin = parseFixedLiteratureProviderOrigin({
    origin: spec.origin,
    providerKey: spec.providerKey
  });
  const now = dependencies.now ?? Date.now;
  const resolveAddresses = dependencies.resolveAddresses ?? resolveLiteratureProviderAddresses;
  const sleep = dependencies.sleep ?? sleepForLiteratureProvider;
  const logger = dependencies.logger ?? { record() {} };
  const redactError = dependencies.redactError ?? redactProviderError;
  const random = dependencies.random ?? Math.random;

  return {
    async get(input) {
      if (input.signal?.aborted) {
        throw providerError(spec, "cancelled_operation", 0, 0, "cancelled", null);
      }
      if (now() >= input.operationDeadlineMs) {
        throw providerError(spec, "deadline_check", 0, 0, "deadline_exhausted", null);
      }

      const request = spec.buildRequest(input.request);
      const action = sanitizeLiteratureProviderAction(request.action);
      const url = buildFixedLiteratureProviderUrl({
        origin: fixedOrigin,
        pathname: request.pathname,
        query: request.query,
        context: { providerKey: spec.providerKey, action }
      });
      let lastError: LiteratureProviderError | null = null;

      for (let attempt = 1; attempt <= providerMaximumAttempts; attempt += 1) {
        const startedAt = now();
        const remainingMs = input.operationDeadlineMs - startedAt;
        if (remainingMs <= 0) {
          throw lastError ?? providerError(spec, action, attempt - 1, 0, "deadline_exhausted", null);
        }
        const attemptSignal = createLiteratureProviderSignal(
          Math.min(providerAttemptTimeoutMs, remainingMs),
          input.signal
        );
        let retryAfterMs: number | null = null;

        try {
          const result = await spec.rateGate.run(
            { operationDeadlineMs: input.operationDeadlineMs, ...(input.signal === undefined ? {} : { signal: input.signal }) },
            async () => {
              const approved = await approveLiteratureProviderDestination({
                providerKey: spec.providerKey,
                url,
                resolveAddresses,
                signal: attemptSignal
              });
              const response = dependencies.fetchImplementation === undefined
                ? await fetchPinnedLiteratureProvider({
                  url: url.toString(),
                  init: {
                    method: "GET",
                    headers: request.headers,
                    redirect: "manual",
                    signal: attemptSignal
                  },
                  hostname: url.hostname,
                  addresses: approved
                })
                : await dependencies.fetchImplementation(url.toString(), {
                  method: "GET",
                  headers: request.headers,
                  redirect: "manual",
                  signal: attemptSignal
                });
              try {
                spec.rateGate.applyServerFeedback(response.headers);
                if (response.status === 429) {
                  retryAfterMs = boundedProviderRetryAfterMs(response.headers, now());
                }
                return await handleLiteratureProviderResponse({
                  response,
                  expectedContentTypes: request.expectedContentTypes,
                  context: {
                    providerKey: spec.providerKey,
                    action,
                    attempt,
                    startedAt,
                    now
                  }
                });
              } finally {
                await response.dispose?.();
              }
            }
          );
          logger.record({
            providerKey: spec.providerKey,
            action,
            attempt,
            statusClass: "2xx",
            latencyMs: Math.max(0, now() - startedAt),
            code: "ok"
          });
          return { ...result, attempts: attempt };
        } catch (error) {
          const context: AttemptContext = {
            attempt,
            action,
            operationDeadlineMs: input.operationDeadlineMs,
            ...(input.signal === undefined ? {} : { signal: input.signal })
          };
          const mapped = error instanceof LiteratureProviderError
            ? new LiteratureProviderError({
              providerKey: spec.providerKey,
              action: context.action,
              attempt: context.attempt,
              statusClass: error.statusClass,
              latencyMs: Math.max(0, now() - startedAt),
              code: error.code
            })
            : mapUnexpectedProviderError(
              error,
              context,
              spec,
              startedAt,
              now,
              redactError,
              attemptSignal
            );
          logger.record({
            providerKey: mapped.providerKey,
            action: mapped.action,
            attempt: mapped.attempt,
            statusClass: mapped.statusClass,
            latencyMs: mapped.latencyMs,
            code: mapped.code
          });
          lastError = mapped;
          if (!isRetryable(mapped.code) || attempt === providerMaximumAttempts) {
            throw mapped;
          }

          const retryDelayMs = retryAfterMs ?? boundProviderDelayMs(
            random() * Math.min(providerInitialRetryDelayMs * attempt, providerMaximumRetryDelayMs)
          );
          if (now() + retryDelayMs >= input.operationDeadlineMs) {
            throw mapped;
          }
          const retrySignal = createLiteratureProviderSignal(
            input.operationDeadlineMs - now(),
            input.signal
          );
          await sleep(retryDelayMs, retrySignal);
        }
      }
      throw lastError ?? providerError(spec, action, 0, 0, "internal_error", null);
    }
  };
}

function mapUnexpectedProviderError<TRequest>(
  error: unknown,
  context: AttemptContext,
  spec: LiteratureProviderTransportSpec<TRequest>,
  startedAt: number,
  now: () => number,
  redactError: LiteratureProviderErrorRedactor,
  attemptSignal: AbortSignal
): LiteratureProviderError {
  const code = context.signal?.aborted
    ? "cancelled"
    : now() >= context.operationDeadlineMs
      ? "deadline_exhausted"
      : redactError(error, attemptSignal);
  return providerError(
    spec,
    context.action,
    context.attempt,
    now() - startedAt,
    code,
    null
  );
}

const redactProviderError: LiteratureProviderErrorRedactor = (error, signal) => {
  if (signal.aborted) {
    return "timeout";
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "timeout";
  }
  return "network_error";
};

function providerError<TRequest>(
  spec: LiteratureProviderTransportSpec<TRequest>,
  action: string,
  attempt: number,
  latencyMs: number,
  code: LiteratureProviderError["code"],
  statusClass: LiteratureProviderError["statusClass"]
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey: spec.providerKey,
    action,
    attempt,
    statusClass,
    latencyMs: Math.max(0, latencyMs),
    code
  });
}

function isRetryable(code: LiteratureProviderError["code"]): boolean {
  return code === "network_error" || code === "timeout" || code === "rate_limited" || code === "provider_unavailable";
}
