type LiteratureProviderBodyReader = {
  readonly read: () => Promise<ReadableStreamReadResult<Uint8Array>>;
  readonly cancel: (reason?: unknown) => Promise<void>;
  readonly releaseLock: () => void;
};

export type LiteratureProviderBody = {
  readonly getReader: () => LiteratureProviderBodyReader;
};

export type AdaptedLiteratureProviderBody = {
  readonly stream: ReadableStream<Uint8Array> | null;
  readonly dispose: () => Promise<void>;
};

export function adaptLiteratureProviderBody(
  body: LiteratureProviderBody | null
): AdaptedLiteratureProviderBody {
  if (body === null) {
    return {
      stream: null,
      async dispose() {}
    };
  }
  const reader = body.getReader();
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      reader.releaseLock();
    }
  };
  return {
    stream: new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const chunk = await reader.read();
          if (chunk.done) {
            release();
            controller.close();
            return;
          }
          const value: unknown = chunk.value;
          if (!(value instanceof Uint8Array)) {
            release();
            controller.error(new TypeError("Provider response contained an invalid byte stream."));
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          release();
          throw error;
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          release();
        }
      }
    }),
    async dispose() {
      if (released) {
        return;
      }
      try {
        await reader.cancel();
      } finally {
        release();
      }
    }
  };
}
