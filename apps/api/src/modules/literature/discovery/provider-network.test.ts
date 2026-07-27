import { beforeEach, describe, expect, it, vi } from "vitest";

const undiciFetchMock = vi.hoisted(() => vi.fn());
const agentCloseMock = vi.hoisted(() => vi.fn<() => Promise<void>>().mockResolvedValue(undefined));

vi.mock("undici", () => ({
  Agent: class {
    close(): Promise<void> {
      return agentCloseMock();
    }
  },
  fetch: undiciFetchMock
}));

import {
  approveLiteratureProviderDestination,
  fetchPinnedLiteratureProvider
} from "./provider-network.js";

const fetchInput = {
  url: "https://api.openalex.org/works",
  init: {
    method: "GET" as const,
    headers: {},
    redirect: "manual" as const,
    signal: new AbortController().signal
  },
  hostname: "api.openalex.org",
  addresses: [{ address: "8.8.8.8", family: 4 as const }]
};

type TestBodyReader = {
  readonly read: () => Promise<ReadableStreamReadResult<Uint8Array>>;
  readonly cancel: (reason?: unknown) => Promise<void>;
  readonly releaseLock: () => void;
};

describe("literature provider pinned response body", () => {
  beforeEach(() => {
    undiciFetchMock.mockReset();
    agentCloseMock.mockClear();
  });

  it("attributes unsafe destination errors to the requesting provider", async () => {
    // Given
    const signal = new AbortController().signal;

    // When
    const operation = approveLiteratureProviderDestination({
      providerKey: "crossref",
      url: new URL("https://api.crossref.org/works"),
      resolveAddresses: async () => ["127.0.0.1"],
      signal
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "crossref",
      code: "unsafe_destination"
    });
  });

  it("releases the Undici reader when a pull rejects", async () => {
    // Given
    const streamError = new Error("stream read failed");
    const releaseLock = vi.fn();
    const underlyingReader: TestBodyReader = {
      read: vi.fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>()
        .mockRejectedValue(streamError),
      cancel: vi.fn<(reason?: unknown) => Promise<void>>().mockResolvedValue(undefined),
      releaseLock
    };
    undiciFetchMock.mockResolvedValueOnce({
      status: 200,
      headers: new Headers(),
      body: { getReader: () => underlyingReader }
    });

    // When
    const response = await fetchPinnedLiteratureProvider(fetchInput);
    if (response.body === null) {
      throw new Error("Expected a response body.");
    }
    const responseReader = response.body.getReader();
    await expect(responseReader.read()).rejects.toBe(streamError);
    responseReader.releaseLock();

    // Then
    await response.dispose?.();
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(agentCloseMock).toHaveBeenCalledTimes(1);
  });

  it("releases the Undici reader when cancellation rejects", async () => {
    // Given
    const cancelError = new Error("stream cancel failed");
    const releaseLock = vi.fn();
    let notifyRead: (() => void) | undefined;
    const readStarted = new Promise<void>((resolve) => {
      notifyRead = resolve;
    });
    const underlyingReader: TestBodyReader = {
      read: vi.fn(async () => {
        notifyRead?.();
        return { done: false, value: new Uint8Array([1]) };
      }),
      cancel: vi.fn<(reason?: unknown) => Promise<void>>().mockRejectedValue(cancelError),
      releaseLock
    };
    undiciFetchMock.mockResolvedValueOnce({
      status: 200,
      headers: new Headers(),
      body: { getReader: () => underlyingReader }
    });

    // When
    const response = await fetchPinnedLiteratureProvider(fetchInput);
    if (response.body === null) {
      throw new Error("Expected a response body.");
    }
    await readStarted;
    await expect(response.body.cancel("test cancellation")).rejects.toBe(cancelError);

    // Then
    await response.dispose?.();
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(agentCloseMock).toHaveBeenCalledTimes(1);
  });

  it("cancels an unread response body before closing its pinned agent", async () => {
    // Given
    const cancel = vi.fn<(reason?: unknown) => Promise<void>>().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    const underlyingReader: TestBodyReader = {
      read: vi.fn(async () => ({ done: false, value: new Uint8Array([1]) })),
      cancel,
      releaseLock
    };
    undiciFetchMock.mockResolvedValueOnce({
      status: 503,
      headers: new Headers(),
      body: { getReader: () => underlyingReader }
    });

    // When
    const response = await fetchPinnedLiteratureProvider(fetchInput);
    await response.dispose?.();

    // Then
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
    expect(agentCloseMock).toHaveBeenCalledTimes(1);
  });
});
