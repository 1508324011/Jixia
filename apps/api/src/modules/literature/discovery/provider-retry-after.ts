const maximumProviderCooldownMs = 2_000;
const delaySecondsPattern = /^[0-9]+$/u;

export function boundedProviderRetryAfterMs(headers: Headers, nowMs: number): number | null {
  const raw = headers.get("Retry-After")?.trim();
  if (raw === undefined || raw.length === 0) {
    return null;
  }
  if (delaySecondsPattern.test(raw)) {
    const seconds = BigInt(raw);
    const maximumSeconds = BigInt(Math.ceil(maximumProviderCooldownMs / 1_000));
    return seconds >= maximumSeconds
      ? maximumProviderCooldownMs
      : Number(seconds) * 1_000;
  }
  const retryAtMs = Date.parse(raw);
  if (!Number.isFinite(retryAtMs) || new Date(retryAtMs).toUTCString() !== raw) {
    return null;
  }
  return boundProviderDelayMs(retryAtMs - nowMs);
}

export function boundProviderDelayMs(delayMs: number): number {
  if (!Number.isFinite(delayMs)) {
    return 0;
  }
  return Math.min(maximumProviderCooldownMs, Math.max(0, Math.floor(delayMs)));
}
