export function createLiteratureProviderSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs)));
  return externalSignal === undefined
    ? timeoutSignal
    : AbortSignal.any([externalSignal, timeoutSignal]);
}

export async function awaitWithLiteratureProviderSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("Provider operation aborted.", "AbortError");
  }

  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(
      signal.reason instanceof Error
        ? signal.reason
        : new DOMException("Provider operation aborted.", "AbortError")
    );
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

export async function sleepForLiteratureProvider(
  delayMs: number,
  signal: AbortSignal
): Promise<void> {
  await awaitWithLiteratureProviderSignal(
    new Promise<void>((resolve) => {
      setTimeout(resolve, Math.max(0, Math.floor(delayMs)));
    }),
    signal
  );
}
