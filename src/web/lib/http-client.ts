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
  actorUserId: string;
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

interface ActorSessionRequestOptions extends RequestOptions {
  actorUserId: string;
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


function requestSessionJson<T>(
  input: string,
  init: ActorSessionRequestOptions,
): Promise<T> {
  const { actorUserId, headers, ...requestOptions } = init;

  return requestJson<T>(input, {
    ...requestOptions,
    headers: {
      "x-jixia-actor": actorUserId,
      ...(headers ?? {}),
    },
  });
}

interface JobEventSubscription {
  close(): void;
}

function subscribeToJobEvents(
  input: JobStatusQuery & { actorUserId: string },
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
        headers: {
          "x-jixia-actor": input.actorUserId,
        },
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
    actorUserId: string,
  ): Promise<ProjectMemberRecord> {
    return requestSessionJson(`/api/projects/${projectId}/members`, {
      actorUserId,
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createCredential(
    actorUserId: string,
    input: CreateCredentialPayload,
  ): Promise<CredentialRecord> {
    return requestSessionJson("/api/credentials", {
      actorUserId,
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createJob(actorUserId: string, input: CreateJobPayload): Promise<JobRecord> {
    return requestSessionJson("/api/jobs", {
      actorUserId,
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createProject(
    input: CreateProjectRequest,
    actorUserId: string,
  ): Promise<ProjectListItem> {
    return requestSessionJson("/api/projects", {
      actorUserId,
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createProjectDoc(
    input: CreateProjectDocPayload,
    actorUserId: string,
  ): Promise<ProjectDocRecord> {
    return requestSessionJson("/api/project-docs", {
      actorUserId,
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createReadingNote(
    actorUserId: string,
    input: CreateReadingNotePayload,
  ): Promise<NoteRecord> {
    return requestSessionJson("/api/reading/notes", {
      actorUserId,
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createSpace(
    actorUserId: string,
    input: CreateSpaceRequest,
  ): Promise<SpaceSummary> {
    return requestSessionJson("/api/spaces", {
      actorUserId,
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  listCredentials(userId: string): Promise<CredentialRecord[]> {
    return requestSessionJson("/api/credentials", { actorUserId: userId });
  },
  listLibraryEntries(
    actorUserId: string,
    scope: ScopeRef,
    spaceId?: string,
  ): Promise<LibraryEntryView[]> {
    return requestSessionJson("/api/library", {
      actorUserId,
      query: {
        scopeId: scope.id,
        scopeType: scope.type,
        spaceId,
      },
    });
  },
  listJobEvents(actorUserId: string, jobId: string): Promise<JobEventRecord[]> {
    return requestSessionJson(`/api/jobs/${jobId}/events`, {
      actorUserId,
    });
  },
  listJobs(actorUserId: string, spaceId?: string): Promise<JobRecord[]> {
    return requestSessionJson("/api/jobs", {
      actorUserId,
      query: {
        spaceId,
      },
    });
  },
  listProjectMembers(
    projectId: string,
    actorUserId: string,
  ): Promise<ProjectMemberRecord[]> {
    return requestSessionJson(`/api/projects/${projectId}/members`, {
      actorUserId,
    });
  },
  listProjects(actorUserId: string): Promise<ProjectListItem[]> {
    return requestSessionJson("/api/projects", { actorUserId });
  },
  listMemberships(
    spaceId: string,
    actorUserId: string,
  ): Promise<SpaceMembership[]> {
    return requestSessionJson(`/api/spaces/${spaceId}/memberships`, {
      actorUserId,
    });
  },
  listSpaces(actorUserId: string): Promise<SpaceSummary[]> {
    return requestSessionJson("/api/spaces", { actorUserId });
  },
  importPaper(
    actorUserId: string,
    input: ImportPaperPayload,
  ): Promise<LibraryEntryView> {
    return requestSessionJson("/api/import/paper", {
      actorUserId,
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  getProjectDoc(
    documentId: string,
    actorUserId: string,
  ): Promise<ProjectDocSnapshot> {
    return requestSessionJson(`/api/project-docs/${documentId}`, {
      actorUserId,
    });
  },
  getLatestProjectDoc(
    projectId: string,
    actorUserId: string,
  ): Promise<ProjectDocRecord | null> {
    return requestSessionJson(`/api/projects/${projectId}/writing-document`, {
      actorUserId,
    });
  },
  getReadingDetail(
    actorUserId: string,
    entryId: string,
    _input?: ReadingDetailRequest,
  ): Promise<ReadingDetail | null> {
    return requestSessionJson(`/api/reading/${entryId}`, {
      actorUserId,
    });
  },
  runJob(actorUserId: string, jobId: string): Promise<JobRecord> {
    return requestSessionJson(`/api/jobs/${jobId}/run`, {
      actorUserId,
      method: "POST",
    });
  },
  saveReadingInsight(
    actorUserId: string,
    input: SaveReadingInsightPayload,
  ): Promise<import("@shared/contracts/evidence").GeneratedInsightRecord> {
    return requestSessionJson("/api/reading/insights", {
      actorUserId,
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  saveProjectDocVersion(
    documentId: string,
    input: SaveProjectDocVersionPayload,
    actorUserId: string,
  ): Promise<ProjectDocSnapshot> {
    return requestSessionJson(`/api/project-docs/${documentId}/versions`, {
      actorUserId,
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  subscribeToJobEvents,
  transitionProjectDocPublishState(
    documentId: string,
    publishState: PublishState,
    actorUserId: string,
  ): Promise<ProjectDocRecord> {
    return requestSessionJson(`/api/project-docs/${documentId}/publish-state`, {
      actorUserId,
      body: JSON.stringify({ publishState }),
      method: "POST",
    });
  },
};
