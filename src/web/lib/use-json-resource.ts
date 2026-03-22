import { useEffect, useState } from 'react';

import { requestJson } from './http-client';

export interface JsonResourceState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

export function useJsonResource<T>(input: string): JsonResourceState<T> {
  const [state, setState] = useState<JsonResourceState<T>>({
    data: null,
    error: null,
    isLoading: true,
  });

  useEffect(() => {
    let isCancelled = false;

    setState({ data: null, error: null, isLoading: true });

    void requestJson<T>(input)
      .then((data) => {
        if (!isCancelled) {
          setState({ data, error: null, isLoading: false });
        }
      })
      .catch((error: unknown) => {
        if (!isCancelled) {
          setState({
            data: null,
            error:
              error instanceof Error ? error.message : 'Request failed unexpectedly.',
            isLoading: false,
          });
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [input]);

  return state;
}
