import type {
  CreateCredentialRequest,
  CredentialRecord,
} from "@shared/contracts/credentials";
import type {
  CreateJobRequest,
  JobEventRecord,
  JobStatusQuery,
  JobRecord,
} from "@shared/contracts/jobs";
import type {
  ImportLibraryEntryRequest,
  LibraryEntryView,
} from "@shared/contracts/library";
import type {
  AddProjectMemberRequest,
  CreateProjectRequest,
  ProjectListItem,
  ProjectMemberRecord,
  ScopeRef,
} from "@shared/contracts/projects";
import type {
  CreateProjectDocRequest,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from "@shared/contracts/project-docs";
import type {
  CreateReadingNoteRequest,
  GetReadingDetailQuery,
  NoteRecord,
  ReadingDetail,
  SaveReadingInsightRequest,
} from "@shared/contracts/reading";
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
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface JobAccessContext {
  actorSpaceId: string;
}

type CreateCredentialPayload = Omit<CreateCredentialRequest, "userId">;
type CreateJobPayload = Omit<CreateJobRequest, "requestedByUserId">;
type CreateProjectDocPayload = Omit<CreateProjectDocRequest, "createdByUserId">;
type CreateReadingNotePayload = Omit<
  CreateReadingNoteRequest,
  "actorSpaceId" | "authorUserId"
>;
type ImportPaperPayload = Omit<ImportLibraryEntryRequest, "requestedByUserId">;
type ReadingDetailRequest = Omit<GetReadingDetailQuery, "actorUserId" | "actorSpaceId">;
type SaveReadingInsightPayload = Omit<
  SaveReadingInsightRequest,
  "actorSpaceId" | "startedByUserId"
>;
type SaveProjectDocVersionPayload = {
  citations: Array<{ evidenceSpan?: string; paperAssetId: string }>;
  content: string;
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

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
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
    throw new ApiError(await readErrorMessage(response), response.status);
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
        throw new ApiError(await readErrorMessage(response), response.status);
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
  createReadingNote(
    input: CreateReadingNotePayload,
  ): Promise<NoteRecord> {
    return requestJson("/api/reading/notes", {
      body: JSON.stringify(input),
      method: "POST",
    });
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
  listJobs(spaceId?: string): Promise<JobRecord[]> {
    return requestJson("/api/jobs", {
      query: {
        spaceId,
      },
    });
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
  getCurrentSession(): Promise<{ user: SessionUser }> {
    return requestJson("/api/session/me");
  },
  getProjectDoc(documentId: string): Promise<ProjectDocSnapshot> {
    return requestJson(`/api/project-docs/${documentId}`);
  },
  getLatestProjectDoc(projectId: string): Promise<ProjectDocRecord | null> {
    return requestJson(`/api/projects/${projectId}/writing-document`);
  },
  getReadingDetail(
    entryId: string,
    _input?: ReadingDetailRequest,
  ): Promise<ReadingDetail | null> {
    return requestJson(`/api/reading/${entryId}`);
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
      citations: Array<{ evidenceSpan?: string; paperAssetId: string }>;
      content: string;
      projectId: string;
      title: string;
    },
  ): Promise<WritingDocumentResponse> {
    return requestJson(`/api/projects/${input.projectId}/writing/document`, {
      body: JSON.stringify({
        citations: input.citations,
        content: input.content,
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
  saveProjectDocVersion(
    documentId: string,
    input: SaveProjectDocVersionPayload,
  ): Promise<ProjectDocSnapshot> {
    return requestJson(`/api/project-docs/${documentId}/versions`, {
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
