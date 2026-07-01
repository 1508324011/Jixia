import type { DocumentType } from "./documents";

export const aiProviderKeyUpdateModes = ["keep", "replace", "remove"] as const;
export type AIProviderKeyUpdateMode = (typeof aiProviderKeyUpdateModes)[number];

export const aiConversationMessageRoles = ["user", "assistant"] as const;
export type AIConversationMessageRole = (typeof aiConversationMessageRoles)[number];

export const aiConversationRunStatuses = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export type AIConversationRunStatus = (typeof aiConversationRunStatuses)[number];

export const aiProviderErrorCategories = [
  "invalid_base_url",
  "missing_key",
  "invalid_key",
  "model_not_found",
  "rate_limit",
  "timeout",
  "provider_unavailable",
  "response_parse_failure",
  "cancelled",
  "unknown"
] as const;
export type AIProviderErrorCategory = (typeof aiProviderErrorCategories)[number];

export const aiContextSourceTypes = ["current_document", "selected_document", "selected_block", "manual"] as const;
export type AIContextSourceType = (typeof aiContextSourceTypes)[number];

export const aiConversationMessagePartTypes = ["text", "markdown", "source_list", "run_step"] as const;
export type AIConversationMessagePartType = (typeof aiConversationMessagePartTypes)[number];

export const aiConversationActionKinds = ["copy", "retry", "show_sources"] as const;
export type AIConversationActionKind = (typeof aiConversationActionKinds)[number];

export const aiUsageScopes = ["user", "space"] as const;
export type AIUsageScope = (typeof aiUsageScopes)[number];

export const aiUsageRetentionDays = 30;

