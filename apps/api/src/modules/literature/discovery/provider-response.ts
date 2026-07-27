import type { LiteratureProviderKey } from "@jixia/shared";

import { LiteratureProviderError } from "./provider-errors.js";
import type {
  LiteratureProviderCallResult,
  LiteratureProviderFetchResponse
} from "./provider-types.js";

const providerBodyLimitBytes = 1024 * 1024;

type LiteratureProviderResponseContext = {
  readonly providerKey: LiteratureProviderKey;
  readonly action: string;
  readonly attempt: number;
  readonly startedAt: number;
  readonly now: () => number;
};

export async function handleLiteratureProviderResponse(input: {
  readonly response: LiteratureProviderFetchResponse;
  readonly expectedContentTypes: readonly string[];
  readonly context: LiteratureProviderResponseContext;
}): Promise<Omit<LiteratureProviderCallResult, "attempts">> {
  const statusClass = providerStatusClass(input.response.status);
  if (statusClass === "3xx") {
    throw responseError(input.context, "redirect_rejected", statusClass);
  }
  if (input.response.status === 404) {
    throw responseError(input.context, "not_found", statusClass);
  }
  if (input.response.status === 408 || input.response.status === 504) {
    throw responseError(input.context, "timeout", statusClass);
  }
  if (input.response.status === 429) {
    throw responseError(input.context, "rate_limited", statusClass);
  }
  if (statusClass === "5xx") {
    throw responseError(input.context, "provider_unavailable", statusClass);
  }
  if (statusClass !== "2xx") {
    throw responseError(input.context, "provider_rejected", statusClass);
  }

  const contentType = input.response.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  const accepted = contentType !== undefined && input.expectedContentTypes.some(
    (expected) => expected.toLowerCase() === contentType
  );
  if (!accepted) {
    throw responseError(input.context, "unexpected_content_type", statusClass);
  }
  return {
    body: await readBoundedBody(input.response, input.context),
    headers: input.response.headers
  };
}

async function readBoundedBody(
  response: LiteratureProviderFetchResponse,
  context: LiteratureProviderResponseContext
): Promise<string> {
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const decode = (chunk?: Uint8Array, stream = false): string => {
    try {
      return decoder.decode(chunk, { stream });
    } catch (error) {
      if (error instanceof TypeError) {
        throw responseError(context, "invalid_response", "2xx");
      }
      throw error;
    }
  };
  let bytesRead = 0;
  let body = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        return body + decode();
      }
      bytesRead += chunk.value.byteLength;
      if (bytesRead > providerBodyLimitBytes) {
        await reader.cancel();
        throw responseError(context, "response_too_large", "2xx");
      }
      body += decode(chunk.value, true);
    }
  } finally {
    reader.releaseLock();
  }
}

function responseError(
  context: LiteratureProviderResponseContext,
  code: LiteratureProviderError["code"],
  statusClass: LiteratureProviderError["statusClass"]
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey: context.providerKey,
    action: context.action,
    attempt: context.attempt,
    statusClass,
    latencyMs: Math.max(0, context.now() - context.startedAt),
    code
  });
}

function providerStatusClass(status: number): LiteratureProviderError["statusClass"] {
  if (status >= 200 && status < 300) {
    return "2xx";
  }
  if (status >= 300 && status < 400) {
    return "3xx";
  }
  if (status >= 400 && status < 500) {
    return "4xx";
  }
  return status >= 500 && status < 600 ? "5xx" : null;
}
