import type { CredentialRecord } from "@shared/contracts/credentials";
import type { CommandSearchResponse } from "@shared/contracts/command-search";
import type {
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
} from "@shared/contracts/discovery";
import type { DocumentBlockDocument } from "@shared/contracts/document-content";
import type { HomeCockpitResponse } from "@shared/contracts/home-cockpit";
import type {
  JobAuditRecord,
  JobEventRecord,
  JobStatusQuery,
  JobRecord,
} from "@shared/contracts/jobs";
import type {
  AdoptProjectLibraryEntryRequest,
  AdoptProjectLibraryEntryResponse,
  ImportSourceType,
  LibraryListResponse,
  LibraryEntryVisibility,
  LibraryEntryView,
} from "@shared/contracts/library";
import type {
  CaptureNotebookEvidenceRequest,
  CaptureNotebookEvidenceResponse,
  ListNotebookDocumentsResponse,
  NotebookDocumentRecord,
  NotebookDocumentSnapshot,
} from "@shared/contracts/notebook";
import type {
  AddProjectMemberRequest,
  CreateProjectRequest,
  ProjectListItem,
  ProjectMemberRecord,
  ProjectWorkspaceResponse,
  ScopeRef,
} from "@shared/contracts/projects";
import type {
  ProjectDocRecord,
  ProjectDocCitationTraceResponse,
  ProjectDocSnapshot,
} from "@shared/contracts/project-docs";
import type {
  PrivateReadingNoteRecord,
  ReadingInsightResponse,
  ReaderExcerptRecord,
  ReaderExcerptResponse,
  ReadingNoteResponse,
  ProjectReadingCommentRecord,
  CreateReaderExcerptRequest,
  ListReaderExcerptsResponse,
  ReadingDetail,
} from "@shared/contracts/reading";
import type {
  DefaultImportTarget,
  WorkbenchSettingsResponse,
} from "@shared/contracts/settings";
import type {
  CreateSpaceRequest,
  SpaceMembership,
  SpaceSummary,
} from "@shared/contracts/spaces";
import type { PublishState } from "@shared/contracts/writing";
import type { WritingDocumentResponse } from "@shared/contracts/writing";
import type { SessionUser } from "@shared/contracts/session";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type CreateCredentialPayload = {
  provider: string;
  rawSecret: string;
};
type CreateJobPayload = {
  credentialRef: string;
  kind: string;
  payload: Record<string, unknown>;
  scope: ScopeRef;
  spaceId: string;
};
type ListJobsInput = {
  scope: ScopeRef;
  spaceId?: string;
};
type CreateProjectDocPayload = {
  projectId: string;
  publishState?: PublishState;
  title: string;
};
type CreateNotebookPayload = {
  title: string;
};
type CreateReadingNotePayload = {
  body: string;
  libraryEntryId: string;
};
type SearchCommandsInput = {
  projectId?: string;
  query: string;
};
type CreateReadingNoteForEntryPayload = {
  body: string;
  entryId: string;
};
type CreateReaderExcerptPayload = CreateReaderExcerptRequest & {
  entryId: string;
};
type CreateProjectReadingCommentPayload = {
  body: string;
  libraryEntryId: string;
  projectId?: string;
};
type ImportToPersonalLibraryPayload = {
  sourceLocator: string;
  sourceType: Exclude<ImportSourceType, "upload">;
};
type ImportPaperPayload = {
  projectId?: string;
  scope?: ScopeRef;
  sourceLocator: string;
  sourceType: Exclude<ImportSourceType, "upload">;
  spaceId: string;
  visibility: LibraryEntryVisibility;
};
type UploadPdfToLibraryPayload = {
  pdfContents: string;
  projectId?: string;
  scope?: ScopeRef;
  spaceId: string;
  visibility: LibraryEntryVisibility;
};
type SaveReadingInsightPayload = {
  evidenceSpans: Array<{
    endOffset: number;
    quote: string;
    startOffset: number;
  }>;
  libraryEntryId: string;
  summary: string;
  title: string;
};
type SaveReadingInsightForEntryPayload = {
  entryId: string;
  evidenceSpans: Array<{
    endOffset: number;
    quote: string;
    startOffset: number;
  }>;
  summary: string;
  title: string;
};
type SaveWorkbenchSettingsPayload = {
  apiKey?: string;
  defaultImportTarget: DefaultImportTarget;
};
type SaveProjectDocVersionPayload = {
  citations: Array<{
    evidenceSpan?: string;
    libraryEntryId?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }>;
  content?: string;
  documentContent?: DocumentBlockDocument;
};
type SaveNotebookVersionPayload = {
  citations: Array<{
    evidenceSpan?: string;
    libraryEntryId?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }>;
  content?: string;
  documentContent?: DocumentBlockDocument;
};

