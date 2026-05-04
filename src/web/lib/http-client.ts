import type {
  CreateCredentialRequest,
  CredentialRecord,
} from "@shared/contracts/credentials";
import type {
  CreateJobRequest,
  JobEventRecord,
  JobStatusQuery,
  JobRecord,
  RunJobRequest,
} from "@shared/contracts/jobs";
import type {
  ImportLibraryEntryRequest,
  LibraryEntryView,
  ListLibraryEntriesQuery,
} from "@shared/contracts/library";
import type {
  AddProjectMemberRequest,
  CreateProjectRequest,
  ProjectListItem,
  ProjectMemberRecord,
} from "@shared/contracts/projects";
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
  if (!query || Object.keys(query).length === 0) {
    return input;
  }

  const url = new URL(input, window.location.origin);
  Object.entries(query).forEach(([key, value]) => {
    if (value) {
      url.searchParams.set(key, value);
    }
  });

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
  const response = await fetch(buildUrl(input, init.query), {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
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
  input: JobStatusQuery & JobAccessContext,
  onEvent: (event: JobEventRecord) => void,
  onError?: (error: Event) => void,
): JobEventSubscription {
  if (
    typeof window === "undefined" ||
    typeof window.EventSource === "undefined"
  ) {
    return { close() {} };
  }

  const source = new window.EventSource(
    buildUrl(`/api/jobs/${input.jobId}/stream`, {
      actorSpaceId: input.actorSpaceId,
      actorUserId: input.actorUserId,
    }),
  );

  source.addEventListener("job", (event) => {
    const messageEvent = event as MessageEvent<string>;
    onEvent(JSON.parse(messageEvent.data) as JobEventRecord);
  });

  if (onError) {
    source.addEventListener("error", onError);
  }

  return {
    close() {
      source.close();
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
  createCredential(input: CreateCredentialRequest): Promise<CredentialRecord> {
    return requestJson("/api/credentials", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createJob(input: CreateJobRequest): Promise<JobRecord> {
    return requestJson("/api/jobs", {
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
  createReadingNote(input: CreateReadingNoteRequest): Promise<NoteRecord> {
    return requestJson("/api/reading/notes", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createSpace(
    actorUserId: string,
    input: CreateSpaceRequest,
  ): Promise<SpaceSummary> {
    return requestJson("/api/spaces", {
      body: JSON.stringify(input),
      method: "POST",
      query: { actorUserId },
    });
  },
  listCredentials(userId: string): Promise<CredentialRecord[]> {
    return requestJson("/api/credentials", { query: { userId } });
  },
  listLibraryEntries(
    input: ListLibraryEntriesQuery,
  ): Promise<LibraryEntryView[]> {
    return requestJson("/api/library", {
      query: {
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
        spaceId: input.spaceId,
      },
    });
  },
  listJobEvents(
    input: JobStatusQuery & JobAccessContext,
  ): Promise<JobEventRecord[]> {
    return requestJson(`/api/jobs/${input.jobId}/events`, {
      query: {
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
      },
    });
  },
  listJobs(input: JobAccessContext): Promise<JobRecord[]> {
    return requestJson("/api/jobs", {
      query: {
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
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
  listMemberships(spaceId: string): Promise<SpaceMembership[]> {
    return requestJson(`/api/spaces/${spaceId}/memberships`);
  },
  listSpaces(actorUserId: string): Promise<SpaceSummary[]> {
    return requestJson("/api/spaces", { query: { actorUserId } });
  },
  importPaper(input: ImportLibraryEntryRequest): Promise<LibraryEntryView> {
    return requestJson("/api/import/paper", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  getReadingDetail(
    entryId: string,
    input: GetReadingDetailQuery,
  ): Promise<ReadingDetail | null> {
    return requestJson(`/api/reading/${entryId}`, {
      query: {
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
      },
    });
  },
  runJob(input: RunJobRequest): Promise<JobRecord> {
    return requestJson(`/api/jobs/${input.jobId}/run`, {
      body: JSON.stringify({
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
      }),
      method: "POST",
    });
  },
  saveReadingInsight(
    input: SaveReadingInsightRequest,
  ): Promise<import("@shared/contracts/evidence").GeneratedInsightRecord> {
    return requestJson("/api/reading/insights", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  subscribeToJobEvents,
};
