import type { ChatRunStatus } from "./chatTypes";

type ToolRunCardProps = {
  readonly errorMessage: string | null;
  readonly status: ChatRunStatus;
  readonly title: string;
};

export function ToolRunCard({ errorMessage, status, title }: ToolRunCardProps) {
  return (
    <div
      aria-label={`${title}: ${runStatusLabel(status)}`}
      className={`jixia-chat-run-card jixia-chat-run-card--${status}`}
      role={status === "failed" ? "alert" : "status"}
    >
      <strong>{title}</strong>
      <span>{runStatusLabel(status)}</span>
      {errorMessage ? <small>{errorMessage}</small> : null}
    </div>
  );
}

export function runStatusLabel(status: ChatRunStatus): string {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}
