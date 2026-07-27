import type {
  CreateLiteratureImportRequest,
  CreateLiteratureImportResponse,
  ImportOperationDTO,
  LiteratureImportSeed,
  LiteratureImportWarningCode,
  LiteratureTargetScope,
  RetryLiteratureImportOperationResponse
} from "@jixia/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api";

const POLL_DELAY_MS = 300;

export type LiteratureImportState = {
  readonly canRetry: boolean;
  readonly error: string | null;
  readonly operation: ImportOperationDTO | null;
  readonly status: "idle" | "submitting" | "error";
};

type UseLiteratureImportOptions = {
  readonly onSucceeded: (
    literatureId: string,
    target: LiteratureTargetScope,
    warnings?: readonly LiteratureImportWarningCode[]
  ) => void;
  readonly messages: {
    readonly importUnavailable: string;
    readonly progressUnavailable: string;
    readonly retryUnavailable: string;
  };
};

type ImportIntent = {
  readonly key: string;
  readonly request: CreateLiteratureImportRequest;
};

function isSameImportRequest(left: CreateLiteratureImportRequest, right: CreateLiteratureImportRequest): boolean {
  if (left.seed.providerKey !== right.seed.providerKey || left.seed.recordKey !== right.seed.recordKey) return false;
  if (left.target.scope !== right.target.scope) return false;
  return left.target.scope === "personal"
    || (right.target.scope === "project" && left.target.projectId === right.target.projectId);
}

export function isLiteratureImportRetryable(operation: ImportOperationDTO, nowMs = Date.now()): boolean {
  switch (operation.status) {
    case "failed":
      return true;
    case "running":
      return Date.parse(operation.takeoverAfter) <= nowMs;
    case "succeeded":
      return false;
    default: {
      const unreachable: never = operation;
      throw unreachable;
    }
  }
}

