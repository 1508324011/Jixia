import { Button, EmptyState, ListRow, Pane } from "../../layout/workbench";
import type { ChatThread } from "./chatTypes";

type ThreadSidebarProps = {
  readonly activeThreadId: string | null;
  readonly isLoading: boolean;
  readonly onNewThread: () => void;
  readonly onRefresh: () => void;
  readonly onSelectThread: (threadId: string) => void;
  readonly threads: readonly ChatThread[];
};

export function ThreadSidebar({
  activeThreadId,
  isLoading,
  onNewThread,
  onRefresh,
  onSelectThread,
  threads
}: ThreadSidebarProps) {
  return (
    <Pane
      actions={
        <Button onClick={onNewThread} variant="primary">New chat</Button>
      }
      aria-label="Standalone chat threads"
      className="jixia-chat-sidebar"
      eyebrow="Private threads"
      title="Chat history"
    >
      <details className="jixia-chat-sidebar__rail-note">
        <summary>History tools</summary>
        <span>Document context stays explicit and server-authorized.</span>
        <Button disabled={isLoading} onClick={onRefresh} variant="link">Refresh history</Button>
      </details>

      {threads.length === 0 ? (
        <EmptyState
          description="Start a focused private conversation."
          title={isLoading ? "Loading chats" : "No chats yet"}
        />
      ) : (
        <div className="jixia-list" role="list">
          {threads.map((thread) => (
            <ListRow
              description={threadDescription(thread)}
              key={thread.id}
              meta={formatRelativeTime(thread.updatedAt)}
              onOpen={() => onSelectThread(thread.id)}
              role="listitem"
              selected={thread.id === activeThreadId}
              title={thread.title}
            />
          ))}
        </div>
      )}
    </Pane>
  );
}

function threadDescription(thread: ChatThread): string {
  const messageCount = `${thread.messageCount} ${thread.messageCount === 1 ? "message" : "messages"}`;
  const provider = thread.providerLabel ? ` · ${thread.providerLabel}` : "";
  return `${messageCount}${provider}`;
}

function formatRelativeTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