interface RequestOptions extends RequestInit {
  query?: Record<string, string | undefined>;
}

function buildUrl(
  input: string,
  query?: Record<string, string | undefined>,
): string {
  const baseUrl = typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost";
  const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(input);
  const url = new URL(input, baseUrl);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

  if (isAbsolute) {
    return url.toString();
  }

  return `${url.pathname}${url.search}`;
}

async function readErrorPayload(response: Response): Promise<{
  code?: string;
  details?: unknown;
  message: string;
}> {
  try {
    const payload = (await response.json()) as {
      code?: unknown;
      details?: unknown;
      error?: unknown;
    };
    return {
      code: typeof payload.code === "string" ? payload.code : undefined,
      details: payload.details,
      message: typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}`,
    };
  } catch {
    return { message: `Request failed with status ${response.status}` };
  }
}

export async function requestJson<T>(
  input: string,
  init: RequestOptions = {},
): Promise<T> {
  const requestUrl = buildUrl(input, init.query);
  const fetchUrl = requestUrl.startsWith("/") && typeof window !== "undefined"
    ? new URL(requestUrl, window.location.origin).toString()
    : requestUrl;
  const { query: _query, headers, ...requestOptions } = init;

  const response = await fetch(fetchUrl, {
    ...requestOptions,
    credentials: requestOptions.credentials ?? "same-origin",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorPayload = await readErrorPayload(response);
    throw new ApiError(
      errorPayload.message,
      response.status,
      errorPayload.code,
      errorPayload.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

interface JobEventSubscription {
  close(): void;
}

function subscribeToJobEvents(
  input: JobStatusQuery,
  onEvent: (event: JobEventRecord) => void,
  onError?: (error: unknown) => void,
): JobEventSubscription {
  if (typeof window === "undefined" || typeof fetch === "undefined") {
    return { close() {} };
  }

  const controller = new AbortController();

  void (async () => {
    try {
      const response = await fetch(buildUrl(`/api/jobs/${input.jobId}/stream`), {
        credentials: "same-origin",
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorPayload = await readErrorPayload(response);
        throw new ApiError(
          errorPayload.message,
          response.status,
          errorPayload.code,
          errorPayload.details,
        );
      }

      if (!response.body) {
        throw new Error("Live job stream is unavailable.");
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

        while (true) {
          const separatorIndex = buffer.indexOf("\n\n");

          if (separatorIndex === -1) {
            break;
          }

          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          const dataLine = rawEvent
            .split("\n")
            .find((line) => line.startsWith("data: "));

          if (!dataLine) {
            continue;
          }

          onEvent(JSON.parse(dataLine.slice(6)) as JobEventRecord);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        onError?.(error);
      }
    }
  })();

  return {
    close() {
      controller.abort();
    },
  };
}

export const apiClient = {
  adoptProjectLibraryEntry(
    projectId: string,
    input: AdoptProjectLibraryEntryRequest,
  ): Promise<AdoptProjectLibraryEntryResponse> {
    return requestJson(`/api/projects/${projectId}/library/adoptions`, {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  getTodayRecommendations(): Promise<DiscoveryTodayResponse> {
    return requestJson("/api/discovery/today");
  },
  getHomeCockpit(): Promise<HomeCockpitResponse> {
    return requestJson("/api/home-cockpit");
  },
  searchDiscovery(query: string): Promise<DiscoverySearchResponse> {
    return requestJson("/api/discovery/search", {
      query: { query },
    });
  },
  searchCommands(input: SearchCommandsInput): Promise<CommandSearchResponse> {
    return requestJson("/api/command-search", {
      credentials: "same-origin",
      query: {
        projectId: input.projectId,
        query: input.query,
      },
    });
  },
  importToPersonalLibrary(
    input: ImportToPersonalLibraryPayload,
  ): Promise<LibraryEntryView> {
    return requestJson("/api/library/personal/import", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  addProjectMember(
    projectId: string,
    input: AddProjectMemberRequest,
  ): Promise<ProjectMemberRecord> {
    return requestJson(`/api/projects/${projectId}/members`, {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createCredential(
    input: CreateCredentialPayload,
  ): Promise<CredentialRecord> {
    return requestJson("/api/credentials", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createJob(input: CreateJobPayload): Promise<JobRecord> {
    return requestJson("/api/jobs", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  cancelJob(jobId: string): Promise<JobRecord> {
    return requestJson(`/api/jobs/${jobId}/cancel`, {
      method: "POST",
    });
  },
  createProject(
    input: CreateProjectRequest,
  ): Promise<ProjectListItem> {
    return requestJson("/api/projects", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createProjectDoc(
    input: CreateProjectDocPayload,
  ): Promise<ProjectDocRecord> {
    return requestJson("/api/project-docs", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createNotebook(
    input: CreateNotebookPayload,
  ): Promise<NotebookDocumentRecord> {
    return requestJson("/api/notebooks", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createReadingNote(
    input: CreateReadingNotePayload,
  ): Promise<PrivateReadingNoteRecord> {
    return requestJson<PrivateReadingNoteRecord>("/api/reading/notes", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createReadingNoteForEntry(
    input: CreateReadingNoteForEntryPayload,
  ): Promise<ReadingNoteResponse> {
    return requestJson(`/api/reading/${input.entryId}/notes`, {
      body: JSON.stringify({ body: input.body }),
      method: "POST",
    });
  },
  createReaderExcerpt(
    input: CreateReaderExcerptPayload,
  ): Promise<ReaderExcerptRecord> {
    return requestJson<ReaderExcerptResponse>(`/api/reading/${input.entryId}/excerpts`, {
      body: JSON.stringify({
        endOffset: input.endOffset,
        locator: input.locator,
        note: input.note,
        quote: input.quote,
        startOffset: input.startOffset,
      }),
      method: "POST",
    }).then((response) => response.excerpt);
  },
  createProjectReadingComment(
    input: CreateProjectReadingCommentPayload,
  ): Promise<ProjectReadingCommentRecord> {
    return requestJson<{ comment: ProjectReadingCommentRecord }>(
      `/api/reading/${input.libraryEntryId}/project-comments`,
      {
        body: JSON.stringify({
          body: input.body,
          projectId: input.projectId,
        }),
        method: "POST",
      },
    ).then((response) => response.comment);
  },
  createSpace(
    input: CreateSpaceRequest,
  ): Promise<SpaceSummary> {
    return requestJson("/api/spaces", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  listCredentials(): Promise<CredentialRecord[]> {
    return requestJson("/api/credentials");
  },
  listPersonalLibraryEntries(): Promise<LibraryListResponse> {
    return requestJson("/api/library/personal");
  },
  listLibraryEntries(
    scope: ScopeRef,
    spaceId?: string,
  ): Promise<LibraryEntryView[]> {
    return requestJson("/api/library", {
      query: {
        scopeId: scope.id,
        scopeType: scope.type,
        spaceId,
      },
    });
  },
  listJobEvents(jobId: string): Promise<JobEventRecord[]> {
    return requestJson(`/api/jobs/${jobId}/events`);
  },
  listJobAudits(jobId: string): Promise<JobAuditRecord[]> {
    return requestJson(`/api/jobs/${jobId}/audit`);
  },
  listJobs(input: ListJobsInput): Promise<JobRecord[]> {
    return requestJson("/api/jobs", {
      query: {
        scopeId: input.scope.id,
        scopeType: input.scope.type,
        spaceId: input.spaceId,
      },
    });
  },
  listNotebooks(): Promise<ListNotebookDocumentsResponse> {
    return requestJson("/api/notebooks");
  },
  listReaderExcerpts(entryId: string): Promise<ListReaderExcerptsResponse> {
    return requestJson(`/api/reading/${entryId}/excerpts`);
  },
  listProjectMembers(
    projectId: string,
  ): Promise<ProjectMemberRecord[]> {
    return requestJson(`/api/projects/${projectId}/members`);
  },
  listProjects(): Promise<ProjectListItem[]> {
    return requestJson("/api/projects");
  },
  listMemberships(
    spaceId: string,
  ): Promise<SpaceMembership[]> {
    return requestJson(`/api/spaces/${spaceId}/memberships`);
  },
  listSpaces(): Promise<SpaceSummary[]> {
    return requestJson("/api/spaces");
  },
  importPaper(
    input: ImportPaperPayload,
  ): Promise<LibraryEntryView> {
    return requestJson("/api/import/paper", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  uploadPdfToLibrary(
    input: UploadPdfToLibraryPayload,
  ): Promise<LibraryEntryView> {
    return requestJson("/api/import/pdf", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  getCurrentSession(): Promise<{ user: SessionUser }> {
    return requestJson("/api/session/me");
  },
  getWorkbenchSettings(): Promise<WorkbenchSettingsResponse> {
    return requestJson("/api/settings/me");
  },
  saveWorkbenchSettings(
    input: SaveWorkbenchSettingsPayload,
  ): Promise<WorkbenchSettingsResponse> {
    return requestJson("/api/settings/me", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  getProjectDoc(documentId: string): Promise<ProjectDocSnapshot> {
    return requestJson(`/api/project-docs/${documentId}`);
  },
  getProjectDocCitationTrace(
    documentId: string,
  ): Promise<ProjectDocCitationTraceResponse> {
    return requestJson(`/api/project-docs/${documentId}/citation-trace`);
  },
  getNotebook(documentId: string): Promise<NotebookDocumentRecord> {
    return requestJson(`/api/notebooks/${documentId}`);
  },
  getNotebookSnapshot(documentId: string): Promise<NotebookDocumentSnapshot> {
    return requestJson(`/api/notebooks/${documentId}/snapshot`);
  },
  getLatestProjectDoc(projectId: string): Promise<ProjectDocRecord | null> {
    return requestJson(`/api/projects/${projectId}/writing-document`);
  },
  getProjectWorkspace(projectId: string): Promise<ProjectWorkspaceResponse> {
    return requestJson(`/api/projects/${projectId}/workspace`);
  },
  getReadingDetail(
    entryId: string,
  ): Promise<ReadingDetail | null> {
    return requestJson(`/api/reading/${entryId}`);
  },
  getLibraryEntryFileUrl(entryId: string): string {
    return buildUrl(`/api/library/${encodeURIComponent(entryId)}/file`);
  },
  runJob(jobId: string): Promise<JobRecord> {
    return requestJson(`/api/jobs/${jobId}/run`, {
      method: "POST",
    });
  },
  getProjectWritingDocument(
    projectId: string,
  ): Promise<WritingDocumentResponse> {
    return requestJson(`/api/projects/${projectId}/writing/document`);
  },
  saveProjectWritingDocument(
    input: {
      citations: Array<{
        evidenceSpan?: string;
        libraryEntryId?: string;
        paperAssetId: string;
        readerExcerptId?: string;
      }>;
      content?: string;
      documentContent?: DocumentBlockDocument;
      projectId: string;
      title: string;
    },
  ): Promise<WritingDocumentResponse> {
    return requestJson(`/api/projects/${input.projectId}/writing/document`, {
      body: JSON.stringify({
        citations: input.citations,
        content: input.content,
        documentContent: input.documentContent,
        title: input.title,
      }),
      method: "POST",
    });
  },
  saveReadingInsight(
    input: SaveReadingInsightPayload,
  ): Promise<import("@shared/contracts/evidence").GeneratedInsightRecord> {
    return requestJson("/api/reading/insights", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  saveReadingInsightForEntry(
    input: SaveReadingInsightForEntryPayload,
  ): Promise<ReadingInsightResponse> {
    return requestJson(`/api/reading/${input.entryId}/insights`, {
      body: JSON.stringify({
        evidenceSpans: input.evidenceSpans,
        summary: input.summary,
        title: input.title,
      }),
      method: "POST",
    });
  },
  saveProjectDocVersion(
    documentId: string,
    input: SaveProjectDocVersionPayload,
  ): Promise<ProjectDocSnapshot> {
    return requestJson(`/api/project-docs/${documentId}/versions`, {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  saveNotebookVersion(
    documentId: string,
    input: SaveNotebookVersionPayload,
  ): Promise<NotebookDocumentSnapshot> {
    return requestJson(`/api/notebooks/${documentId}/versions`, {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  captureNotebookEvidence(
    input: CaptureNotebookEvidenceRequest,
  ): Promise<CaptureNotebookEvidenceResponse> {
    return requestJson("/api/notebooks/capture", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  subscribeToJobEvents,
  transitionProjectDocPublishState(
    documentId: string,
    publishState: PublishState,
  ): Promise<ProjectDocRecord> {
    return requestJson(`/api/project-docs/${documentId}/publish-state`, {
      body: JSON.stringify({ publishState }),
      method: "POST",
    });
  },
};