export function useLiteratureImport({ messages, onSucceeded }: UseLiteratureImportOptions) {
  const [state, setState] = useState<LiteratureImportState>({ canRetry: false, error: null, operation: null, status: "idle" });
  const intentRef = useRef<ImportIntent | null>(null);
  const submissionControllerRef = useRef<AbortController | null>(null);
  const submissionVersionRef = useRef(0);
  const pollControllerRef = useRef<AbortController | null>(null);
  const pollVersionRef = useRef(0);

  const cancelPoll = useCallback((): void => {
    pollVersionRef.current += 1;
    pollControllerRef.current?.abort();
    pollControllerRef.current = null;
  }, []);

  const acceptOperation = useCallback((operation: ImportOperationDTO): void => {
    setState({ canRetry: isLiteratureImportRetryable(operation), error: null, operation, status: "idle" });
    if (operation.status !== "succeeded") return;
    const warnings = operation.warnings.length === 0 ? undefined : operation.warnings;
    switch (operation.scope.kind) {
      case "personal": {
        const target = { scope: "personal" } as const;
        if (warnings === undefined) onSucceeded(operation.literatureId, target);
        else onSucceeded(operation.literatureId, target, warnings);
        return;
      }
      case "project": {
        const target = { scope: "project", projectId: operation.scope.projectId } as const;
        if (warnings === undefined) onSucceeded(operation.literatureId, target);
        else onSucceeded(operation.literatureId, target, warnings);
        return;
      }
      default: {
        const unreachable: never = operation.scope;
        throw unreachable;
      }
    }
  }, [onSucceeded]);

  const start = useCallback(async (target: LiteratureTargetScope, seed: LiteratureImportSeed): Promise<void> => {
    const request: CreateLiteratureImportRequest = { seed, target };
    const existingIntent = intentRef.current;
    const intent = existingIntent && isSameImportRequest(existingIntent.request, request)
      ? existingIntent
      : { key: crypto.randomUUID(), request };
    intentRef.current = intent;

    cancelPoll();
    submissionControllerRef.current?.abort();
    const controller = new AbortController();
    const version = ++submissionVersionRef.current;
    submissionControllerRef.current = controller;
    setState({ canRetry: false, error: null, operation: null, status: "submitting" });
    try {
      const response = await apiFetch<CreateLiteratureImportResponse>("/literature/imports", {
        method: "POST",
        headers: { "Idempotency-Key": intent.key },
        json: intent.request,
        signal: controller.signal
      });
      if (version === submissionVersionRef.current) acceptOperation(response.operation);
    } catch (error) {
      if (controller.signal.aborted || version !== submissionVersionRef.current) return;
      setState({
        canRetry: false,
        error: error instanceof Error ? error.message : messages.importUnavailable,
        operation: null,
        status: "error"
      });
    } finally {
      if (version === submissionVersionRef.current) submissionControllerRef.current = null;
    }
  }, [acceptOperation, cancelPoll, messages.importUnavailable]);

  const retry = useCallback(async (): Promise<void> => {
    const operation = state.operation;
    if (operation === null || !isLiteratureImportRetryable(operation)) return;
    cancelPoll();
    submissionControllerRef.current?.abort();
    const controller = new AbortController();
    const version = ++submissionVersionRef.current;
    submissionControllerRef.current = controller;
    setState({ canRetry: false, error: null, operation, status: "submitting" });
    try {
      const response = await apiFetch<RetryLiteratureImportOperationResponse>(
        `/literature/imports/${encodeURIComponent(operation.id)}/retry`,
        { method: "POST", signal: controller.signal }
      );
      if (version === submissionVersionRef.current) acceptOperation(response.operation);
    } catch (error) {
      if (controller.signal.aborted || version !== submissionVersionRef.current) return;
      setState({
        canRetry: isLiteratureImportRetryable(operation),
        error: error instanceof Error ? error.message : messages.retryUnavailable,
        operation,
        status: "error"
      });
    } finally {
      if (version === submissionVersionRef.current) submissionControllerRef.current = null;
    }
  }, [acceptOperation, cancelPoll, messages.retryUnavailable, state.operation]);

  const reset = useCallback((): void => {
    submissionVersionRef.current += 1;
    submissionControllerRef.current?.abort();
    submissionControllerRef.current = null;
    cancelPoll();
    intentRef.current = null;
    setState({ canRetry: false, error: null, operation: null, status: "idle" });
  }, [cancelPoll]);

  useEffect(() => () => {
    submissionControllerRef.current?.abort();
    pollControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const operation = state.operation;
    if (operation?.status !== "running") return;
    pollControllerRef.current?.abort();
    const controller = new AbortController();
    const version = ++pollVersionRef.current;
    pollControllerRef.current = controller;
    let timer: number | null = null;
    let currentOperation = operation;

    const isCurrent = (): boolean =>
      !controller.signal.aborted
      && pollControllerRef.current === controller
      && pollVersionRef.current === version;

    const schedule = (): void => {
      if (!isCurrent()) return;
      const remainingLeaseMs = Date.parse(currentOperation.takeoverAfter) - Date.now();
      if (remainingLeaseMs <= 0) {
        setState((current) => current.operation?.id === currentOperation.id && !current.canRetry
          ? { ...current, canRetry: true }
          : current);
        return;
      }
      timer = window.setTimeout(() => void poll(), Math.min(POLL_DELAY_MS, remainingLeaseMs));
    };
    const poll = async (): Promise<void> => {
      if (isLiteratureImportRetryable(currentOperation)) {
        schedule();
        return;
      }
      try {
        const response = await apiFetch<{ readonly operation: ImportOperationDTO }>(
          `/literature/imports/${encodeURIComponent(operation.id)}`,
          { signal: controller.signal }
        );
        if (!isCurrent()) return;
        if (response.operation.status === "running") {
          currentOperation = response.operation;
          const canRetry = isLiteratureImportRetryable(currentOperation);
          setState({ canRetry, error: null, operation: currentOperation, status: "idle" });
          if (canRetry) return;
          schedule();
          return;
        }
        acceptOperation(response.operation);
      } catch (error) {
        if (!isCurrent()) return;
        setState((current) => current.operation?.id === operation.id
          ? {
              canRetry: isLiteratureImportRetryable(currentOperation),
              error: error instanceof Error ? error.message : messages.progressUnavailable,
              operation: current.operation,
              status: "error"
            }
          : current);
        schedule();
      }
    };
    schedule();

    return () => {
      controller.abort();
      if (pollControllerRef.current === controller) pollControllerRef.current = null;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [acceptOperation, messages.progressUnavailable, state.operation?.id, state.operation?.status, state.operation?.takeoverAfter]);

  return { reset, retry, start, state };
}
