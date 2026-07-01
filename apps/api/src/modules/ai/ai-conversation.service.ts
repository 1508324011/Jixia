import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@jixia/db/generated";
import {
  aiContextSourceTypes,
  aiConversationRunStatuses,
  type AIContextSourceType,
  type AIConversationRunStreamEvent,
  type AIConversationActionDTO,
  type AIConversationContextAttachmentDTO,
  type AIConversationContextItemSnapshot,
  type AIConversationContextSnapshot,
  type AIConversationDTO,
  type AIConversationMessageDTO,
  type AIConversationMessagePartDTO,
  type AIConversationRunDTO,
  type AIConversationRunUsageDTO,
  type AIConversationRunStepDTO,
  type AIConversationRunStatus,
  type AIConversationSourceDTO,
  type AIProviderErrorCategory,
  type ListAIConversationsResponse,
  type SpaceRole
} from "@jixia/shared";

import { canReadDocument as defaultCanReadDocument, type PermissionService } from "../permissions/permission.service.js";
import {
  AIProviderExecutionError,
  createOpenAICompatibleProviderAdapter,
  providerErrorFromUnknown,
  safeProviderErrorMessage,
  type AIProviderAdapter,
  type AIProviderUsageMetadata
} from "./ai-provider-adapter.js";
import { getDefaultAIUsageService, type AIUsageService } from "./ai-usage.service.js";
import { AICryptoError, createAIKeyCipher, type AIKeyCipher } from "./crypto.js";

export class AIConversationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "AIConversationError";
  }
}

export type AIConversationActor = {
  readonly userId: string;
  readonly spaceId: string;
  readonly spaceRole: SpaceRole;
};

export type AIProviderConfigExecutionRecord = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly provider: string;
  readonly baseURL: string;
  readonly encryptedApiKey: string | null;
};

export type AIModelProfileExecutionRecord = {
  readonly id: string;
  readonly providerConfigId: string;
  readonly model: string;
  readonly displayName: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly enabled: boolean;
  readonly providerConfig: AIProviderConfigExecutionRecord;
};

export type AIConversationRecord = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly currentDocumentId: string | null;
  readonly selectedContextSnapshot: AIConversationContextSnapshot;
  readonly messages: readonly AIConversationMessageDTO[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

type ActiveConversationRun = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly conversationId: string;
  readonly controller: AbortController;
  readonly run: AIConversationRunDTO;
};

type CompletedConversationRun = {
  readonly ownerUserId: string;
  readonly run: AIConversationRunDTO;
};

const activeConversationRuns = new Map<string, ActiveConversationRun>();
const completedConversationRuns = new Map<string, CompletedConversationRun>();

export type AIConversationRepository = {
  readonly listConversations: (input: {
    readonly ownerUserId: string;
    readonly currentDocumentId?: string | null;
  }) => Promise<readonly AIConversationRecord[]>;
  readonly findConversationById: (conversationId: string) => Promise<AIConversationRecord | null>;
  readonly findModelProfileById: (modelProfileId: string) => Promise<AIModelProfileExecutionRecord | null>;
  readonly createConversation: (input: {
    readonly ownerUserId: string;
    readonly title: string;
    readonly currentDocumentId: string | null;
    readonly selectedContextSnapshot: AIConversationContextSnapshot;
    readonly messages: readonly AIConversationMessageDTO[];
  }) => Promise<AIConversationRecord>;
  readonly appendMessages: (input: {
    readonly conversationId: string;
    readonly ownerUserId: string;
    readonly selectedContextSnapshot: AIConversationContextSnapshot;
    readonly messages: readonly AIConversationMessageDTO[];
  }) => Promise<AIConversationRecord | null>;
  readonly deleteConversation: (input: {
    readonly conversationId: string;
    readonly ownerUserId: string;
  }) => Promise<boolean>;
};

function badRequest(message = "Invalid request"): AIConversationError {
  return new AIConversationError(message, 400);
}

function forbidden(message = "Forbidden"): AIConversationError {
  return new AIConversationError(message, 403);
}

function notFound(message = "Not found"): AIConversationError {
  return new AIConversationError(message, 404);
}

function serviceUnavailable(message = "AI provider execution is unavailable"): AIConversationError {
  return new AIConversationError(message, 503);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function ensureTitle(title: string): string {
  const trimmed = title.trim();

  if (!trimmed || trimmed.length > 200) {
    throw badRequest("Invalid conversation title");
  }

  return trimmed;
}

function ensureMessageContent(content: string): string {
  const trimmed = content.trim();

  if (!trimmed || trimmed.length > 200_000) {
    throw badRequest("Invalid AI conversation message");
  }

  return trimmed;
}

function ensureAssistantContent(content: string): string {
  const trimmed = content.trim();

  if (!trimmed || trimmed.length > 200_000) {
    throw new AIProviderExecutionError("response_parse_failure");
  }

  return trimmed;
}

function ensureOptionalString(value: unknown, fieldName: string, maxLength = 256): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || value.length > maxLength) {
    throw badRequest(`Invalid ${fieldName}`);
  }

  return value;
}

function ensureString(value: unknown, fieldName: string, maxLength = 256): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw badRequest(`Invalid ${fieldName}`);
  }

  return value;
}

function ensureStringArray(value: unknown, fieldName: string): readonly string[] {
  if (!Array.isArray(value) || value.length > 200) {
    throw badRequest(`Invalid ${fieldName}`);
  }

  return value.map((item) => ensureString(item, fieldName));
}

