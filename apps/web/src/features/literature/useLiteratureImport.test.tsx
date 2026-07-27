import type { ImportOperationDTO } from "@jixia/shared";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useLiteratureImport } from "./useLiteratureImport";

describe("useLiteratureImport", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aborts a pending poll synchronously when the import intent is reset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-20T10:00:00.000Z");
    const onSucceeded = vi.fn();
    const pollResponse = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ operation: runningOperation() }))
      .mockReturnValueOnce(pollResponse.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLiteratureImport({
      messages: {
        importUnavailable: "Import unavailable",
        progressUnavailable: "Progress unavailable",
        retryUnavailable: "Retry unavailable"
      },
      onSucceeded
    }));

    await act(async () => {
      await result.current.start(
        { scope: "personal" },
        { providerKey: "openalex", recordKey: "W-RESET" }
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const pollSignal = fetchMock.mock.calls[1]?.[1]?.signal;

    act(() => {
      result.current.reset();
      expect(pollSignal?.aborted).toBe(true);
    });
    await act(async () => {
      pollResponse.resolve(jsonResponse({ operation: succeededOperation() }));
      await Promise.resolve();
    });

    expect(result.current.state).toEqual({ canRetry: false, error: null, operation: null, status: "idle" });
    expect(onSucceeded).not.toHaveBeenCalled();
  });

  it("continues polling while a running import lease is active", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-20T10:00:00.000Z");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ operation: runningOperation() }))
      .mockResolvedValueOnce(jsonResponse({ operation: runningOperation() }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLiteratureImport({
      messages: importMessages,
      onSucceeded: vi.fn()
    }));

    await act(async () => {
      await result.current.start(
        { scope: "personal" },
        { providerKey: "openalex", recordKey: "W-ACTIVE" }
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/literature/imports/operation-reset");
  });

  it("stops polling when a running import lease is already expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-20T10:02:00.000Z");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ operation: runningOperation() }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLiteratureImport({
      messages: importMessages,
      onSucceeded: vi.fn()
    }));

    await act(async () => {
      await result.current.start(
        { scope: "personal" },
        { providerKey: "openalex", recordKey: "W-EXPIRED" }
      );
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries an expired running import only after explicit user action", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-07-20T10:02:00.000Z");
    const onSucceeded = vi.fn();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ operation: runningOperation() }))
      .mockResolvedValueOnce(jsonResponse({ operation: succeededOperation() }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useLiteratureImport({
      messages: importMessages,
      onSucceeded
    }));

    await act(async () => {
      await result.current.start(
        { scope: "personal" },
        { providerKey: "openalex", recordKey: "W-EXPIRED" }
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.retry();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/literature/imports/operation-reset/retry");
    expect(onSucceeded).toHaveBeenCalledWith("literature-reset", { scope: "personal" });
  });
});

const importMessages = {
  importUnavailable: "Import unavailable",
  progressUnavailable: "Progress unavailable",
  retryUnavailable: "Retry unavailable"
};

function runningOperation(): ImportOperationDTO {
  return {
    ...operationBase,
    id: "operation-reset",
    status: "running",
    takeoverAfter: "2026-07-20T10:01:00.000Z",
    literatureId: null,
    failureCode: null,
    finishedAt: null
  };
}

function succeededOperation(): ImportOperationDTO {
  return {
    ...operationBase,
    id: "operation-reset",
    status: "succeeded",
    takeoverAfter: null,
    literatureId: "literature-reset",
    failureCode: null,
    finishedAt: "2026-07-20T10:01:00.000Z"
  };
}

const operationBase = {
  scope: { kind: "personal" as const, ownerUserId: "user-1" },
  createdByUserId: "user-1",
  attemptCount: 1,
  attemptStartedAt: "2026-07-20T10:00:00.000Z",
  warnings: [],
  createdAt: "2026-07-20T10:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z"
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function deferred<T>() {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return {
    promise,
    resolve(value: T): void {
      resolve?.(value);
    }
  };
}
