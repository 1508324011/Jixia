import { LiteratureProviderError } from "../provider-errors.js";
import {
  createLiteratureProviderRateGate,
  literatureRateGateDefaults,
  type LiteratureRateGateDependencies
} from "../provider-rate-gate.js";
import {
  createLiteratureProviderSignal,
  sleepForLiteratureProvider
} from "../provider-timing.js";
import type {
  LiteratureProviderRateContext,
  LiteratureProviderRateGate
} from "../provider-types.js";

type CrossrefRateGateWaiter = {
  readonly grant: () => void;
};

const positiveIntegerPattern = /^[1-9][0-9]*$/u;
const rateIntervalPattern = /^([1-9][0-9]*)s$/u;
const localPolicy = literatureRateGateDefaults.crossref;
const localReservationIntervalMs = 1_000 / localPolicy.requestsPerSecond;

export function createCrossrefRateGate(
  dependencies: LiteratureRateGateDependencies = {}
): LiteratureProviderRateGate {
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? sleepForLiteratureProvider;
  const createSignal = dependencies.createSignal ?? createLiteratureProviderSignal;
  const localGate = createLiteratureProviderRateGate(localPolicy, dependencies);
  const waitingForSlot: CrossrefRateGateWaiter[] = [];
  let active = 0;
  let maxConcurrency: number = localPolicy.maxConcurrency;
  let adaptiveReservationIntervalMs = 0;
  let nextAdaptiveReservationMs = 0;
  let reservationTail = Promise.resolve();

  const drainWaiters = () => {
    while (active < maxConcurrency) {
      const next = waitingForSlot.shift();
      if (next === undefined) {
        return;
      }
      active += 1;
      next.grant();
    }
  };

  const releaseSlot = () => {
    active -= 1;
    drainWaiters();
  };

  const acquireSlot = async (context: LiteratureProviderRateContext): Promise<void> => {
    if (active < maxConcurrency) {
      active += 1;
      return;
    }
    const remainingMs = context.operationDeadlineMs - now();
    if (remainingMs <= 0) {
      throw crossrefRateGateError("deadline_exhausted");
    }
    const waitSignal = createSignal(remainingMs, context.signal);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const waiter: CrossrefRateGateWaiter = {
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
        reject(crossrefRateGateError(
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

  const reserveAdaptiveRate = async (
    context: LiteratureProviderRateContext
  ): Promise<void> => {
    if (adaptiveReservationIntervalMs <= localReservationIntervalMs) {
      return;
    }
    const remainingMs = context.operationDeadlineMs - now();
    if (remainingMs <= 0) {
      throw crossrefRateGateError("deadline_exhausted");
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
      abortWait = () => reject(crossrefRateGateError(
        context.signal?.aborted ? "cancelled" : "deadline_exhausted"
      ));
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
        throw crossrefRateGateError("cancelled");
      }
      while (now() < nextAdaptiveReservationMs) {
        const delayMs = nextAdaptiveReservationMs - now();
        if (now() + delayMs >= context.operationDeadlineMs) {
          throw crossrefRateGateError("deadline_exhausted");
        }
        await sleep(delayMs, createSignal(
          context.operationDeadlineMs - now(),
          context.signal
        ));
      }
      nextAdaptiveReservationMs = now() + adaptiveReservationIntervalMs;
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
        throw crossrefRateGateError("cancelled");
      }
      if (now() >= context.operationDeadlineMs) {
        throw crossrefRateGateError("deadline_exhausted");
      }
      await acquireSlot(context);
      try {
        await reserveAdaptiveRate(context);
        return await localGate.run(context, operation);
      } finally {
        releaseSlot();
      }
    },
    applyServerFeedback(headers) {
      localGate.applyServerFeedback(headers);
      const serverIntervalMs = parseServerReservationInterval(headers);
      if (
        serverIntervalMs !== null &&
        serverIntervalMs > adaptiveReservationIntervalMs &&
        serverIntervalMs > localReservationIntervalMs
      ) {
        adaptiveReservationIntervalMs = serverIntervalMs;
        nextAdaptiveReservationMs = Math.max(
          nextAdaptiveReservationMs,
          now() + serverIntervalMs
        );
      }
      const serverConcurrency = parsePositiveInteger(
        headers.get("X-Concurrency-Limit")
      );
      if (serverConcurrency !== null && serverConcurrency < maxConcurrency) {
        maxConcurrency = serverConcurrency;
        drainWaiters();
      }
    }
  };
}

function parseServerReservationInterval(headers: Headers): number | null {
  const limit = parsePositiveInteger(headers.get("X-Rate-Limit-Limit"));
  const rawInterval = headers.get("X-Rate-Limit-Interval")?.trim();
  const intervalMatch = rawInterval === undefined
    ? null
    : rateIntervalPattern.exec(rawInterval);
  if (limit === null || intervalMatch === null) {
    return null;
  }
  const intervalSeconds = parsePositiveInteger(intervalMatch[1] ?? null);
  if (intervalSeconds === null) {
    return null;
  }
  const intervalMs = intervalSeconds * 1_000 / limit;
  return Number.isFinite(intervalMs) ? intervalMs : null;
}

function parsePositiveInteger(raw: string | null): number | null {
  const value = raw?.trim();
  if (value === undefined || !positiveIntegerPattern.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function crossrefRateGateError(
  code: "cancelled" | "deadline_exhausted"
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey: "crossref",
    action: "rate_gate",
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code
  });
}
