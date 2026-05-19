import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import type { CredentialRecord } from "@shared/contracts/credentials";
import type {
  JobAuditRecord,
  JobEventRecord,
  JobRecord,
} from "@shared/contracts/jobs";
import type { ProjectListItem, ScopeRef } from "@shared/contracts/projects";
import type { SpaceSummary } from "@shared/contracts/spaces";

import { apiClient } from "../lib/http-client";
import { useSessionAuth } from "../lib/session-auth";

export type JobsWorkbenchScope =
  | {
      type: "user";
      id: string;
      label: string;
    }
  | {
      type: "project";
      id: string;
      spaceId: string;
      label: string;
      role?: string;
    };

type JobsSetupRequired = null | "credential" | "project" | "space";

export interface JobsViewModel {
  activeJob: JobRecord | null;
  audits: JobAuditRecord[];
  availableScopes: JobsWorkbenchScope[];
  canCreateJob: boolean;
  canCancelActiveJob: boolean;
  credentials: CredentialRecord[];
  error: string | null;
  events: JobEventRecord[];
  isLoading: boolean;
  isRunningJob: boolean;
  jobs: JobRecord[];
  projects: ProjectListItem[];
  refresh(): Promise<void>;
  cancelActiveJob(): Promise<void>;
  runSelectedJob(): Promise<void>;
  selectedCredentialRef: string;
  selectedJobId: string | null;
  selectedScope: JobsWorkbenchScope | null;
  selectedScopeKey: string;
  selectedUserSpaceId: string;
  setSelectedCredentialRef(credentialRef: string): void;
  setSelectedJobId(jobId: string): void;
  setSelectedScopeKey(scopeKey: string): void;
  setSelectedUserSpaceId(spaceId: string): void;
  setupRequired: JobsSetupRequired;
  spaces: SpaceSummary[];
}

