import type { KeyboardEvent } from "react";

import { authorizedModelOptions } from "../modelOptions";
import { Button } from "../../layout/workbench";
import type { ChatProviderConfig } from "./chatTypes";

type ChatComposerProps = {
  readonly activeRunId: string | null;
  readonly configs: readonly ChatProviderConfig[];
  readonly disabledReason: string | null;
  readonly isSending: boolean;
  readonly onChange: (text: string) => void;
  readonly onSelectModelProfile: (modelProfileId: string) => void;
  readonly onSubmit: () => void;
  readonly onStop: () => void;
  readonly selectedModelProfileId: string;
  readonly text: string;
};

const commandHints = ["/summarize", "/critique", "/plan", "@source"] as const;

export function ChatComposer({
  activeRunId,
  configs,
  disabledReason,
  isSending,
  onChange,
  onSelectModelProfile,
  onSubmit,
  onStop,
  selectedModelProfileId,
  text
}: ChatComposerProps) {
  const modelOptions = authorizedModelOptions(configs);
  const selectedModel = modelOptions.find((option) => option.profile.id === selectedModelProfileId) ?? null;

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
          <div className="jixia-chat-composer__chips">
            <label>
              <span>Model</span>
              <select
                aria-label="AI model profile"
                disabled={isSending || modelOptions.length === 0}
                onChange={(event) => onSelectModelProfile(event.currentTarget.value)}
                value={selectedModelProfileId}
              >
                <option value="">Select model</option>
                {configs.map((config) => {
                  const profiles = modelOptions.filter((option) => option.provider.id === config.id).map((option) => option.profile);
                  return profiles.length > 0 ? (
                    <optgroup key={config.id} label={providerGroupLabel(config)}>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>{modelOptionLabel(profile)}</option>
                      ))}
                    </optgroup>
                  ) : null;
                })}
              </select>
            </label>
            <details className="jixia-chat-composer__help">
              <summary>Help</summary>
              <div aria-label="Command hints" className="jixia-chat-composer__hints">
                {commandHints.map((hint) => <span key={hint}>{hint}</span>)}
                <span>Enter sends</span>
                <span>Shift+Enter newline</span>
              </div>
            </details>
            <details className="jixia-chat-composer__scope">
              <summary>Context</summary>
              <div>
                <span>No automatic document context</span>
                <span>{selectedModel ? `${selectedModel.provider.provider} · ${selectedModel.provider.hasKey ? "key saved" : "missing key"}` : "Configure a provider and model to begin"}</span>
              </div>
            </details>
          </div>
          <div className="jixia-chat-composer__actions">
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

function providerGroupLabel(config: ChatProviderConfig): string {
  return `${config.name} · ${config.provider}`;
}

function modelOptionLabel(profile: ChatProviderConfig["modelProfiles"][number]): string {
  const markers = [profile.isDefault ? "default" : null].filter(Boolean).join(" · ");
  return `${profile.displayName} · ${profile.model}${markers ? ` · ${markers}` : ""}`;
}
