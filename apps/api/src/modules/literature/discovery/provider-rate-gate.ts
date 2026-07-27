import type { LiteratureProviderKey } from "@jixia/shared";

import { LiteratureProviderError } from "./provider-errors.js";
import { boundedProviderRetryAfterMs } from "./provider-retry-after.js";
import {
  createLiteratureProviderSignal,
  sleepForLiteratureProvider
} from "./provider-timing.js";
import type {
  LiteratureProviderRateGate,
  LiteratureProviderRateContext,
  LiteratureProviderSleep
} from "./provider-types.js";

export type LiteratureRateGatePolicy = {
  readonly providerKey: LiteratureProviderKey;
  readonly requestsPerSecond: number;
  readonly maxConcurrency: number;
};

export type LiteratureRateGateDependencies = {
  readonly now?: () => number;
  readonly sleep?: LiteratureProviderSleep;
  readonly createSignal?: (
    timeoutMs: number,
    externalSignal?: AbortSignal
  ) => AbortSignal;
};

type LiteratureRateGateWaiter = {
  readonly grant: () => void;
};

export const literatureRateGateDefaults = {
  openalex: { providerKey: "openalex", requestsPerSecond: 5, maxConcurrency: 2 },
  crossref: { providerKey: "crossref", requestsPerSecond: 3, maxConcurrency: 2 },
  ncbi: { providerKey: "pubmed", requestsPerSecond: 10, maxConcurrency: 2 },
  unpaywall: { providerKey: "unpaywall", requestsPerSecond: 5, maxConcurrency: 2 }
} as const satisfies Readonly<Record<string, LiteratureRateGatePolicy>>;

export function createLiteratureProviderRateGate(
  policy: LiteratureRateGatePolicy,
  dependencies: LiteratureRateGateDependencies = {}
): LiteratureProviderRateGate {
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? sleepForLiteratureProvider;
  const createSignal = dependencies.createSignal ?? createLiteratureProviderSignal;
  const reservationIntervalMs = 1_000 / policy.requestsPerSecond;
  const waitingForSlot: LiteratureRateGateWaiter[] = [];
  let active = 0;
  let nextReservationMs = 0;
  let cooldownUntilMs = 0;
  let reservationTail = Promise.resolve();

  const releaseSlot = () => {
    const next = waitingForSlot.shift();
    if (next === undefined) {
      active -= 1;
      return;
    }
    next.grant();
  };

  const acquireSlot = async (context: LiteratureProviderRateContext): Promise<void> => {
    if (active < policy.maxConcurrency) {
      active += 1;
      return;
    }
    const remainingMs = context.operationDeadlineMs - now();
    if (remainingMs <= 0) {
      throw rateGateError(policy, "deadline_exhausted");
    }
    const waitSignal = createSignal(remainingMs, context.signal);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const waiter: LiteratureRateGateWaiter = {
        grant() {
          if (settled) {
            return;
          }
          settled = true;
          waitSignal.removeEventListener("abort", onAbort);
          resolve();
        }
      };
      const onAbort = () => {
        if (settled) {
          return;
        }
        settled = true;
        const waiterIndex = waitingForSlot.indexOf(waiter);
        if (waiterIndex >= 0) {
          waitingForSlot.splice(waiterIndex, 1);
        }
        reject(rateGateError(
          policy,
          context.signal?.aborted ? "cancelled" : "deadline_exhausted"
        ));
      };
      waitingForSlot.push(waiter);
      waitSignal.addEventListener("abort", onAbort, { once: true });
      if (waitSignal.aborted) {
        onAbort();
      }
    });
  };

  const reserve = async (context: {
    readonly operationDeadlineMs: number;
    readonly signal?: AbortSignal;
  }): Promise<void> => {
    const remainingMs = context.operationDeadlineMs - now();
    if (remainingMs <= 0) {
      throw rateGateError(policy, "deadline_exhausted");
    }
    let unlock = () => {};
    const nextReservation = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const previousReservation = reservationTail;
    reservationTail = nextReservation;
    const waitSignal = createSignal(remainingMs, context.signal);
    let abortWait = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      abortWait = () => {
        reject(rateGateError(
          policy,
          context.signal?.aborted ? "cancelled" : "deadline_exhausted"
        ));
      };
      waitSignal.addEventListener("abort", abortWait, { once: true });
      if (waitSignal.aborted) {
        abortWait();
      }
    });
    let ownsReservation = false;
    try {
      try {
        await Promise.race([previousReservation, aborted]);
      } finally {
        waitSignal.removeEventListener("abort", abortWait);
      }
      ownsReservation = true;
      if (context.signal?.aborted) {
        throw rateGateError(policy, "cancelled");
      }
      const currentMs = now();
      const reservationMs = Math.max(currentMs, nextReservationMs, cooldownUntilMs);
      const delayMs = reservationMs - currentMs;
      if (currentMs + delayMs >= context.operationDeadlineMs) {
        throw rateGateError(policy, "deadline_exhausted");
      }
      if (delayMs > 0) {
        const signal = createLiteratureProviderSignal(
          context.operationDeadlineMs - currentMs,
          context.signal
        );
        await sleep(delayMs, signal);
      }
      nextReservationMs = Math.max(now(), reservationMs) + reservationIntervalMs;
    } finally {
      if (ownsReservation) {
        unlock();
      } else {
        void previousReservation.then(unlock);
      }
    }
  };

  return {
    async run(context, operation) {
      if (context.signal?.aborted) {
        throw rateGateError(policy, "cancelled");
      }
      if (now() >= context.operationDeadlineMs) {
        throw rateGateError(policy, "deadline_exhausted");
      }
      await acquireSlot(context);
      try {
        await reserve(context);
        return await operation();
      } finally {
        releaseSlot();
      }
    },
    applyServerFeedback(headers) {
      const retryAfterMs = boundedProviderRetryAfterMs(headers, now());
      if (retryAfterMs !== null) {
        cooldownUntilMs = Math.max(cooldownUntilMs, now() + retryAfterMs);
      }
    }
  };
}

function rateGateError(
  policy: LiteratureRateGatePolicy,
  code: "cancelled" | "deadline_exhausted"
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey: policy.providerKey,
    action: "rate_gate",
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code
  });
}

export function createDefaultLiteratureRateGates(
  dependencies: LiteratureRateGateDependencies = {}
): Readonly<Record<LiteratureProviderKey, LiteratureProviderRateGate>> {
  const ncbi = createLiteratureProviderRateGate(literatureRateGateDefaults.ncbi, dependencies);
  return {
    openalex: createLiteratureProviderRateGate(literatureRateGateDefaults.openalex, dependencies),
    crossref: createLiteratureProviderRateGate(literatureRateGateDefaults.crossref, dependencies),
    pubmed: ncbi,
    pmc: ncbi,
    unpaywall: createLiteratureProviderRateGate(literatureRateGateDefaults.unpaywall, dependencies)
  };
}
