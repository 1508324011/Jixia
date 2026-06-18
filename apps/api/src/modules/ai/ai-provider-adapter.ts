import type { AIConversationContextSnapshot, AIConversationMessageDTO, AIProviderErrorCategory } from "@jixia/shared";

export type AIProviderExecutionConfig = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly provider: string;
  readonly baseURL: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly apiKey: string;
};

export type AIProviderUsageMetadata = {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly estimatedCostMicros?: number;
};

export type AIProviderRunInput = {
  readonly config: AIProviderExecutionConfig;
  readonly messages: readonly AIConversationMessageDTO[];
  readonly userMessage: AIConversationMessageDTO;
  readonly selectedContextSnapshot: AIConversationContextSnapshot;
  readonly signal?: AbortSignal;
};

export type AIProviderRunResult = {
  readonly assistantText: string;
  readonly usage?: AIProviderUsageMetadata;
};

export type AIProviderStreamEvent =
  | {
      readonly type: "delta";
      readonly delta: string;
    }
  | {
      readonly type: "final";
      readonly assistantText: string;
      readonly usage?: AIProviderUsageMetadata;
    };

export type AIProviderAdapter = {
  readonly runConversation: (input: AIProviderRunInput) => Promise<AIProviderRunResult>;
  readonly streamConversation: (input: AIProviderRunInput) => AsyncIterable<AIProviderStreamEvent>;
};

export class AIProviderExecutionError extends Error {
  constructor(
    readonly category: AIProviderErrorCategory = "unknown",
    message = safeProviderErrorMessage(category)
  ) {
    super(message);
    this.name = "AIProviderExecutionError";
  }
}

const providerRequestTimeoutMs = 30_000;
const maxProviderResponseCharacters = 1_000_000;

export function createOpenAICompatibleProviderAdapter(fetchImplementation: typeof fetch = fetch): AIProviderAdapter {
  return {
    async runConversation(input: AIProviderRunInput): Promise<AIProviderRunResult> {
      const requestInit: RequestInit = {
        method: "POST",
        redirect: "error",
        headers: {
          "Authorization": `Bearer ${input.config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: input.config.model,
          temperature: input.config.temperature,
          max_tokens: input.config.maxTokens,
          messages: providerMessages(input)
        })
      };
      const timeoutSignal = createProviderSignal(input.signal);

      if (timeoutSignal) {
        requestInit.signal = timeoutSignal;
      }

      const response = await fetchProvider(fetchImplementation, input.config.baseURL, requestInit);

      if (!response.ok) {
        throw await providerErrorFromResponse(response);
      }

      const responseText = await response.text();

      if (responseText.length > maxProviderResponseCharacters) {
        throw new AIProviderExecutionError("response_parse_failure");
      }

      let payload: unknown;
      try {
        payload = JSON.parse(responseText) as unknown;
      } catch {
        throw new AIProviderExecutionError("response_parse_failure");
      }

      return normalizeOpenAICompatibleResponse(payload);
    },

    async *streamConversation(input: AIProviderRunInput): AsyncIterable<AIProviderStreamEvent> {
      const requestInit: RequestInit = {
        method: "POST",
        redirect: "error",
        headers: {
          "Authorization": `Bearer ${input.config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: input.config.model,
          temperature: input.config.temperature,
          max_tokens: input.config.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
          messages: providerMessages(input)
        })
      };
      const timeoutSignal = createProviderSignal(input.signal);

      if (timeoutSignal) {
        requestInit.signal = timeoutSignal;
      }

      const response = await fetchProvider(fetchImplementation, input.config.baseURL, requestInit);

      if (!response.ok) {
        throw await providerErrorFromResponse(response);
      }

      if (!response.body) {
        throw new AIProviderExecutionError("response_parse_failure");
      }

      yield* streamOpenAICompatibleResponse(response.body);
    }
  };
}

export function safeProviderErrorMessage(category: AIProviderErrorCategory): string {
  switch (category) {
    case "invalid_base_url":
      return "The provider base URL must be a public HTTPS OpenAI-compatible endpoint.";
    case "missing_key":
      return "The provider API key is missing. Add or replace the write-only key and try again.";
    case "invalid_key":
      return "The provider rejected the API key. Check the key and provider account permissions.";
    case "model_not_found":
      return "The provider could not find or run the selected model. Check the model id.";
    case "rate_limit":
      return "The provider rate limit or quota was reached. Wait or update billing/quota settings.";
    case "timeout":
      return "The provider request timed out. Check the endpoint health or try a smaller request.";
    case "provider_unavailable":
      return "The provider endpoint is unavailable. Check the base URL or provider status.";
    case "response_parse_failure":
      return "The provider returned an unsupported response shape.";
    case "cancelled":
      return "The AI run was cancelled.";
    case "unknown":
      return "The AI provider request failed. Check your provider config and try again.";
  }
}