function ensureDateString(value: unknown, fieldName: string): string {
  const dateString = ensureString(value, fieldName);

  if (Number.isNaN(Date.parse(dateString))) {
    throw badRequest(`Invalid ${fieldName}`);
  }

  return dateString;
}

function ensureRunStatus(value: unknown): AIConversationRunStatus {
  if (typeof value !== "string" || !aiConversationRunStatuses.includes(value as AIConversationRunStatus)) {
    throw badRequest("Invalid AI conversation run status");
  }

  return value as AIConversationRunStatus;
}

function ensureProviderErrorCategory(value: unknown): AIProviderErrorCategory | null {
  if (value === null) {
    return null;
  }

  const categories: readonly AIProviderErrorCategory[] = [
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
  ];

  if (typeof value !== "string" || !categories.includes(value as AIProviderErrorCategory)) {
    throw badRequest("Invalid AI provider error category");
  }

  return value as AIProviderErrorCategory;
}

function ensureSourceType(value: unknown): AIContextSourceType {
  if (typeof value !== "string" || !aiContextSourceTypes.includes(value as AIContextSourceType)) {
    throw badRequest("Invalid AI context source type");
  }

  return value as AIContextSourceType;
}

function ensureRevisionNumber(value: unknown): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw badRequest("Invalid AI context revision number");
  }

  return value;
}

function ensureContextItem(value: unknown): AIConversationContextItemSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("Invalid AI context item");
  }

  const item = value as Record<string, unknown>;
  const content = ensureString(item.content, "AI context content", 500_000);
  const sourceType = ensureSourceType(item.sourceType);
  const documentId = ensureOptionalString(item.documentId, "AI context document id");
  const selectedBlockIds = ensureStringArray(item.selectedBlockIds, "AI context selected block ids");

  if ((sourceType === "selected_document" || sourceType === "selected_block") && !documentId) {
    throw badRequest("AI selected context document id is required");
  }

  if (sourceType === "selected_block" && selectedBlockIds.length === 0) {
    throw badRequest("AI selected block context requires block ids");
  }

  return {
    sourceType,
    documentId,
    documentType: item.documentType === "notebook" || item.documentType === "project" ? item.documentType : null,
    projectId: ensureOptionalString(item.projectId, "AI context project id"),
    title: ensureString(item.title, "AI context title", 500),
    revisionNumber: ensureRevisionNumber(item.revisionNumber),
    selectedBlockIds,
    content,
    capturedAt: ensureDateString(item.capturedAt, "AI context captured at")
  };
}

function normalizeContextSnapshot(value: unknown): AIConversationContextSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("Invalid AI context snapshot");
  }

  const snapshot = value as Record<string, unknown>;

  if (!Array.isArray(snapshot.items) || snapshot.items.length > 50) {
    throw badRequest("Invalid AI context snapshot items");
  }

  return {
    currentDocumentId: ensureOptionalString(snapshot.currentDocumentId, "AI context current document id"),
    items: snapshot.items.map(ensureContextItem),
    capturedAt: ensureDateString(snapshot.capturedAt, "AI context captured at")
  };
}

function normalizeMessageSource(value: unknown): AIConversationSourceDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw badRequest("Invalid AI conversation source");
  }

  const source = value as Record<string, unknown>;
  const sourceType = ensureSourceType(source.sourceType);
  const selectedBlockIds = ensureStringArray(source.selectedBlockIds, "AI conversation source selected block ids");

  return {
    id: ensureString(source.id, "AI conversation source id", 500),
    sourceType,
    title: ensureString(source.title, "AI conversation source title", 500),
    documentId: ensureOptionalString(source.documentId, "AI conversation source document id"),
    documentType: source.documentType === "notebook" || source.documentType === "project" ? source.documentType : null,
    projectId: ensureOptionalString(source.projectId, "AI conversation source project id"),
    revisionNumber: ensureRevisionNumber(source.revisionNumber),
    selectedBlockIds,
    selectedBlockCount: selectedBlockIds.length,
    capturedAt: ensureDateString(source.capturedAt, "AI conversation source captured at"),
    label: ensureString(source.label, "AI conversation source label", 500)
  };
}

function normalizeMessageSources(value: unknown): readonly AIConversationSourceDTO[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length > 50) {
    throw badRequest("Invalid AI conversation sources");
  }

  return value.map(normalizeMessageSource);
}

function normalizeMessages(value: unknown): readonly AIConversationMessageDTO[] {
  if (!Array.isArray(value)) {
    throw badRequest("Invalid AI conversation messages");
  }

  return value.map((message) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      throw badRequest("Invalid AI conversation message");
    }

    const record = message as Record<string, unknown>;

    if (record.role !== "user" && record.role !== "assistant") {
      throw badRequest("Invalid AI conversation message role");
    }

    const content = ensureMessageContent(ensureString(record.content, "AI conversation message content", 200_000));
    const runId = record.runId === undefined ? undefined : ensureString(record.runId, "AI conversation run id");
    const runStatus = record.runStatus === undefined ? undefined : ensureRunStatus(record.runStatus);
    const errorCategory = record.errorCategory === undefined
      ? undefined
      : ensureProviderErrorCategory(record.errorCategory);
    const errorMessage = record.errorMessage === undefined
      ? undefined
      : ensureOptionalString(record.errorMessage, "AI conversation error message", 1_000);
    const sources = normalizeMessageSources(record.sources);

    return {
      id: ensureString(record.id, "AI conversation message id"),
      role: record.role,
      content,
      createdAt: ensureDateString(record.createdAt, "AI conversation message created at"),
      ...(runId === undefined ? {} : { runId }),
      ...(runStatus === undefined ? {} : { runStatus }),
      ...(errorCategory === undefined ? {} : { errorCategory }),
      ...(errorMessage === undefined ? {} : { errorMessage }),
      ...(sources === undefined ? {} : { sources })
    };
  });
}

