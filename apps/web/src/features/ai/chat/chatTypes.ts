import type {
  AIConversationContextAttachmentDTO,
  AIConversationDTO,
  AIConversationMessageDTO,
  AIConversationMessagePartDTO,
  AIConversationRunDTO,
  AIConversationRunStatus,
  AIConversationSourceDTO,
  AIModelProfileView,
  AIProviderConfigView
} from "@jixia/shared";

export type ChatThread = {
  readonly id: string;
  readonly title: string;
  readonly status: "idle" | "running" | "failed" | "cancelled";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly messageCount: number;
  readonly providerLabel: string | null;
  readonly contextAttachments: readonly AIConversationContextAttachmentDTO[];
  readonly sourceConversation: AIConversationDTO;
};

export type ChatMessage = AIConversationMessageDTO;
export type ChatMessagePart = AIConversationMessagePartDTO;
export type ChatRun = AIConversationRunDTO;
export type ChatRunStatus = AIConversationRunStatus;
export type ChatSource = AIConversationSourceDTO;
export type ChatProviderConfig = AIProviderConfigView;
export type ChatModelProfile = AIModelProfileView;

export type ChatModelOption = {
  readonly provider: ChatProviderConfig;
  readonly profile: ChatModelProfile;
};

export type ComposerState = {
  readonly text: string;
  readonly isSubmitting: boolean;
  readonly helpOpen: boolean;
};

export type AttachmentChip = {
  readonly id: string;
  readonly label: string;
  readonly title: string;
  readonly description: string;
};

export type ChatRuntimeState = {
  readonly activeThread: ChatThread | null;
  readonly threads: readonly ChatThread[];
  readonly configs: readonly ChatProviderConfig[];
  readonly loadState: "idle" | "loading" | "ready" | "error";
  readonly sendState: "idle" | "queued" | "running" | "succeeded" | "failed";
  readonly errorMessage: string | null;
};