export type AIProviderConfigView = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly provider: string;
  readonly baseURL: string;
  readonly hasKey: boolean;
  readonly isDefault: boolean;
  readonly modelProfiles: readonly AIModelProfileView[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AIModelProfileView = {
  readonly id: string;
  readonly providerConfigId: string;
  readonly model: string;
  readonly displayName: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type KeepAIProviderKeyRequest = {
  readonly mode: "keep";
};

export type ReplaceAIProviderKeyRequest = {
  readonly mode: "replace";
  readonly apiKey: string;
};

export type CreateAIProviderConfigRequest = {
  readonly name: string;
  readonly provider: string;
  readonly baseURL: string;
  readonly defaultModelProfile?: CreateAIModelProfileRequest;
  readonly isDefault?: boolean;
  readonly apiKey?: string;
};

export type UpdateAIProviderConfigRequest = {
  readonly name?: string;
  readonly provider?: string;
  readonly baseURL?: string;
  readonly isDefault?: boolean;
  readonly apiKey?: string;
};

export type AIProviderConfigResponse = {
  readonly config: AIProviderConfigView;
};

export type AIProviderConfigListResponse = {
  readonly configs: readonly AIProviderConfigView[];
};

export type CreateAIModelProfileRequest = {
  readonly model: string;
  readonly displayName: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly enabled?: boolean;
  readonly isDefault?: boolean;
};

export type UpdateAIModelProfileRequest = {
  readonly model?: string;
  readonly displayName?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly enabled?: boolean;
  readonly isDefault?: boolean;
};

export type AIModelProfileResponse = {
  readonly config: AIProviderConfigView;
  readonly modelProfile: AIModelProfileView;
};

export type DeleteAIModelProfileResponse = {
  readonly ok: true;
  readonly config: AIProviderConfigView;
};

export type ProviderHealthCheck = {
  readonly ok: boolean;
  readonly category: AIProviderErrorCategory | null;
  readonly message: string;
  readonly latencyMs: number;
  readonly provider: string;
  readonly model: string;
  readonly baseURL: string;
  readonly checkedAt: string;
};

export type TestAIProviderDraftRequest = {
  readonly name?: string;
  readonly provider: string;
  readonly baseURL: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly apiKey?: string;
};

export type TestAIProviderSavedRequest = {
  readonly modelProfileId?: string;
  readonly provider?: string;
  readonly baseURL?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly apiKey?: string;
};

export type TestAIProviderConfigResponse = {
  readonly healthCheck: ProviderHealthCheck;
};

export type RemoveAIProviderKeyRequest = {
  readonly mode: "remove";
};

export type AIProviderKeyUpdateRequest =
  | KeepAIProviderKeyRequest
  | ReplaceAIProviderKeyRequest
  | RemoveAIProviderKeyRequest;

export type UpsertAIProviderConfigRequest = {
  readonly id?: string;
  readonly name: string;
  readonly provider: string;
  readonly baseURL: string;
  readonly defaultModelProfile?: CreateAIModelProfileRequest;
  readonly isDefault: boolean;
  readonly keyUpdate: AIProviderKeyUpdateRequest;
};

export type UpsertAIProviderConfigResponse = {
  readonly config: AIProviderConfigView;
};

export type ImportAIProviderConfigRequest = {
  readonly name: string;
  readonly provider: string;
  readonly baseURL: string;
  readonly defaultModelProfile?: CreateAIModelProfileRequest;
  readonly keyUpdate: ReplaceAIProviderKeyRequest;
};

export type AIProviderConfigImportPreview = {
  readonly provider: string;
  readonly baseURL: string;
  readonly modelProfiles: readonly Pick<AIModelProfileView, "model" | "displayName">[];
  readonly hasKey: boolean;
};

export type AIConversationContextItemSnapshot = {
  readonly sourceType: AIContextSourceType;
  readonly documentId: string | null;
  readonly documentType: DocumentType | null;
  readonly projectId: string | null;
  readonly title: string;
  readonly revisionNumber: number | null;
  readonly selectedBlockIds: readonly string[];
  readonly content: string;
  readonly capturedAt: string;
};

export type AIConversationContextSnapshot = {
  readonly currentDocumentId: string | null;
  readonly items: readonly AIConversationContextItemSnapshot[];
  readonly capturedAt: string;
};

export type AIConversationContextAttachmentDTO = {
  readonly id: string;
  readonly sourceType: AIContextSourceType;
  readonly title: string;
  readonly documentId: string | null;
  readonly documentType: DocumentType | null;
  readonly projectId: string | null;
  readonly revisionNumber: number | null;
  readonly selectedBlockIds: readonly string[];
  readonly selectedBlockCount: number;
  readonly capturedAt: string;
};

export type AIConversationSourceDTO = AIConversationContextAttachmentDTO & {
  readonly label: string;
};

export type AIConversationRunStepDTO = {
  readonly id: string;
  readonly status: AIConversationRunStatus;
  readonly title: string;
  readonly timestamp: string;
  readonly errorMessage: string | null;
};

export type AIConversationActionDTO = {
  readonly id: string;
  readonly kind: AIConversationActionKind;
  readonly label: string;
  readonly enabled: boolean;
  readonly reason: string | null;
};

export type AIConversationTextMessagePartDTO = {
  readonly type: "text" | "markdown";
  readonly content: string;
};

export type AIConversationSourceListMessagePartDTO = {
  readonly type: "source_list";
  readonly sources: readonly AIConversationSourceDTO[];
};

export type AIConversationRunStepMessagePartDTO = {
  readonly type: "run_step";
  readonly step: AIConversationRunStepDTO;
};

export type AIConversationMessagePartDTO =
  | AIConversationTextMessagePartDTO
  | AIConversationSourceListMessagePartDTO
  | AIConversationRunStepMessagePartDTO;

export type AIConversationMessageDTO = {
  readonly id: string;
  readonly role: AIConversationMessageRole;
  readonly content: string;
  readonly createdAt: string;
  readonly runId?: string;
  readonly runStatus?: AIConversationRunStatus;
  readonly errorCategory?: AIProviderErrorCategory | null;
  readonly errorMessage?: string | null;
  readonly parts?: readonly AIConversationMessagePartDTO[];
  readonly sources?: readonly AIConversationSourceDTO[];
  readonly runSteps?: readonly AIConversationRunStepDTO[];
  readonly actions?: readonly AIConversationActionDTO[];
};

export type AIConversationRunDTO = {
  readonly id: string;
  readonly status: AIConversationRunStatus;
  readonly providerConfigId?: string;
  readonly modelProfileId?: string;
  readonly errorMessage: string | null;
  readonly errorCategory?: AIProviderErrorCategory | null;
  readonly usage?: AIConversationRunUsageDTO;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
};

export type AIConversationRunUsageDTO = {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostMicros: number;
};

export type AIConversationRunStreamEvent =
  | {
      readonly type: "run";
      readonly run: AIConversationRunDTO;
    }
  | {
      readonly type: "user_message";
      readonly message: AIConversationMessageDTO;
    }
  | {
      readonly type: "assistant_delta";
      readonly runId: string;
      readonly messageId: string;
      readonly delta: string;
    }
  | {
      readonly type: "assistant_message";
      readonly message: AIConversationMessageDTO;
    }
  | {
      readonly type: "usage";
      readonly runId: string;
      readonly usage: AIConversationRunUsageDTO;
    }
  | {
      readonly type: "error";
      readonly run?: AIConversationRunDTO;
      readonly category: AIProviderErrorCategory;
      readonly message: string;
    }
  | {
      readonly type: "done";
      readonly run: AIConversationRunDTO;
      readonly conversation: AIConversationDTO;
    };

export type AIConversationDTO = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly currentDocumentId: string | null;
  readonly selectedContextSnapshot: AIConversationContextSnapshot;
  readonly contextAttachments: readonly AIConversationContextAttachmentDTO[];
  readonly messages: readonly AIConversationMessageDTO[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ListAIConversationsRequest = {
  readonly currentDocumentId?: string;
};

export type ListAIConversationsResponse = {
  readonly conversations: readonly AIConversationDTO[];
};

export type CreateAIConversationRequest = {
  readonly title: string;
  readonly currentDocumentId: string | null;
  readonly selectedContextSnapshot: AIConversationContextSnapshot;
};

export type CreateAIConversationResponse = {
  readonly conversation: AIConversationDTO;
};

export type AppendAIConversationMessageRequest = {
  readonly conversationId: string;
  readonly modelProfileId: string;
  readonly message: {
    readonly role: "user";
    readonly content: string;
  };
  readonly selectedContextSnapshot: AIConversationContextSnapshot;
};

export type AppendAIConversationMessageResponse = {
  readonly conversation: AIConversationDTO;
  readonly run: AIConversationRunDTO;
};

export type CancelAIConversationRunResponse = {
  readonly run: AIConversationRunDTO;
};

export type DeleteAIConversationRequest = {
  readonly conversationId: string;
};

export type DeleteAIConversationResponse = {
  readonly conversationId: string;
};

export type AIUsageMetricView = {
  readonly provider: string;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostMicros: number;
};

export type UserAIUsageAggregateView = {
  readonly scope: "user";
  readonly userId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly metrics: readonly AIUsageMetricView[];
};

export type SpaceAIUsageAggregateView = {
  readonly scope: "space";
  readonly spaceId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly metrics: readonly AIUsageMetricView[];
};

export type AIUsageAggregateView = UserAIUsageAggregateView | SpaceAIUsageAggregateView;

export type AIUsageAggregateRequest = {
  readonly periodStart: string;
  readonly periodEnd: string;
};

export type AIUsageAggregateResponse = {
  readonly usage: AIUsageAggregateView;
};