function contextAttachmentId(item: AIConversationContextItemSnapshot, index: number): string {
  const sourceId = item.documentId ?? item.title;
  return `${item.sourceType}-${sourceId}-${index}`;
}

function sourceLabel(sourceType: AIContextSourceType): string {
  switch (sourceType) {
    case "current_document":
      return "Current document";
    case "selected_document":
      return "Selected document";
    case "selected_block":
      return "Selected blocks";
    case "manual":
      return "Manual note";
  }
}

function contextAttachmentFromItem(
  item: AIConversationContextItemSnapshot,
  index: number
): AIConversationContextAttachmentDTO {
  return {
    id: contextAttachmentId(item, index),
    sourceType: item.sourceType,
    title: item.title,
    documentId: item.documentId,
    documentType: item.documentType,
    projectId: item.projectId,
    revisionNumber: item.revisionNumber,
    selectedBlockIds: item.selectedBlockIds,
    selectedBlockCount: item.selectedBlockIds.length,
    capturedAt: item.capturedAt
  };
}

function contextAttachments(snapshot: AIConversationContextSnapshot): readonly AIConversationContextAttachmentDTO[] {
  return snapshot.items.map(contextAttachmentFromItem);
}

function contextSources(snapshot: AIConversationContextSnapshot): readonly AIConversationSourceDTO[] {
  return contextAttachments(snapshot).map((attachment) => ({
    ...attachment,
    label: sourceLabel(attachment.sourceType)
  }));
}

function safeRunStep(
  message: Pick<AIConversationMessageDTO, "id" | "createdAt" | "runId" | "runStatus" | "errorMessage">
): AIConversationRunStepDTO | null {
  if (!message.runId || !message.runStatus) {
    return null;
  }

  return {
    id: `${message.runId}-${message.id}`,
    status: message.runStatus,
    title: message.runStatus === "cancelled"
      ? "Server AI run cancelled"
      : message.runStatus === "failed"
        ? "Server AI run failed"
        : "Server AI run",
    timestamp: message.createdAt,
    errorMessage: message.runStatus === "failed" || message.runStatus === "cancelled" ? message.errorMessage ?? null : null
  };
}

function safeActions(
  message: Pick<AIConversationMessageDTO, "id" | "runStatus">
): NonNullable<AIConversationMessageDTO["actions"]> {
  const actions: AIConversationActionDTO[] = [
    {
      id: `${message.id}-copy`,
      kind: "copy",
      label: "Copy",
      enabled: true,
      reason: null
    }
  ];

  if (message.runStatus === "failed" || message.runStatus === "cancelled") {
    actions.push({
      id: `${message.id}-retry`,
      kind: "retry",
      label: "Retry this prompt",
      enabled: true,
      reason: null
    });
  }

  return actions;
}

function projectMessage(
  message: Pick<
    AIConversationMessageDTO,
    "id" | "role" | "content" | "createdAt" | "runId" | "runStatus" | "sources" | "errorCategory" | "errorMessage"
  >,
  sources: readonly AIConversationSourceDTO[] = []
): AIConversationMessageDTO {
  const runStep = safeRunStep(message);
  const runSteps = runStep ? [runStep] : [];
  const messageSources = message.role === "assistant" ? message.sources ?? sources : [];
  const parts: AIConversationMessagePartDTO[] = [
    { type: message.role === "assistant" ? "markdown" : "text", content: message.content }
  ];

  if (messageSources.length > 0) {
    parts.push({ type: "source_list", sources: messageSources });
  }

  for (const step of runSteps) {
    parts.push({ type: "run_step", step });
  }

  return {
    ...message,
    parts,
    sources: messageSources,
    runSteps,
    actions: safeActions(message)
  };
}

function createRunSnapshot(input: {
  readonly id: string;
  readonly status: AIConversationRunStatus;
  readonly providerConfigId?: string;
  readonly modelProfileId?: string;
  readonly createdAt: Date;
  readonly startedAt?: Date;
    readonly completedAt?: Date;
    readonly errorMessage?: string | null;
    readonly errorCategory?: AIProviderErrorCategory | null;
    readonly usage?: AIConversationRunUsageDTO;
}): AIConversationRunDTO {
  return {
    id: input.id,
    status: input.status,
    ...(input.providerConfigId === undefined ? {} : { providerConfigId: input.providerConfigId }),
    ...(input.modelProfileId === undefined ? {} : { modelProfileId: input.modelProfileId }),
    errorMessage: input.errorMessage ?? null,
    errorCategory: input.errorCategory ?? null,
    ...(input.usage === undefined ? {} : { usage: input.usage }),
    createdAt: toIsoString(input.createdAt),
    startedAt: input.startedAt ? toIsoString(input.startedAt) : null,
    completedAt: input.completedAt ? toIsoString(input.completedAt) : null
  };
}

