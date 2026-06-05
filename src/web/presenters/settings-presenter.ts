import { useCallback, useEffect, useMemo, useState } from "react";

import type { CredentialRecord } from "@shared/contracts/credentials";
import type { DefaultImportTarget } from "@shared/contracts/settings";

import { apiClient } from "../lib/http-client";

type LoadingState = "idle" | "loading" | "loaded" | "error";
type SaveState = "idle" | "saving" | "saved" | "error";

export interface SettingsViewModel {
  apiKeyConfigured: boolean;
  createCredential(input: {
    provider: string;
    rawSecret: string;
  }): Promise<boolean>;
  credentialError: string | null;
  credentialSaveState: SaveState;
  credentials: CredentialRecord[];
  defaultImportTarget: DefaultImportTarget;
  error: string | null;
  loadingState: LoadingState;
  refresh(): Promise<void>;
  saveSettings(input: {
    defaultImportTarget: DefaultImportTarget;
  }): Promise<boolean>;
  saveState: SaveState;
  settingsError: string | null;
}

export function useSettingsPresenter(): SettingsViewModel {
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [defaultImportTarget, setDefaultImportTarget] =
    useState<DefaultImportTarget>("personal-library");
  const [credentialSaveState, setCredentialSaveState] = useState<SaveState>("idle");
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>("idle");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [settingsError, setSettingsError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    async function loadSettings(): Promise<void> {
      setLoadingState("loading");
      setSettingsError(null);

      try {
        const settings = await apiClient.getWorkbenchSettings();

        if (cancelled) {
          return;
        }

        setApiKeyConfigured(settings.apiKeyConfigured);
        setDefaultImportTarget(settings.defaultImportTarget);
        setLoadingState("loaded");
      } catch (presenterError) {
        if (cancelled) {
          return;
        }

        setLoadingState("error");
        setSettingsError(
          presenterError instanceof Error
            ? presenterError.message
            : "Unable to load settings",
        );
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveSettings = useCallback(
    async (input: {
      defaultImportTarget: DefaultImportTarget;
    }): Promise<boolean> => {
      setSaveState("saving");
      setSettingsError(null);

      try {
        const savedSettings = await apiClient.saveWorkbenchSettings(input);

        setApiKeyConfigured(savedSettings.apiKeyConfigured);
        setDefaultImportTarget(savedSettings.defaultImportTarget);
        setLoadingState("loaded");
        setSaveState("saved");
        return true;
      } catch (presenterError) {
        setSaveState("error");
        setSettingsError(
          presenterError instanceof Error
            ? presenterError.message
            : "Unable to save settings",
        );
        return false;
      }
    },
    [],
  );

  const createCredential = useCallback(
    async (input: {
      provider: string;
      rawSecret: string;
    }): Promise<boolean> => {
      setCredentialSaveState("saving");
      setCredentialError(null);

      try {
        await apiClient.createCredential(input);
        const [nextCredentials, nextSettings] = await Promise.all([
          apiClient.listCredentials(),
          apiClient.getWorkbenchSettings(),
        ]);

        setCredentials(nextCredentials);
        setApiKeyConfigured(nextSettings.apiKeyConfigured);
        setDefaultImportTarget(nextSettings.defaultImportTarget);
        setCredentialSaveState("saved");
        return true;
      } catch (presenterError) {
        setCredentialSaveState("error");
        setCredentialError(
          presenterError instanceof Error
            ? presenterError.message
            : "Unable to save credential",
        );
        return false;
      }
    },
    [],
  );

  return useMemo(
    () => ({
      apiKeyConfigured,
      createCredential,
      credentialError,
      credentialSaveState,
      credentials,
      defaultImportTarget,
      error,
      loadingState,
      refresh,
      saveSettings,
      saveState,
      settingsError,
    }),
    [
      apiKeyConfigured,
      createCredential,
      credentialError,
      credentialSaveState,
      credentials,
      defaultImportTarget,
      error,
      loadingState,
      refresh,
      saveSettings,
      saveState,
      settingsError,
    ],
  );
}
