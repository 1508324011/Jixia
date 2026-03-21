export interface JobLookup {
  jobId: string;
}

export interface PersistedJobRecord {
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  credentialRef: string;
  createdAt: string;
}

export interface PersistedJobEventRecord {
  id: string;
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  message: string;
  recordedAt: string;
}

export interface JobRepository {
  getJob(query: JobLookup): Promise<PersistedJobRecord | null>;
  listJobEvents(jobId: string): Promise<PersistedJobEventRecord[]>;
}

export function createJobRepository(): JobRepository {
  return {
    async getJob(): Promise<PersistedJobRecord | null> {
      throw new Error('JobRepository.getJob is not implemented yet.');
    },
    async listJobEvents(): Promise<PersistedJobEventRecord[]> {
      throw new Error('JobRepository.listJobEvents is not implemented yet.');
    },
  };
}