export function providerErrorFromUnknown(error: unknown, signal?: AbortSignal): AIProviderExecutionError {
  if (error instanceof AIProviderExecutionError) {
    return error;
  }

  if (isTimeoutError(error) || isTimeoutError(signal?.reason)) {
    return new AIProviderExecutionError("timeout");
  }

  if (isAbortError(error) || signal?.aborted) {
    return new AIProviderExecutionError("cancelled");
  }

  return new AIProviderExecutionError("provider_unavailable");
}

export function normalizeAIProviderBaseURL(baseURL: string): string {
  let url: URL;

  try {
    url = new URL(baseURL.trim());
  } catch {
    throw new AIProviderExecutionError("invalid_base_url");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    isBlockedProviderHost(url.hostname)
  ) {
    throw new AIProviderExecutionError("invalid_base_url");
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";

  return url.toString().replace(/\/$/, "");
}

function providerUrl(baseURL: string): string {
  const normalizedBaseURL = normalizeAIProviderBaseURL(baseURL);
  const url = new URL(normalizedBaseURL);

  const normalizedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = normalizedPath.endsWith("/chat/completions")
    ? normalizedPath
    : `${normalizedPath}/chat/completions`;
  url.search = "";
  url.hash = "";

  return url.toString();
}

function createProviderSignal(externalSignal?: AbortSignal): AbortSignal | undefined {
  const timeoutSignal = typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
    ? AbortSignal.timeout(providerRequestTimeoutMs)
    : undefined;
  const signals = [externalSignal, timeoutSignal].filter((signal): signal is AbortSignal => Boolean(signal));

  if (signals.length === 0) {
    return undefined;
  }

  if (signals.length === 1) {
    return signals[0];
  }

  if ("any" in AbortSignal) {
    return AbortSignal.any(signals);
  }

  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }

    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  return controller.signal;
}

async function fetchProvider(
  fetchImplementation: typeof fetch,
  baseURL: string,
  requestInit: RequestInit
): Promise<Response> {
  try {
    return await fetchImplementation(providerUrl(baseURL), requestInit);
  } catch (error) {
    throw providerErrorFromUnknown(error, requestInit.signal ?? undefined);
  }
}

async function providerErrorFromResponse(response: Response): Promise<AIProviderExecutionError> {
  const body = await safeResponseText(response);
  return new AIProviderExecutionError(categoryFromProviderResponse(response.status, body));
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 4_000);
  } catch {
    return "";
  }
}

function categoryFromProviderResponse(status: number, body: string): AIProviderErrorCategory {
  const normalizedBody = body.toLowerCase();

  if (status === 401 || status === 403) {
    return "invalid_key";
  }

  if (status === 404 || (status === 400 && /model|not found|unsupported/.test(normalizedBody))) {
    return "model_not_found";
  }

  if (status === 408 || status === 504) {
    return "timeout";
  }

  if (status === 429) {
    return "rate_limit";
  }

  if (status >= 500) {
    return "provider_unavailable";
  }

  return "unknown";
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { readonly name?: unknown }).name === "AbortError")
  );
}

function isTimeoutError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "TimeoutError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { readonly name?: unknown }).name === "TimeoutError")
  );
}

function isBlockedProviderHost(hostname: string): boolean {
  const hostnameValue = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "");

  if (
    hostnameValue === "localhost" ||
    hostnameValue.endsWith(".localhost")
  ) {
    return true;
  }

  if (hostnameValue.includes(":")) {
    return (
      hostnameValue === "::1" ||
      hostnameValue.startsWith("fe80:") ||
      hostnameValue.startsWith("fc") ||
      hostnameValue.startsWith("fd")
    );
  }

  const octets = hostnameValue.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [first = -1, second = -1] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function providerMessages(input: AIProviderRunInput): readonly { readonly role: "system" | "user" | "assistant"; readonly content: string }[] {
  return [
    {
      role: "system",
      content: [
        "You are Jixia's private research assistant.",
        "Use only the explicit context provided by the server.",
        "Do not claim to modify documents or perform writeback actions."
      ].join("\n")
    },
    {
      role: "user",
      content: contextPrompt(input.selectedContextSnapshot)
    },
    ...input.messages.map((message) => ({ role: message.role, content: message.content })),
    { role: input.userMessage.role, content: input.userMessage.content }
  ];
}

