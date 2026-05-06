import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CredentialRecord } from "@shared/contracts/credentials";
import type { JobEventRecord, JobRecord } from "@shared/contracts/jobs";
import type { SpaceSummary } from "@shared/contracts/spaces";

import { apiClient } from "../lib/http-client";
import { demoActorContext } from "./runtime-context";

export interface JobsViewModel {
  activeJob: JobRecord | null;
  actorSpaceId: string | null;
  credentials: CredentialRecord[];
  error: string | null;
  events: JobEventRecord[];
  isRunningSample: boolean;
  jobs: JobRecord[];
  refresh(): Promise<void>;
  runSampleJob(): Promise<void>;
  spaces: SpaceSummary[];
}

function sortJobs(jobs: JobRecord[]): JobRecord[] {
  return [...jobs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function useJobsPresenter(): JobsViewModel {
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [credentials, setCredentials] = useState<CredentialRecord[]>([]);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [events, setEvents] = useState<JobEventRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRunningSample, setIsRunningSample] = useState(false);
  const subscriptionRef = useRef<{ close(): void } | null>(null);

  const actorSpaceId = spaces[0]?.id ?? null;
  const activeJob = jobs[0] ?? null;

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const nextSpaces = await apiClient.listSpaces(
        demoActorContext.actorUserId,
      );
      const nextCredentials = await apiClient.listCredentials(
        demoActorContext.actorUserId,
      );
      setSpaces(nextSpaces);
      setCredentials(nextCredentials);

      if (!nextSpaces[0]) {
        setJobs([]);
        setEvents([]);
        return;
      }

      const nextJobs = sortJobs(
        await apiClient.listJobs(
          demoActorContext.actorUserId,
          nextSpaces[0].id,
        ),
      );
      setJobs(nextJobs);

      if (!nextJobs[0]) {
        setEvents([]);
        return;
      }

      setEvents(
        await apiClient.listJobEvents(
          demoActorContext.actorUserId,
          nextJobs[0].id,
        ),
      );
    } catch (presenterError) {
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load jobs.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    subscriptionRef.current?.close();

    if (!actorSpaceId || !activeJob) {
      return;
    }

    subscriptionRef.current = apiClient.subscribeToJobEvents(
      {
        actorUserId: demoActorContext.actorUserId,
        jobId: activeJob.id,
      },
      (event) => {
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
            job.id === event.jobId ? { ...job, status: event.status } : job,
          ),
        );
      },
      () => {
        setError("Live job stream disconnected. Refresh to recover.");
      },
    );

    return () => {
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
    };
  }, [activeJob, actorSpaceId]);

  const runSampleJob = useCallback(async () => {
    try {
      setIsRunningSample(true);
      setError(null);

      let nextSpaces = await apiClient.listSpaces(demoActorContext.actorUserId);
      if (nextSpaces.length === 0) {
        await apiClient.createSpace(demoActorContext.actorUserId, {
          kind: "shared",
          name: demoActorContext.defaultSharedSpaceName,
        });
        nextSpaces = await apiClient.listSpaces(demoActorContext.actorUserId);
      }

      const nextActorSpaceId = nextSpaces[0]?.id;
      if (!nextActorSpaceId) {
        throw new Error("No space is available for the sample job.");
      }

      let nextCredentials = await apiClient.listCredentials(
        demoActorContext.actorUserId,
      );
      if (nextCredentials.length === 0) {
        await apiClient.createCredential(demoActorContext.actorUserId, {
          provider: "openai",
          rawSecret: "local-demo-credential-placeholder",
        });
        nextCredentials = await apiClient.listCredentials(
          demoActorContext.actorUserId,
        );
      }

      const credential = nextCredentials[0];
      if (!credential) {
        throw new Error("No credential is available for the sample job.");
      }

      const createdJob = await apiClient.createJob(demoActorContext.actorUserId, {
        credentialRef: credential.credentialRef,
        kind: "ai.summary",
        payload: { prompt: "Summarize the current shared research lane." },
        spaceId: nextActorSpaceId,
      });

      setSpaces(nextSpaces);
      setCredentials(nextCredentials);
      setJobs((currentJobs) => sortJobs([createdJob, ...currentJobs]));
      setEvents([]);

      await apiClient.runJob(demoActorContext.actorUserId, createdJob.id);

      await refresh();
    } catch (presenterError) {
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to run sample job.",
      );
    } finally {
      setIsRunningSample(false);
    }
  }, [refresh]);

  return useMemo(
    () => ({
      activeJob,
      actorSpaceId,
      credentials,
      error,
      events,
      isRunningSample,
      jobs,
      refresh,
      runSampleJob,
      spaces,
    }),
    [
      activeJob,
      actorSpaceId,
      credentials,
      error,
      events,
      isRunningSample,
      jobs,
      refresh,
      runSampleJob,
      spaces,
    ],
  );
}
