import type { AIConversationRunStreamEvent } from "@jixia/shared";

export async function* readChatStream(response: Response): AsyncIterable<AIConversationRunStreamEvent> {
  if (!response.body) {
    throw new Error("AI stream response did not include a readable body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";

    for (const event of events) {
      const parsed = parseStreamEvent(event);
      if (parsed) {
        yield parsed;
      }
    }
  }

  buffer += decoder.decode();
  const finalEvent = parseStreamEvent(buffer);
  if (finalEvent) {
    yield finalEvent;
  }
}

function parseStreamEvent(rawEvent: string): AIConversationRunStreamEvent | null {
  const dataLines = rawEvent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());

  if (dataLines.length === 0) {
    return null;
  }

  const payload = dataLines.join("\n");
  if (!payload || payload === "[DONE]") {
    return null;
  }

  return JSON.parse(payload) as AIConversationRunStreamEvent;
}