function safeProviderFailureRun(input: {
  readonly runId: string;
  readonly providerConfigId: string;
  readonly modelProfileId: string;
  readonly category: AIProviderErrorCategory;
  readonly createdAt: Date;
  readonly startedAt: Date;
  readonly completedAt: Date;
}): AIConversationRunDTO {
  return createRunSnapshot({
    id: input.runId,
    status: input.category === "cancelled" ? "cancelled" : "failed",
    providerConfigId: input.providerConfigId,
    modelProfileId: input.modelProfileId,
    createdAt: input.createdAt,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    errorCategory: input.category,
    errorMessage: safeProviderErrorMessage(input.category)
  });
}

function runFromActive(activeRun: ActiveConversationRun): AIConversationRunDTO {
  return activeRun.run;
}

function registerActiveRun(input: {
  readonly runId: string;
  readonly ownerUserId: string;
  readonly conversationId: string;
  readonly controller: AbortController;
  readonly run: AIConversationRunDTO;
}): void {
  activeConversationRuns.set(input.runId, {
    id: input.runId,
    ownerUserId: input.ownerUserId,
    conversationId: input.conversationId,
    controller: input.controller,
    run: input.run
  });
}

function completeActiveRun(run: AIConversationRunDTO, ownerUserId?: string): void {
  const activeRun = activeConversationRuns.get(run.id);
  activeConversationRuns.delete(run.id);
  completedConversationRuns.set(run.id, { ownerUserId: ownerUserId ?? activeRun?.ownerUserId ?? "", run });
}

function activeRunFor(actor: AIConversationActor, runId: string): ActiveConversationRun | null {
  const activeRun = activeConversationRuns.get(runId);

  if (!activeRun || activeRun.ownerUserId !== actor.userId) {
    return null;
  }

  return activeRun;
}

function completedRunFor(actor: AIConversationActor, runId: string): AIConversationRunDTO | null {
  const completedRun = completedConversationRuns.get(runId);
  return completedRun?.ownerUserId === actor.userId ? completedRun.run : null;
}

function runUsageDTO(usage: AIProviderUsageMetadata | undefined): AIConversationRunUsageDTO | undefined {
  if (!usage) {
    return undefined;
  }

  const promptTokens = nonNegativeUsageValue(usage.promptTokens);
  const completionTokens = nonNegativeUsageValue(usage.completionTokens);

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimatedCostMicros: nonNegativeUsageValue(usage.estimatedCostMicros)
  };
}

function decryptProviderKey(cipher: AIKeyCipher, encryptedApiKey: string | null): string {
  if (!encryptedApiKey) {
    throw new AIProviderExecutionError("missing_key");
  }

  try {
    return cipher.decrypt(encryptedApiKey);
  } catch (error) {
    if (error instanceof AICryptoError) {
      throw serviceUnavailable();
    }

    throw error;
  }
}

function usagePeriodFor(date: Date): { readonly periodStart: Date; readonly periodEnd: Date } {
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);

  return { periodStart, periodEnd };
}

function nonNegativeUsageValue(value: number | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

async function recordAggregateUsage(input: {
  readonly usageService: Pick<AIUsageService, "recordUsage">;
  readonly actor: AIConversationActor;
  readonly providerConfig: AIProviderConfigExecutionRecord;
  readonly modelProfile: AIModelProfileExecutionRecord;
  readonly usage?: AIProviderUsageMetadata;
  readonly completedAt: Date;
}): Promise<void> {
  const { periodStart, periodEnd } = usagePeriodFor(input.completedAt);

  await input.usageService.recordUsage({
    actor: input.actor,
    provider: input.providerConfig.provider,
    model: input.modelProfile.model,
    promptTokens: nonNegativeUsageValue(input.usage?.promptTokens),
    completionTokens: nonNegativeUsageValue(input.usage?.completionTokens),
    estimatedCostMicros: nonNegativeUsageValue(input.usage?.estimatedCostMicros),
    periodStart,
    periodEnd
  });
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function toConversationDTO(record: AIConversationRecord): AIConversationDTO {
  const attachments = contextAttachments(record.selectedContextSnapshot);
  const sources = contextSources(record.selectedContextSnapshot);

  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    title: record.title,
    currentDocumentId: record.currentDocumentId,
    selectedContextSnapshot: record.selectedContextSnapshot,
    contextAttachments: attachments,
    messages: record.messages.map((message) => projectMessage(message, sources)),
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt)
  };
}

function ensureOwnedConversation(
  record: AIConversationRecord | null,
  ownerUserId: string
): AIConversationRecord {
  if (!record || record.ownerUserId !== ownerUserId) {
    throw notFound();
  }

  return record;
}

function contextDocumentIds(
  currentDocumentId: string | null,
  snapshot: AIConversationContextSnapshot
): readonly string[] {
  const ids = new Set<string>();

  if (currentDocumentId) {
    ids.add(currentDocumentId);
  }

  if (snapshot.currentDocumentId) {
    ids.add(snapshot.currentDocumentId);
  }

  for (const item of snapshot.items) {
    if (item.documentId) {
      ids.add(item.documentId);
    }
  }

  return Array.from(ids);
}

