import { ChatComposer } from "./ChatComposer";
import { ThreadSidebar } from "./ThreadSidebar";
import { ThreadViewport } from "./ThreadViewport";
import type { ChatMessage, ChatModelOption, ChatProviderConfig, ChatRunStatus, ChatThread } from "./chatTypes";

type ChatShellProps = {
  readonly activeThread: ChatThread | null;
  readonly activeRunId: string | null;
  readonly activeRunStatus: ChatRunStatus | null;
  readonly copiedMessageId: string | null;
  readonly disabledReason: string | null;
  readonly hiddenSourceMessageIds: ReadonlySet<string>;
  readonly isLoading: boolean;
  readonly isSending: boolean;
  readonly messageText: string;
  readonly onChangeMessage: (text: string) => void;
  readonly onCopyMessage: (message: ChatMessage) => void;
  readonly onCopyText: (text: string) => void;
  readonly onNewThread: () => void;
  readonly onRefresh: () => void;
  readonly onRetryMessage: (message: ChatMessage) => void;
  readonly onSelectModelProfile: (modelProfileId: string) => void;
  readonly onSelectThread: (threadId: string) => void;
  readonly onSend: () => void;
  readonly onStopRun: () => void;
  readonly onToggleSources: (messageId: string) => void;
  readonly providers: readonly ChatProviderConfig[];
  readonly selectedModelProfileId: string;
  readonly sendStatus: ChatRunStatus | "idle";
  readonly statusMessage: string | null;
  readonly threads: readonly ChatThread[];
};

export function ChatShell({
  activeThread,
  activeRunId,
  activeRunStatus,
  copiedMessageId,
  disabledReason,
  hiddenSourceMessageIds,
  isLoading,
  isSending,
  messageText,
  onChangeMessage,
  onCopyMessage,
  onCopyText,
  onNewThread,
  onRefresh,
  onRetryMessage,
  onSelectModelProfile,
  onSelectThread,
  onSend,
  onStopRun,
  onToggleSources,
  providers,
  selectedModelProfileId,
  sendStatus,
  statusMessage,
  threads
}: ChatShellProps) {
  const selectedModel = modelProfileOptions(providers).find((option) => option.profile.id === selectedModelProfileId) ?? null;
  return (
    <div className="jixia-chat-shell">
      <ThreadSidebar
        activeThreadId={activeThread?.id ?? null}
        isLoading={isLoading}
        onNewThread={onNewThread}
        onRefresh={onRefresh}
        onSelectThread={onSelectThread}
        threads={threads}
      />
      <div className="jixia-chat-main">
        <ThreadViewport
          activeRunStatus={activeRunStatus}
          copiedMessageId={copiedMessageId}
          errorMessage={statusMessage}
          hiddenSourceMessageIds={hiddenSourceMessageIds}
          isSending={isSending}
          onCopyMessage={onCopyMessage}
          onCopyText={onCopyText}
          onRetryMessage={onRetryMessage}
          onToggleSources={onToggleSources}
          sendStatus={sendStatus}
          selectedModel={selectedModel}
          thread={activeThread}
        />
        <ChatComposer
          configs={providers}
          disabledReason={disabledReason}
          isSending={isSending}
          onChange={onChangeMessage}
          onSelectModelProfile={onSelectModelProfile}
          onSubmit={onSend}
          onStop={onStopRun}
          selectedModelProfileId={selectedModelProfileId}
          activeRunId={activeRunId}
          text={messageText}
        />
      </div>
    </div>
  );
}

function modelProfileOptions(providers: readonly ChatProviderConfig[]): readonly ChatModelOption[] {
  return providers.flatMap((provider) => provider.modelProfiles.map((profile) => ({ provider, profile })));
}
