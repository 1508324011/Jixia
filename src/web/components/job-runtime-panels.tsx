import type {
  JobAuditRecord,
  JobEventRecord,
  JobRecord,
} from "@shared/contracts/jobs";

interface GovernedJobListPanelProps {
  emptyCopy: string;
  idLabel: string;
  jobs: JobRecord[];
  selectedCredentialRef: string | null;
  selectedJobId: string | null;
  selectedCredentialLabel: string;
  setSelectedJobId(jobId: string): void;
  title: string;
  children?: React.ReactNode;
}

interface JobLifecyclePanelProps {
  activeDescription?: string;
  activeJob: JobRecord | null;
  activeJobLabel: string;
  audits: JobAuditRecord[];
  auditEmptyCopy: string;
  children?: React.ReactNode;
  emptyCopy: string;
  events: JobEventRecord[];
  eventEmptyCopy: string;
  title: string;
}

export function GovernedJobListPanel({
  children,
  emptyCopy,
  idLabel,
  jobs,
  selectedCredentialLabel,
  selectedCredentialRef,
  selectedJobId,
  setSelectedJobId,
  title,
}: GovernedJobListPanelProps) {
  return (
    <article className="panel">
      <h2 className="panel-title">{title}</h2>
      <p className="quiet-copy">
        {selectedCredentialLabel} · {selectedCredentialRef ?? "No credential selected"}
      </p>
      {children}
      {jobs.length === 0 ? (
        <p className="quiet-copy">{emptyCopy}</p>
      ) : (
        <div className="shell-grid">
          {jobs.map((job) => (
            <button
              key={job.id}
              className="hero-card"
              type="button"
              aria-pressed={job.id === selectedJobId}
              onClick={() => setSelectedJobId(job.id)}
            >
              <h3 className="panel-title">{job.kind}</h3>
              <p className="quiet-copy">{idLabel} · {job.id}</p>
              <p className="quiet-copy">
                Scope · {job.scope.type} / {job.scope.id}
              </p>
              <p className="quiet-copy">Credential · {job.credentialRef}</p>
              <p className="quiet-copy">Created · {job.createdAt}</p>
              <span className="status-badge">{job.status}</span>
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

export function JobLifecyclePanel({
  activeDescription,
  activeJob,
  activeJobLabel,
  audits,
  auditEmptyCopy,
  children,
  emptyCopy,
  events,
  eventEmptyCopy,
  title,
}: JobLifecyclePanelProps) {
  return (
    <article className="panel">
      <h2 className="panel-title">{title}</h2>
      {activeJob ? (
        <>
          <p className="quiet-copy">{activeJobLabel} · {activeJob.id}</p>
          <p className="quiet-copy">
            Scope · {activeJob.scope.type} / {activeJob.scope.id}
          </p>
          {activeDescription ? (
            <p className="quiet-copy">{activeDescription}</p>
          ) : null}
          {children}
          <div className="shell-grid">
            {events.length === 0 ? (
              <p className="quiet-copy">{eventEmptyCopy}</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="hero-card">
                  <h3 className="panel-title">{event.status}</h3>
                  <p className="quiet-copy">{event.message}</p>
                  <p className="quiet-copy">{event.recordedAt}</p>
                </div>
              ))
            )}
          </div>
          <h3 className="panel-title">Audit trail</h3>
          <div className="shell-grid">
            {audits.length === 0 ? (
              <p className="quiet-copy">{auditEmptyCopy}</p>
            ) : (
              audits.map((audit) => (
                <div key={audit.id} className="hero-card">
                  <h4 className="panel-title">{audit.action}</h4>
                  <p className="quiet-copy">Actor · {audit.actorUserId}</p>
                  <p className="quiet-copy">{audit.detail}</p>
                  <p className="quiet-copy">{audit.recordedAt}</p>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <p className="quiet-copy">{emptyCopy}</p>
      )}
    </article>
  );
}
