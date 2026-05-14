export type GuardedJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export const TERMINAL_JOB_STATUSES = new Set<GuardedJobStatus>([
  'succeeded',
  'failed',
  'cancelled',
]);

const ALLOWED_JOB_STATUS_TRANSITIONS: Record<
  GuardedJobStatus,
  ReadonlySet<GuardedJobStatus>
> = {
  cancelled: new Set(),
  failed: new Set(),
  queued: new Set(['running', 'cancelled']),
  running: new Set(['succeeded', 'failed', 'cancelled']),
  succeeded: new Set(),
};

export function isTerminalJobStatus(status: GuardedJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

export function canTransitionJobStatus(
  currentStatus: GuardedJobStatus,
  nextStatus: GuardedJobStatus,
): boolean {
  return ALLOWED_JOB_STATUS_TRANSITIONS[currentStatus].has(nextStatus);
}

export function assertJobStatusTransition(
  currentStatus: GuardedJobStatus,
  nextStatus: GuardedJobStatus,
): void {
  if (canTransitionJobStatus(currentStatus, nextStatus)) {
    return;
  }

  if (currentStatus === nextStatus) {
    throw new Error(`Job is already ${currentStatus}.`);
  }

  if (isTerminalJobStatus(currentStatus)) {
    throw new Error(
      `Invalid job status transition from terminal state ${currentStatus} to ${nextStatus}.`,
    );
  }

  throw new Error(
    `Invalid job status transition from ${currentStatus} to ${nextStatus}.`,
  );
}