function sortJobs(jobs: JobRecord[]): JobRecord[] {
  return [...jobs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function toScopeKey(scope: ScopeRef): string {
  return `${scope.type}:${scope.id}`;
}

function createUserScope(
  userId: string,
  displayName: string,
): JobsWorkbenchScope {
  return {
    id: userId,
    label: `Personal · ${displayName}`,
    type: "user",
  };
}

function buildAvailableScopes(
  userId: string,
  displayName: string,
  projects: ProjectListItem[],
): JobsWorkbenchScope[] {
  return [
    createUserScope(userId, displayName),
    ...projects.map((project) => ({
      id: project.project.id,
      label: `Project · ${project.project.name}`,
      role: project.membership.role,
      spaceId: project.project.spaceId,
      type: "project" as const,
    })),
  ];
}

function resolveScopeKey(
  requestedScopeKey: string,
  scopes: JobsWorkbenchScope[],
  userId: string,
): string {
  if (requestedScopeKey && scopes.some((scope) => toScopeKey(scope) === requestedScopeKey)) {
    return requestedScopeKey;
  }

  if (requestedScopeKey.startsWith("project:")) {
    return requestedScopeKey;
  }

  const personalScope = scopes.find((scope) =>
    scope.type === "user" && scope.id === userId
  );

  return personalScope ? toScopeKey(personalScope) : toScopeKey(scopes[0] ?? { id: "", type: "user" });
}

function findScope(
  scopes: JobsWorkbenchScope[],
  selectedScopeKey: string,
): JobsWorkbenchScope | null {
  return scopes.find((scope) => toScopeKey(scope) === selectedScopeKey) ?? null;
}

function toListJobsInput(scope: JobsWorkbenchScope): {
  scope: ScopeRef;
  spaceId?: string;
} {
  if (scope.type === "project") {
    return {
      scope: { id: scope.id, type: scope.type },
      spaceId: scope.spaceId,
    };
  }

  return {
    scope: { id: scope.id, type: scope.type },
  };
}

function resolveSelectedJobId(
  jobs: JobRecord[],
  selectedJobId: string | null,
): string | null {
  if (selectedJobId && jobs.some((job) => job.id === selectedJobId)) {
    return selectedJobId;
  }

  return jobs[0]?.id ?? null;
}

function resolveSelectedUserSpaceId(
  selectedUserSpaceId: string,
  spaces: SpaceSummary[],
): string {
  if (selectedUserSpaceId && spaces.some((space) => space.id === selectedUserSpaceId)) {
    return selectedUserSpaceId;
  }

  return "";
}

function mergeJobEvents(
  currentEvents: JobEventRecord[],
  nextEvents: JobEventRecord[],
): JobEventRecord[] {
  const mergedEvents = new Map<string, JobEventRecord>();

  currentEvents.forEach((event) => {
    mergedEvents.set(event.id, event);
  });
  nextEvents.forEach((event) => {
    mergedEvents.set(event.id, event);
  });

  return [...mergedEvents.values()].sort((left, right) =>
    left.recordedAt.localeCompare(right.recordedAt),
  );
}

function mergeJobAudits(
  currentAudits: JobAuditRecord[],
  nextAudits: JobAuditRecord[],
): JobAuditRecord[] {
  const mergedAudits = new Map<string, JobAuditRecord>();

  currentAudits.forEach((audit) => {
    mergedAudits.set(audit.id, audit);
  });
  nextAudits.forEach((audit) => {
    mergedAudits.set(audit.id, audit);
  });

  return [...mergedAudits.values()].sort((left, right) =>
    left.recordedAt.localeCompare(right.recordedAt),
  );
}

function readRequestedScopeKey(search?: string): string {
  if (typeof search !== "string" && typeof window === "undefined") {
    return "";
  }

  const searchParams = new URLSearchParams(search ?? window.location.search);
  const scopeType = searchParams.get("scopeType");
  const scopeId = searchParams.get("scopeId");

  if ((scopeType === "user" || scopeType === "project") && scopeId) {
    return `${scopeType}:${scopeId}`;
  }

  return "";
}

function readRequestedJobId(search?: string): string | null {
  if (typeof search !== "string" && typeof window === "undefined") {
    return null;
  }

  const searchParams = new URLSearchParams(search ?? window.location.search);
  const jobId = searchParams.get("jobId")?.trim();

  return jobId || null;
}

function persistJobsUrlSelection(
  scopeKey: string,
  jobId: string | null,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextUrl = new URL(window.location.href);
  const [scopeType, scopeId] = scopeKey.split(":");

  if ((scopeType === "user" || scopeType === "project") && scopeId) {
    nextUrl.searchParams.set("scopeType", scopeType);
    nextUrl.searchParams.set("scopeId", scopeId);
  } else {
    nextUrl.searchParams.delete("scopeType");
    nextUrl.searchParams.delete("scopeId");
  }

  if (jobId) {
    nextUrl.searchParams.set("jobId", jobId);
  } else {
    nextUrl.searchParams.delete("jobId");
  }

  window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
}

export function useJobsPresenter(): JobsViewModel {
  const location = useLocation();
  const { user } = useSessionAuth();
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [audits, setAudits] = useState<JobAuditRecord[]>([]);
  const [events, setEvents] = useState<JobEventRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunningJob, setIsRunningJob] = useState(false);
  const [selectedScopeKey, setSelectedScopeKeyState] = useState(readRequestedScopeKey);
  const [selectedCredentialRef, setSelectedCredentialRefState] = useState("");
  const [selectedJobId, setSelectedJobIdState] = useState<string | null>(readRequestedJobId);
  const [selectedUserSpaceId, setSelectedUserSpaceIdState] = useState("");
  const subscriptionRef = useRef<{ close(): void } | null>(null);
  const isMountedRef = useRef(false);
  const refreshGenerationRef = useRef(0);
  const activityGenerationRef = useRef(0);
  const runGenerationRef = useRef(0);
  const selectedScopeKeyRef = useRef(selectedScopeKey);
  const lastLocationSearchRef = useRef(location.search);

  const canCommitRefresh = useCallback((generation: number) => {
    return isMountedRef.current && refreshGenerationRef.current === generation;
  }, []);

  const canCommitActivity = useCallback((generation: number) => {
    return isMountedRef.current && activityGenerationRef.current === generation;
  }, []);

  const canCommitRun = useCallback((generation: number, scopeKey: string) => {
    return (
      isMountedRef.current &&
      runGenerationRef.current === generation &&
      selectedScopeKeyRef.current === scopeKey
    );
  }, []);

  const availableScopes = useMemo(() => {
    if (!user?.id) {
      return [];
    }

    return buildAvailableScopes(
      user.id,
      user.displayName,
      projects,
    );
  }, [projects, user?.displayName, user?.id]);

  const resolvedSelectedScopeKey = useMemo(() => {
    if (!user?.id || availableScopes.length === 0) {
      return "";
    }

    return resolveScopeKey(selectedScopeKey, availableScopes, user.id);
  }, [availableScopes, selectedScopeKey, user?.id]);

  const selectedScope = useMemo(
    () => findScope(availableScopes, resolvedSelectedScopeKey),
    [availableScopes, resolvedSelectedScopeKey],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      refreshGenerationRef.current += 1;
      activityGenerationRef.current += 1;
      runGenerationRef.current += 1;
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
    };
  }, []);

  useEffect(() => {
    selectedScopeKeyRef.current = resolvedSelectedScopeKey;
  }, [resolvedSelectedScopeKey]);

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? jobs[0] ?? null,
    [jobs, selectedJobId],
  );
  const activeJobId = activeJob?.id ?? null;

  const selectedCredential = useMemo(
    () => credentials.find((credential) => credential.credentialRef === selectedCredentialRef) ?? null,
    [credentials, selectedCredentialRef],
  );

  const setupRequired = useMemo<JobsSetupRequired>(() => {
    if (
      resolvedSelectedScopeKey.startsWith("project:") &&
      selectedScope?.type !== "project"
    ) {
      return "project";
    }

    if (credentials.length === 0) {
      return "credential";
    }

    if (selectedScope?.type === "user" && !selectedUserSpaceId) {
      return "space";
    }

    return null;
  }, [credentials.length, resolvedSelectedScopeKey, selectedScope, selectedUserSpaceId]);

  const canCreateJob = Boolean(
    selectedScope &&
      selectedCredential &&
      (selectedScope.type === "project" || selectedUserSpaceId),
  );
  const canCancelActiveJob = activeJob?.status === "queued" || activeJob?.status === "running";

  const loadJobActivity = useCallback(async (jobId: string) => {
    const generation = activityGenerationRef.current + 1;
    activityGenerationRef.current = generation;

    try {
      const [nextEvents, nextAudits] = await Promise.all([
        apiClient.listJobEvents(jobId),
        apiClient.listJobAudits(jobId),
      ]);

      if (!canCommitActivity(generation)) {
        return;
      }

      setError((currentError) =>
        currentError === "Failed to load job activity." ? null : currentError,
      );
      setEvents((currentEvents) => mergeJobEvents(currentEvents, nextEvents));
      setAudits((currentAudits) => mergeJobAudits(currentAudits, nextAudits));
    } catch (presenterError) {
      if (!canCommitActivity(generation)) {
        return;
      }

      setEvents([]);
      setAudits([]);
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load job activity.",
      );
    }
  }, [canCommitActivity]);

  const refresh = useCallback(async (
    requestedScopeKey?: string,
    requestedJobId?: string | null,
  ) => {
    if (!user?.id) {
      return;
    }

    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;

    if (!isMountedRef.current) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const [nextSpaces, nextProjects, nextCredentials] = await Promise.all([
        apiClient.listSpaces(),
        apiClient.listProjects(),
        apiClient.listCredentials(),
      ]);

      if (!canCommitRefresh(generation)) {
        return;
      }

      setSpaces(nextSpaces);
      setProjects(nextProjects);
      setCredentials(nextCredentials);
      setSelectedUserSpaceIdState((currentSelectedUserSpaceId) =>
        resolveSelectedUserSpaceId(currentSelectedUserSpaceId, nextSpaces)
      );
      setSelectedCredentialRefState((currentCredentialRef) => {
        if (
          currentCredentialRef &&
          nextCredentials.some((credential) => credential.credentialRef === currentCredentialRef)
        ) {
          return currentCredentialRef;
        }

        return nextCredentials[0]?.credentialRef ?? "";
      });

      const nextAvailableScopes = buildAvailableScopes(
        user.id,
        user.displayName,
        nextProjects,
      );

      const nextScopeKey = resolveScopeKey(
        requestedScopeKey ?? selectedScopeKey,
        nextAvailableScopes,
        user.id,
      );
      const nextScope = findScope(nextAvailableScopes, nextScopeKey);
      selectedScopeKeyRef.current = nextScopeKey;
      setSelectedScopeKeyState(nextScopeKey);

      if (!nextScope) {
        setJobs([]);
        setSelectedJobIdState(null);
        persistJobsUrlSelection(nextScopeKey, null);
        setEvents([]);
        setAudits([]);
        return;
      }

      const nextJobs = sortJobs(
        await apiClient.listJobs(toListJobsInput(nextScope)),
      );

      if (!canCommitRefresh(generation)) {
        return;
      }

      setJobs(nextJobs);

      const selectedJobHint = requestedJobId === undefined
        ? selectedJobId
        : requestedJobId;
      const nextSelectedJobId = resolveSelectedJobId(nextJobs, selectedJobHint);
      setSelectedJobIdState(nextSelectedJobId);
      persistJobsUrlSelection(
        nextScopeKey,
        selectedJobHint && selectedJobHint === nextSelectedJobId
          ? nextSelectedJobId
          : null,
      );

      if (!nextSelectedJobId) {
        activityGenerationRef.current += 1;
        setEvents([]);
        setAudits([]);
        return;
      }
    } catch (presenterError) {
      if (!canCommitRefresh(generation)) {
        return;
      }

      setJobs([]);
      setSelectedJobIdState(null);
      persistJobsUrlSelection(selectedScopeKey, null);
      setEvents([]);
      setAudits([]);
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load jobs.",
      );
    } finally {
      if (canCommitRefresh(generation)) {
        setIsLoading(false);
      }
    }
  }, [canCommitRefresh, selectedJobId, selectedScopeKey, user?.displayName, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    void refresh();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || location.search === lastLocationSearchRef.current) {
      return;
    }

    lastLocationSearchRef.current = location.search;
    const requestedScopeKey = readRequestedScopeKey(location.search);
    const requestedJobId = readRequestedJobId(location.search);

    selectedScopeKeyRef.current = requestedScopeKey;
    setSelectedScopeKeyState(requestedScopeKey);
    setSelectedJobIdState(requestedJobId);
    setJobs([]);
    setEvents([]);
    setAudits([]);
    void refresh(requestedScopeKey, requestedJobId);
  }, [location.search, refresh, user?.id]);

  useEffect(() => {
    if (selectedScope?.type !== "user") {
      return;
    }

    setSelectedUserSpaceIdState((currentSelectedUserSpaceId) =>
      resolveSelectedUserSpaceId(currentSelectedUserSpaceId, spaces)
    );
  }, [selectedScope?.type, spaces]);

  useEffect(() => {
    subscriptionRef.current?.close();
    subscriptionRef.current = null;

    if (!activeJobId) {
      activityGenerationRef.current += 1;
      setEvents([]);
      setAudits([]);
      return;
    }

    setEvents([]);
    setAudits([]);
    void loadJobActivity(activeJobId);

    subscriptionRef.current = apiClient.subscribeToJobEvents(
      {
        jobId: activeJobId,
      },
      (event) => {
        if (!isMountedRef.current) {
          return;
        }

        setEvents((currentEvents) => {
          if (
            currentEvents.some((currentEvent) => currentEvent.id === event.id)
          ) {
            return currentEvents;
          }

          return [...currentEvents, event];
        });
        setJobs((currentJobs) =>
          currentJobs.map((job) =>
            job.id !== event.jobId
              ? job
              : job.status === event.status
                ? job
                : { ...job, status: event.status },
          ),
        );

        if (
          event.status === "succeeded" ||
          event.status === "failed" ||
          event.status === "cancelled"
        ) {
          void loadJobActivity(event.jobId);
        }
      },
      () => {
        if (!isMountedRef.current) {
          return;
        }

        setError("Live job stream disconnected. Refresh to recover.");
      },
    );

    return () => {
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
    };
  }, [activeJobId, loadJobActivity]);

  const setSelectedScopeKey = useCallback((nextScopeKey: string) => {
    selectedScopeKeyRef.current = nextScopeKey;
    setSelectedScopeKeyState(nextScopeKey);
    persistJobsUrlSelection(nextScopeKey, null);
    setSelectedJobIdState(null);
    setJobs([]);
    setEvents([]);
    setAudits([]);
    void refresh(nextScopeKey, null);
  }, [refresh]);

  const setSelectedJobId = useCallback((jobId: string) => {
    if (!jobs.some((job) => job.id === jobId)) {
      persistJobsUrlSelection(resolvedSelectedScopeKey, null);
      return;
    }

    setSelectedJobIdState(jobId);
    persistJobsUrlSelection(resolvedSelectedScopeKey, jobId);
  }, [jobs, resolvedSelectedScopeKey]);

  const setSelectedCredentialRef = useCallback((credentialRef: string) => {
    setSelectedCredentialRefState(credentialRef);
  }, []);

  const setSelectedUserSpaceId = useCallback((spaceId: string) => {
    setSelectedUserSpaceIdState(spaceId);
  }, []);

  const runSelectedJob = useCallback(async () => {
    if (!selectedScope) {
      setError("No job scope is available for this session.");
      return;
    }

    if (!selectedCredentialRef) {
      setError("Configure a credential in Settings before running a job.");
      return;
    }

    const compatibilitySpaceId = selectedScope.type === "project"
      ? selectedScope.spaceId
      : selectedUserSpaceId;
    const runScopeKey = resolvedSelectedScopeKey;
    const runGeneration = runGenerationRef.current + 1;
    runGenerationRef.current = runGeneration;

    if (!compatibilitySpaceId) {
      setError(
        "Personal jobs require a visible governance space before they can be created.",
      );
      return;
    }

    try {
      setIsRunningJob(true);
      setError(null);

      const createdJob = await apiClient.createJob({
        credentialRef: selectedCredentialRef,
        kind: "ai.summary",
        payload: {
          prompt: selectedScope.type === "project"
            ? `Summarize the latest work for ${selectedScope.label}.`
            : "Summarize the latest work in the current personal lane.",
        },
        scope: { id: selectedScope.id, type: selectedScope.type },
        spaceId: compatibilitySpaceId,
      });

      if (!canCommitRun(runGeneration, runScopeKey)) {
        return;
      }

      setJobs((currentJobs) =>
        sortJobs([createdJob, ...currentJobs.filter((job) => job.id !== createdJob.id)])
      );
      setSelectedJobIdState(createdJob.id);
      persistJobsUrlSelection(runScopeKey, createdJob.id);
      setEvents([]);
      setAudits([]);

      await apiClient.runJob(createdJob.id);

      if (!canCommitRun(runGeneration, runScopeKey)) {
        return;
      }

      await refresh(runScopeKey, createdJob.id);
    } catch (presenterError) {
      if (!canCommitRun(runGeneration, runScopeKey)) {
        return;
      }

      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to run job.",
      );
    } finally {
      if (isMountedRef.current && runGenerationRef.current === runGeneration) {
        setIsRunningJob(false);
      }
    }
  }, [canCommitRun, refresh, resolvedSelectedScopeKey, selectedCredentialRef, selectedScope, selectedUserSpaceId]);

  const cancelActiveJob = useCallback(async () => {
    if (!activeJob) {
      setError("No active job is selected for cancellation.");
      return;
    }

    if (!canCancelActiveJob) {
      setError("Only queued or running jobs can be cancelled.");
      return;
    }

    const cancelScopeKey = resolvedSelectedScopeKey;
    const runGeneration = runGenerationRef.current + 1;
    runGenerationRef.current = runGeneration;

    try {
      setIsRunningJob(true);
      setError(null);

      const cancelledJob = await apiClient.cancelJob(activeJob.id);

      if (!canCommitRun(runGeneration, cancelScopeKey)) {
        return;
      }

      setJobs((currentJobs) =>
        sortJobs(currentJobs.map((job) =>
          job.id === cancelledJob.id ? cancelledJob : job
        ))
      );
      setSelectedJobIdState(cancelledJob.id);
      persistJobsUrlSelection(cancelScopeKey, cancelledJob.id);
      await loadJobActivity(cancelledJob.id);
    } catch (presenterError) {
      if (!canCommitRun(runGeneration, cancelScopeKey)) {
        return;
      }

      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to cancel job.",
      );
    } finally {
      if (isMountedRef.current && runGenerationRef.current === runGeneration) {
        setIsRunningJob(false);
      }
    }
  }, [activeJob, canCancelActiveJob, canCommitRun, loadJobActivity, resolvedSelectedScopeKey]);

  return useMemo(
    () => ({
      activeJob,
      audits,
      availableScopes,
      cancelActiveJob,
      canCreateJob,
      canCancelActiveJob,
      credentials,
      error,
      events,
      isLoading,
      isRunningJob,
      jobs,
      projects,
      refresh,
      runSelectedJob,
      selectedCredentialRef,
      selectedJobId: activeJob?.id ?? selectedJobId,
      selectedScope,
      selectedScopeKey: resolvedSelectedScopeKey,
      selectedUserSpaceId,
      setSelectedCredentialRef,
      setSelectedJobId,
      setSelectedScopeKey,
      setSelectedUserSpaceId,
      setupRequired,
      spaces,
    }),
    [
      activeJob,
      audits,
      availableScopes,
      cancelActiveJob,
      canCreateJob,
      canCancelActiveJob,
      credentials,
      error,
      events,
      isLoading,
      isRunningJob,
      jobs,
      projects,
      refresh,
      resolvedSelectedScopeKey,
      runSelectedJob,
      selectedCredentialRef,
      selectedJobId,
      selectedScope,
      selectedUserSpaceId,
      setSelectedCredentialRef,
      setSelectedJobId,
      setSelectedScopeKey,
      setSelectedUserSpaceId,
      setupRequired,
      spaces,
    ],
  );
}