const aiConversationSelect = {
  id: true,
  ownerUserId: true,
  title: true,
  currentDocumentId: true,
  selectedContextSnapshot: true,
  messages: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.AIConversationSelect;

function toConversationRecord(record: {
  readonly id: string;
  readonly ownerUserId: string;
  readonly title: string;
  readonly currentDocumentId: string | null;
  readonly selectedContextSnapshot: unknown;
  readonly messages: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): AIConversationRecord {
  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    title: record.title,
    currentDocumentId: record.currentDocumentId,
    selectedContextSnapshot: normalizeContextSnapshot(record.selectedContextSnapshot),
    messages: normalizeMessages(record.messages),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export class PrismaAIConversationRepository implements AIConversationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listConversations(input: {
    readonly ownerUserId: string;
    readonly currentDocumentId?: string | null;
  }): Promise<readonly AIConversationRecord[]> {
    const conversations = await this.prisma.aIConversation.findMany({
      where: {
        ownerUserId: input.ownerUserId,
        ...(input.currentDocumentId === undefined ? {} : { currentDocumentId: input.currentDocumentId })
      },
      orderBy: { updatedAt: "desc" },
      select: aiConversationSelect
    });

    return conversations.map(toConversationRecord);
  }

  async findConversationById(conversationId: string): Promise<AIConversationRecord | null> {
    const conversation = await this.prisma.aIConversation.findUnique({
      where: { id: conversationId },
      select: aiConversationSelect
    });

    return conversation ? toConversationRecord(conversation) : null;
  }

  async findModelProfileById(modelProfileId: string): Promise<AIModelProfileExecutionRecord | null> {
    const modelProfile = await this.prisma.aIModelProfile.findUnique({
      where: { id: modelProfileId },
      select: {
        id: true,
        providerConfigId: true,
        model: true,
        displayName: true,
        temperature: true,
        maxTokens: true,
        enabled: true,
        providerConfig: {
          select: {
            id: true,
            ownerUserId: true,
            provider: true,
            baseURL: true,
            encryptedApiKey: true
          }
        }
      }
    });

    return modelProfile;
  }

  async createConversation(input: {
    readonly ownerUserId: string;
    readonly title: string;
    readonly currentDocumentId: string | null;
    readonly selectedContextSnapshot: AIConversationContextSnapshot;
    readonly messages: readonly AIConversationMessageDTO[];
  }): Promise<AIConversationRecord> {
    const conversation = await this.prisma.aIConversation.create({
      data: {
        ownerUserId: input.ownerUserId,
        title: input.title,
        currentDocumentId: input.currentDocumentId,
        selectedContextSnapshot: toInputJson(input.selectedContextSnapshot),
        messages: toInputJson(input.messages)
      },
      select: aiConversationSelect
    });

    return toConversationRecord(conversation);
  }

  async appendMessages(input: {
    readonly conversationId: string;
    readonly ownerUserId: string;
    readonly selectedContextSnapshot: AIConversationContextSnapshot;
    readonly messages: readonly AIConversationMessageDTO[];
  }): Promise<AIConversationRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const lockedRows = await transaction.$queryRaw<readonly { readonly id: string }[]>`
        SELECT "id"
        FROM "AIConversation"
        WHERE "id" = ${input.conversationId} AND "ownerUserId" = ${input.ownerUserId}
        FOR UPDATE
      `;

      if (lockedRows.length === 0) {
        return null;
      }

      const currentRecord = await transaction.aIConversation.findUnique({
        where: { id: input.conversationId },
        select: aiConversationSelect
      });

      if (!currentRecord) {
        return null;
      }

      const current = toConversationRecord(currentRecord);
      const conversation = await transaction.aIConversation.update({
        where: { id: input.conversationId },
        data: {
          selectedContextSnapshot: toInputJson(input.selectedContextSnapshot),
          messages: toInputJson([...current.messages, ...input.messages])
        },
        select: aiConversationSelect
      });

      return toConversationRecord(conversation);
    });
  }

  async deleteConversation(input: {
    readonly conversationId: string;
    readonly ownerUserId: string;
  }): Promise<boolean> {
    const result = await this.prisma.aIConversation.deleteMany({
      where: {
        id: input.conversationId,
        ownerUserId: input.ownerUserId
      }
    });

    return result.count === 1;
  }
}

