import { useCallback, useEffect, useMemo, useState } from "react";

import type { SpaceKind, SpaceSummary } from "@shared/contracts/spaces";

import { apiClient } from "../lib/http-client";
import { demoActorContext } from "./runtime-context";

interface SpaceCardView {
  membershipCount: number;
  summary: SpaceSummary;
}

export interface SpacesViewModel {
  createSpace(kind: SpaceKind): Promise<void>;
  error: string | null;
  isCreating: boolean;
  refresh(): Promise<void>;
  spaces: SpaceCardView[];
}

export function useSpacesPresenter(): SpacesViewModel {
  const [spaces, setSpaces] = useState<SpaceCardView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const nextSpaces = await apiClient.listSpaces(
        demoActorContext.actorUserId,
      );

      const nextCards = await Promise.all(
        nextSpaces.map(async (space) => {
          const memberships = await apiClient.listMemberships(space.id);
          return {
            membershipCount: memberships.length,
            summary: space,
          } satisfies SpaceCardView;
        }),
      );

      setSpaces(nextCards);
    } catch (presenterError) {
      setSpaces([]);
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load spaces.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createSpace = useCallback(
    async (kind: SpaceKind) => {
      try {
        setIsCreating(true);
        setError(null);
        await apiClient.createSpace(demoActorContext.actorUserId, {
          kind,
          name:
            kind === "shared"
              ? `Shared Space ${Date.now().toString().slice(-4)}`
              : `Personal Space ${Date.now().toString().slice(-4)}`,
        });
        await refresh();
      } catch (presenterError) {
        setError(
          presenterError instanceof Error
            ? presenterError.message
            : "Failed to create space.",
        );
      } finally {
        setIsCreating(false);
      }
    },
    [refresh],
  );

  return useMemo(
    () => ({
      createSpace,
      error,
      isCreating,
      refresh,
      spaces,
    }),
    [createSpace, error, isCreating, refresh, spaces],
  );
}
