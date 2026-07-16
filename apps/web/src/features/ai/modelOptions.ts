import type { AIModelProfileView, AIProviderConfigView } from "@jixia/shared";

export type AuthorizedModelOption = {
  readonly provider: AIProviderConfigView;
  readonly profile: AIModelProfileView;
};

/**
 * Runtime selectors only expose profiles the server has not marked unavailable.
 * Missing availability is kept as unknown for compatibility with pre-sync profiles.
 */
export function isAuthorizedRuntimeModel(profile: AIModelProfileView): boolean {
  return profile.enabled && profile.availability !== "unavailable";
}

export function authorizedModelsForProvider(config: AIProviderConfigView): readonly AuthorizedModelOption[] {
  if (!config.hasKey) {
    return [];
  }

  return config.modelProfiles
    .filter(isAuthorizedRuntimeModel)
    .map((profile) => ({ provider: config, profile }));
}

export function authorizedModelOptions(configs: readonly AIProviderConfigView[]): readonly AuthorizedModelOption[] {
  return configs.flatMap(authorizedModelsForProvider);
}

export function preferredAuthorizedModelId(
  currentModelProfileId: string,
  configs: readonly AIProviderConfigView[]
): string {
  const options = authorizedModelOptions(configs);

  if (options.some((option) => option.profile.id === currentModelProfileId)) {
    return currentModelProfileId;
  }

  return options.find((option) => option.provider.isDefault && option.profile.isDefault)?.profile.id
    ?? options.find((option) => option.profile.isDefault)?.profile.id
    ?? options[0]?.profile.id
    ?? "";
}

export function availabilityState(profile: AIModelProfileView): "available" | "unknown" | "unavailable" {
  return profile.availability ?? "unknown";
}
