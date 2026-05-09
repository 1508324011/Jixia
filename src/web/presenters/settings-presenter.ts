import { useCallback, useEffect, useMemo, useState } from "react";

import type { CredentialRecord } from "@shared/contracts/credentials";

import { apiClient } from "../lib/http-client";

export interface SettingsViewModel {
  createSampleCredential(): Promise<void>;
  credentials: CredentialRecord[];
  error: string | null;
  isMutating: boolean;
  refresh(): Promise<void>;
}

export function useSettingsPresenter(): SettingsViewModel {
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      setCredentials(await apiClient.listCredentials());
    } catch (presenterError) {
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load credentials.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createSampleCredential = useCallback(async () => {
      try {
        setIsMutating(true);
        setError(null);
        await apiClient.createCredential({
          provider: "openai",
          rawSecret: "local-settings-credential-placeholder",
        });
        await refresh();
    } catch (presenterError) {
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to create credential.",
      );
    } finally {
      setIsMutating(false);
    }
  }, [refresh]);

  return useMemo(
    () => ({
      createSampleCredential,
      credentials,
      error,
      isMutating,
      refresh,
    }),
    [createSampleCredential, credentials, error, isMutating, refresh],
  );
}