function contextPrompt(snapshot: AIConversationContextSnapshot): string {
  if (snapshot.items.length === 0) {
    return "No explicit context is attached to this private conversation.";
  }

  const contextItems = snapshot.items.map((item, index) => {
    const title = item.title || `Context ${index + 1}`;
    return `### ${title}\n${item.content}`;
  });

  return [
    "Explicit context snapshot for this private conversation:",
    ...contextItems
  ].join("\n\n");
}

function normalizeOpenAICompatibleResponse(payload: unknown): AIProviderRunResult {
  if (!payload || typeof payload !== "object") {
    throw new AIProviderExecutionError("response_parse_failure");
  }

  const record = payload as Record<string, unknown>;
  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = choices[0];
  const content = firstChoice && typeof firstChoice === "object"
    ? messageContent((firstChoice as Record<string, unknown>).message)
    : null;

  if (!content) {
    throw new AIProviderExecutionError("response_parse_failure");
  }

  const usage = usageMetadata(record.usage);

  return {
    assistantText: content,
    ...(usage === undefined ? {} : { usage })
  };
}

function messageContent(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const content = (value as Record<string, unknown>).content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

async function* streamOpenAICompatibleResponse(body: ReadableStream<Uint8Array>): AsyncIterable<AIProviderStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";
  let usage: AIProviderUsageMetadata | undefined;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseOpenAIStreamLine(line);

      if (!event) {
        continue;
      }

      if (event.type === "delta") {
        assistantText += event.delta;
        yield event;
      } else if (event.type === "usage") {
        usage = event.usage;
      }
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    const event = parseOpenAIStreamLine(buffer);
    if (event?.type === "delta") {
      assistantText += event.delta;
      yield event;
    } else if (event?.type === "usage") {
      usage = event.usage;
    }
  }

  if (!assistantText.trim()) {
    throw new AIProviderExecutionError("response_parse_failure");
  }

  yield {
    type: "final",
    assistantText: assistantText.trim(),
    ...(usage === undefined ? {} : { usage })
  };
}

type ParsedOpenAIStreamLine = AIProviderStreamEvent | { readonly type: "usage"; readonly usage: AIProviderUsageMetadata };

function parseOpenAIStreamLine(line: string): ParsedOpenAIStreamLine | null {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith(":")) {
    return null;
  }

  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const data = trimmed.slice("data:".length).trim();

  if (!data || data === "[DONE]") {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(data) as unknown;
  } catch {
    throw new AIProviderExecutionError("response_parse_failure");
  }

  const delta = streamDelta(payload);
  if (delta) {
    return { type: "delta", delta };
  }

  const usage = payload && typeof payload === "object" ? usageMetadata((payload as Record<string, unknown>).usage) : undefined;
  return usage === undefined ? null : { type: "usage", usage };
}

function streamDelta(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const choices = Array.isArray((payload as Record<string, unknown>).choices)
    ? ((payload as Record<string, unknown>).choices as readonly unknown[])
    : [];
  const firstChoice = choices[0];

  if (!firstChoice || typeof firstChoice !== "object") {
    return null;
  }

  const delta = (firstChoice as Record<string, unknown>).delta;
  if (delta && typeof delta === "object") {
    const content = (delta as Record<string, unknown>).content;
    if (typeof content === "string") {
      return content;
    }
  }

  const message = (firstChoice as Record<string, unknown>).message;
  const content = messageContent(message);
  return content;
}

function usageMetadata(value: unknown): AIProviderUsageMetadata | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  let usage: AIProviderUsageMetadata = {};
  const promptTokens = nonNegativeInteger(record.prompt_tokens);
  const completionTokens = nonNegativeInteger(record.completion_tokens);
  const estimatedCostMicros = nonNegativeInteger(record.estimated_cost_micros);

  if (promptTokens !== undefined) {
    usage = { ...usage, promptTokens };
  }

  if (completionTokens !== undefined) {
    usage = { ...usage, completionTokens };
  }

  if (estimatedCostMicros !== undefined) {
    usage = { ...usage, estimatedCostMicros };
  }

  return Object.keys(usage).length === 0 ? undefined : usage;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}
