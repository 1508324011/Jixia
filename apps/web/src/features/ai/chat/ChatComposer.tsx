import type { KeyboardEvent } from "react";

import { Button } from "../../layout/workbench";
import type { ChatProviderConfig } from "./chatTypes";

type ChatComposerProps = {
  readonly activeRunId: string | null;
  readonly configs: readonly ChatProviderConfig[];
  readonly disabledReason: string | null;
  readonly isSending: boolean;
  readonly onChange: (text: string) => void;
  readonly onSelectProvider: (providerConfigId: string) => void;
  readonly onSubmit: () => void;
  readonly onStop: () => void;
  readonly selectedProviderConfigId: string;
  readonly text: string;
};

const commandHints = ["/summarize", "/critique", "/plan", "@source"] as const;

export function ChatComposer({
  activeRunId,
  configs,
  disabledReason,
  isSending,
  onChange,
  onSelectProvider,
  onSubmit,
  onStop,
  selectedProviderConfigId,
  text
}: ChatComposerProps) {
  const selectedConfig = configs.find((config) => config.id === selectedProviderConfigId) ?? null;

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (!disabledReason) {
      onSubmit();
    }
  }

  const canStop = isSending && activeRunId !== null;

  return (
    <form
      aria-label="AI chat composer"
      className="jixia-chat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabledReason) {
          onSubmit();
        }
      }}
    >
      <div className="jixia-chat-composer__surface">
        <textarea
          aria-label="Message Jixia AI"
          disabled={isSending}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Jixia AI…"
          rows={1}
          style={{ height: textareaHeight(text) }}
          value={text}
        />
        <div className="jixia-chat-composer__toolbar">
          <div className="jixia-chat-composer__modelbar">
            <label>
              <span>Model</span>
              <select aria-label="AI provider model" onChange={(event) => onSelectProvider(event.currentTarget.value)} value={selectedProviderConfigId}>
                <option value="">Select provider</option>
                {configs.map((config) => <option key={config.id} value={config.id}>{providerLabel(config)}</option>)}
              </select>
            </label>
            <span>{selectedConfig ? `${selectedConfig.provider} · ${selectedConfig.hasKey ? "key saved" : "missing key"}` : "Configure a provider to begin"}</span>
          </div>
          <div className="jixia-chat-composer__actions">
            <details className="jixia-chat-composer__help">
              <summary>Help</summary>
              <div aria-label="Command hints" className="jixia-chat-composer__hints">
                {commandHints.map((hint) => <span key={hint}>{hint}</span>)}
                <span>Enter sends</span>
                <span>Shift+Enter newline</span>
              </div>
            </details>
            <span className="jixia-chat-composer__scope">No automatic document context</span>
            {disabledReason ? <span className="jixia-chat-composer__disabled-reason">{disabledReason}</span> : null}
            {canStop ? (
              <Button onClick={onStop} title={`Stop server run ${activeRunId}`} type="button" variant="danger">Stop</Button>
            ) : (
              <Button disabled={Boolean(disabledReason)} type="submit" variant="primary">Send</Button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

function textareaHeight(text: string): string {
  const lineCount = Math.min(8, Math.max(1, text.split(/\r?\n/).length));
  return `${Math.max(48, lineCount * 24 + 24)}px`;
}

function providerLabel(config: ChatProviderConfig): string {
  return `${config.name} · ${config.model}${config.isDefault ? " · default" : ""}`;
}