export function createAIConversationService(
  repository: AIConversationRepository,
  permissions: Pick<PermissionService, "canReadDocument">,
  options: {
    readonly now?: () => Date;
    readonly createId?: () => string;
    readonly providerAdapter?: AIProviderAdapter;
    readonly cipher?: AIKeyCipher;
    readonly usageService?: Pick<AIUsageService, "recordUsage">;
  } = {}
) {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const providerAdapter = options.providerAdapter ?? createOpenAICompatibleProviderAdapter();
  const cipher = options.cipher ?? createAIKeyCipher();

  async function resolveUsageService(): Promise<Pick<AIUsageService, "recordUsage">> {
    return options.usageService ?? getDefaultAIUsageService();
  }

  async function ensureReadableContext(
    actor: AIConversationActor,
    currentDocumentId: string | null,
    snapshot: AIConversationContextSnapshot
  ): Promise<void> {
    if (snapshot.currentDocumentId !== currentDocumentId) {
      throw badRequest("AI context current document mismatch");
    }

    if (currentDocumentId === null && snapshot.items.length > 0) {
      throw badRequest("Standalone AI conversations cannot include document context yet");
    }

    for (const documentId of contextDocumentIds(currentDocumentId, snapshot)) {
      if (!(await permissions.canReadDocument(actor.userId, documentId))) {
        throw forbidden("Document read permission required");
      }
    }
  }

  async function prepareRun(input: {
    readonly actor: AIConversationActor;
    readonly conversationId: string;
    readonly modelProfileId: string;
    readonly message: { readonly role: "user"; readonly content: string };
    readonly selectedContextSnapshot: unknown;
  }): Promise<{
    readonly conversation: AIConversationRecord;
    readonly providerConfig: AIProviderConfigExecutionRecord;
    readonly modelProfile: AIModelProfileExecutionRecord;
    readonly snapshot: AIConversationContextSnapshot;
    readonly runId: string;
    readonly queuedAt: Date;
    readonly startedAt: Date;
    readonly userMessage: AIConversationMessageDTO;
    readonly apiKey: string;
    readonly controller: AbortController;
    readonly runningRun: AIConversationRunDTO;
  }> {
    const conversation = ensureOwnedConversation(
      await repository.findConversationById(input.conversationId),
      input.actor.userId
    );

    const modelProfile = await repository.findModelProfileById(input.modelProfileId);
    const providerConfig = modelProfile?.providerConfig ?? null;

    if (!modelProfile || !providerConfig || providerConfig.ownerUserId !== input.actor.userId || !modelProfile.enabled) {
      throw notFound();
    }

    const snapshot = normalizeContextSnapshot(input.selectedContextSnapshot);
    await ensureReadableContext(input.actor, conversation.currentDocumentId, snapshot);
    const runId = createId();
    const queuedAt = now();
    const startedAt = now();
    const controller = new AbortController();
    const runningRun = createRunSnapshot({
      id: runId,
      status: "running",
      providerConfigId: providerConfig.id,
      modelProfileId: modelProfile.id,
      createdAt: queuedAt,
      startedAt
    });
    const userMessage: AIConversationMessageDTO = {
      id: createId(),
      role: "user",
      content: ensureMessageContent(input.message.content),
      createdAt: toIsoString(startedAt),
      runId,
      runStatus: "running"
    };
    const apiKey = decryptProviderKey(cipher, providerConfig.encryptedApiKey);

    registerActiveRun({
      runId,
      ownerUserId: input.actor.userId,
      conversationId: conversation.id,
      controller,
      run: runningRun
    });

    return {
      conversation,
      providerConfig,
      modelProfile,
      snapshot,
      runId,
      queuedAt,
      startedAt,
      userMessage,
      apiKey,
      controller,
      runningRun
    };
  }

  async function persistFailedRun(input: {
    readonly actor: AIConversationActor;
    readonly conversation: AIConversationRecord;
    readonly snapshot: AIConversationContextSnapshot;
    readonly userMessage: AIConversationMessageDTO;
    readonly run: AIConversationRunDTO;
  }): Promise<AIConversationRecord> {
    const failedConversation = await repository.appendMessages({
      conversationId: input.conversation.id,
      ownerUserId: input.actor.userId,
      selectedContextSnapshot: input.snapshot,
      messages: [
        {
          ...input.userMessage,
          runStatus: input.run.status,
          errorCategory: input.run.errorCategory ?? null,
          errorMessage: input.run.errorMessage
        }
      ]
    });

    return ensureOwnedConversation(failedConversation, input.actor.userId);
  }

  async function appendRunResult(input: {
    readonly actor: AIConversationActor;
    readonly conversation: AIConversationRecord;
    readonly providerConfig: AIProviderConfigExecutionRecord;
    readonly modelProfile: AIModelProfileExecutionRecord;
    readonly snapshot: AIConversationContextSnapshot;
    readonly userMessage: AIConversationMessageDTO;
    readonly assistantContent: string;
    readonly assistantMessageId?: string;
    readonly completedAt: Date;
    readonly usage?: AIProviderUsageMetadata;
  }): Promise<{ readonly conversation: AIConversationDTO; readonly run: AIConversationRunDTO; readonly assistantMessage: AIConversationMessageDTO }> {
    const assistantMessage: AIConversationMessageDTO = {
      id: input.assistantMessageId ?? createId(),
      role: "assistant",
      content: ensureAssistantContent(input.assistantContent),
      createdAt: toIsoString(input.completedAt),
      runStatus: "succeeded",
      sources: contextSources(input.snapshot),
      ...(input.userMessage.runId === undefined ? {} : { runId: input.userMessage.runId })
    };
    const updatedConversation = await repository.appendMessages({
      conversationId: input.conversation.id,
      ownerUserId: input.actor.userId,
      selectedContextSnapshot: input.snapshot,
      messages: [{ ...input.userMessage, runStatus: "succeeded" }, assistantMessage]
    });

    await recordAggregateUsage({
      usageService: await resolveUsageService(),
      actor: input.actor,
      providerConfig: input.providerConfig,
      modelProfile: input.modelProfile,
      completedAt: input.completedAt,
      ...(input.usage === undefined ? {} : { usage: input.usage })
    });

    const run = createRunSnapshot({
      id: input.userMessage.runId ?? "",
      status: "succeeded",
      providerConfigId: input.providerConfig.id,
      modelProfileId: input.modelProfile.id,
      createdAt: new Date(input.userMessage.createdAt),
      startedAt: new Date(input.userMessage.createdAt),
      completedAt: input.completedAt
    });

    return {
      conversation: toConversationDTO(ensureOwnedConversation(updatedConversation, input.actor.userId)),
      run,
      assistantMessage: projectMessage(assistantMessage, contextSources(input.snapshot))
    };
  }

  async function* runStreaming(input: {
    readonly actor: AIConversationActor;
    readonly conversationId: string;
    readonly modelProfileId: string;
    readonly message: { readonly role: "user"; readonly content: string };
    readonly selectedContextSnapshot: unknown;
  }): AsyncIterable<AIConversationRunStreamEvent> {
    const prepared = await prepareRun(input);
    const userMessage = projectMessage(prepared.userMessage, contextSources(prepared.snapshot));
    const assistantMessageId = createId();

    yield { type: "run", run: prepared.runningRun };
    yield { type: "user_message", message: userMessage };

    try {
      let finalAssistantText = "";
      let usage: AIProviderUsageMetadata | undefined;

      for await (const event of providerAdapter.streamConversation({
        config: {
          id: prepared.providerConfig.id,
          ownerUserId: prepared.providerConfig.ownerUserId,
          provider: prepared.providerConfig.provider,
          baseURL: prepared.providerConfig.baseURL,
          model: prepared.modelProfile.model,
          temperature: prepared.modelProfile.temperature,
          maxTokens: prepared.modelProfile.maxTokens,
          apiKey: prepared.apiKey
        },
        messages: prepared.conversation.messages,
        userMessage: prepared.userMessage,
        selectedContextSnapshot: prepared.snapshot,
        signal: prepared.controller.signal
      })) {
        if (event.type === "delta") {
          yield {
            type: "assistant_delta",
            runId: prepared.runId,
            messageId: assistantMessageId,
            delta: event.delta
          };
        } else {
          finalAssistantText = event.assistantText;
          usage = event.usage;
        }
      }

      if (prepared.controller.signal.aborted) {
        throw new AIProviderExecutionError("cancelled");
      }

      const completedAt = now();
      const runUsage = runUsageDTO(usage);
      const result = await appendRunResult({
        actor: input.actor,
        conversation: prepared.conversation,
        providerConfig: prepared.providerConfig,
        modelProfile: prepared.modelProfile,
        snapshot: prepared.snapshot,
        userMessage: prepared.userMessage,
        assistantContent: finalAssistantText,
        assistantMessageId,
        completedAt,
        ...(usage === undefined ? {} : { usage })
      });
      const run = createRunSnapshot({
        id: prepared.runId,
        status: "succeeded",
        providerConfigId: prepared.providerConfig.id,
        modelProfileId: prepared.modelProfile.id,
        createdAt: prepared.queuedAt,
        startedAt: prepared.startedAt,
        completedAt,
        ...(runUsage === undefined ? {} : { usage: runUsage })
      });
      completeActiveRun(run, input.actor.userId);

      if (runUsage) {
        yield { type: "usage", runId: prepared.runId, usage: runUsage };
      }
      yield { type: "assistant_message", message: result.assistantMessage };
      yield { type: "done", run, conversation: result.conversation };
    } catch (error) {
      const providerError = providerErrorFromUnknown(error);
      const completedAt = now();
      const run = safeProviderFailureRun({
        runId: prepared.runId,
        providerConfigId: prepared.providerConfig.id,
        modelProfileId: prepared.modelProfile.id,
        category: providerError.category,
        createdAt: prepared.queuedAt,
        startedAt: prepared.startedAt,
        completedAt
      });
      const failedConversation = await persistFailedRun({
        actor: input.actor,
        conversation: prepared.conversation,
        snapshot: prepared.snapshot,
        userMessage: prepared.userMessage,
        run
      });
      completeActiveRun(run, input.actor.userId);

      yield {
        type: "error",
        run,
        category: providerError.category,
        message: safeProviderErrorMessage(providerError.category)
      };
      yield { type: "done", run, conversation: toConversationDTO(failedConversation) };
    }
  }

  async function runBlocking(input: {
    readonly actor: AIConversationActor;
    readonly conversationId: string;
    readonly modelProfileId: string;
    readonly message: { readonly role: "user"; readonly content: string };
    readonly selectedContextSnapshot: unknown;
  }): Promise<{ readonly conversation: AIConversationDTO; readonly run: AIConversationRunDTO }> {
    const prepared = await prepareRun(input);

    try {
      const providerResult = await providerAdapter.runConversation({
        config: {
          id: prepared.providerConfig.id,
          ownerUserId: prepared.providerConfig.ownerUserId,
          provider: prepared.providerConfig.provider,
          baseURL: prepared.providerConfig.baseURL,
          model: prepared.modelProfile.model,
          temperature: prepared.modelProfile.temperature,
          maxTokens: prepared.modelProfile.maxTokens,
          apiKey: prepared.apiKey
        },
        messages: prepared.conversation.messages,
        userMessage: prepared.userMessage,
        selectedContextSnapshot: prepared.snapshot,
        signal: prepared.controller.signal
      });
      if (prepared.controller.signal.aborted) {
        throw new AIProviderExecutionError("cancelled");
      }

      const completedAt = now();
      const runUsage = runUsageDTO(providerResult.usage);
      const result = await appendRunResult({
        actor: input.actor,
        conversation: prepared.conversation,
        providerConfig: prepared.providerConfig,
        modelProfile: prepared.modelProfile,
        snapshot: prepared.snapshot,
        userMessage: prepared.userMessage,
        assistantContent: providerResult.assistantText,
        completedAt,
        ...(providerResult.usage === undefined ? {} : { usage: providerResult.usage })
      });
      const run = createRunSnapshot({
        id: prepared.runId,
        status: "succeeded",
        providerConfigId: prepared.providerConfig.id,
        modelProfileId: prepared.modelProfile.id,
        createdAt: prepared.queuedAt,
        startedAt: prepared.startedAt,
        completedAt,
        ...(runUsage === undefined ? {} : { usage: runUsage })
      });
      completeActiveRun(run, input.actor.userId);

      return { conversation: result.conversation, run };
    } catch (error) {
      const providerError = providerErrorFromUnknown(error);
      const completedAt = now();
      const run = safeProviderFailureRun({
        runId: prepared.runId,
        providerConfigId: prepared.providerConfig.id,
        modelProfileId: prepared.modelProfile.id,
        category: providerError.category,
        createdAt: prepared.queuedAt,
        startedAt: prepared.startedAt,
        completedAt
      });
      const failedConversation = await persistFailedRun({
        actor: input.actor,
        conversation: prepared.conversation,
        snapshot: prepared.snapshot,
        userMessage: prepared.userMessage,
        run
      });
      completeActiveRun(run, input.actor.userId);

      return { conversation: toConversationDTO(failedConversation), run };
    }
  }

  return {
    async listConversations(actor: AIConversationActor): Promise<{
      readonly conversations: readonly AIConversationDTO[];
    }> {
      const conversations = await repository.listConversations({ ownerUserId: actor.userId, currentDocumentId: null });
      return { conversations: conversations.map(toConversationDTO) };
    },

    async listConversationsForDocument(
      actor: AIConversationActor,
      currentDocumentId: string
    ): Promise<ListAIConversationsResponse> {
      if (!(await permissions.canReadDocument(actor.userId, currentDocumentId))) {
        throw forbidden("Document read permission required");
      }

      const conversations = await repository.listConversations({ ownerUserId: actor.userId, currentDocumentId });
      return { conversations: conversations.map(toConversationDTO) };
    },

    async getConversation(
      actor: AIConversationActor,
      conversationId: string
    ): Promise<{ readonly conversation: AIConversationDTO }> {
      const conversation = ensureOwnedConversation(
        await repository.findConversationById(conversationId),
        actor.userId
      );

      return { conversation: toConversationDTO(conversation) };
    },

    async createConversation(input: {
      readonly actor: AIConversationActor;
      readonly title: string;
      readonly currentDocumentId: string | null;
      readonly selectedContextSnapshot: unknown;
    }): Promise<{ readonly conversation: AIConversationDTO }> {
      const snapshot = normalizeContextSnapshot(input.selectedContextSnapshot);
      await ensureReadableContext(input.actor, input.currentDocumentId, snapshot);
      const conversation = await repository.createConversation({
        ownerUserId: input.actor.userId,
        title: ensureTitle(input.title),
        currentDocumentId: input.currentDocumentId,
        selectedContextSnapshot: snapshot,
        messages: []
      });

      return { conversation: toConversationDTO(conversation) };
    },

    async appendMessage(input: {
      readonly actor: AIConversationActor;
      readonly conversationId: string;
      readonly modelProfileId: string;
      readonly message: { readonly role: "user"; readonly content: string };
      readonly selectedContextSnapshot: unknown;
    }): Promise<{ readonly conversation: AIConversationDTO; readonly run: AIConversationRunDTO }> {
      return runBlocking(input);
    },

    streamMessage(input: {
      readonly actor: AIConversationActor;
      readonly conversationId: string;
      readonly modelProfileId: string;
      readonly message: { readonly role: "user"; readonly content: string };
      readonly selectedContextSnapshot: unknown;
    }): AsyncIterable<AIConversationRunStreamEvent> {
      return runStreaming(input);
    },

    async cancelRun(input: {
      readonly actor: AIConversationActor;
      readonly runId: string;
    }): Promise<{ readonly run: AIConversationRunDTO }> {
      const activeRun = activeRunFor(input.actor, input.runId);

      if (activeRun) {
        activeRun.controller.abort();
        const cancelledRun = {
          ...runFromActive(activeRun),
          status: "cancelled" as const,
          errorCategory: "cancelled" as const,
          errorMessage: safeProviderErrorMessage("cancelled"),
          completedAt: toIsoString(now())
        };
        activeConversationRuns.set(input.runId, { ...activeRun, run: cancelledRun });

        return { run: cancelledRun };
      }

      const completedRun = completedRunFor(input.actor, input.runId);

      if (completedRun) {
        return { run: completedRun };
      }

      throw notFound();
    },

    async deleteConversation(input: {
      readonly actor: AIConversationActor;
      readonly conversationId: string;
    }): Promise<{ readonly conversationId: string }> {
      if (
        !(await repository.deleteConversation({
          conversationId: input.conversationId,
          ownerUserId: input.actor.userId
        }))
      ) {
        throw notFound();
      }

      return {
        conversationId: input.conversationId
      };
    }
  };
}

export type AIConversationService = ReturnType<typeof createAIConversationService>;

let cachedService: AIConversationService | undefined;

export async function getDefaultAIConversationService(): Promise<AIConversationService> {
  if (!cachedService) {
    const [{ prisma }] = await Promise.all([import("@jixia/db")]);
    cachedService = createAIConversationService(new PrismaAIConversationRepository(prisma), {
      canReadDocument: defaultCanReadDocument
    });
  }

  return cachedService;
}
