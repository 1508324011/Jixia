export interface AiWorkspaceAttachmentView {
  canonicalId: string;
  entryId: string;
  paperAssetId: string;
  title: string;
}

export interface AiWorkspaceSessionView {
  attachedEntries: AiWorkspaceAttachmentView[];
  createdAt: string;
  id: string;
  summary: string;
  title: string;
  updatedAt: string;
}

export interface AiWorkspaceView {
  activeSessionId: string | null;
  sessions: AiWorkspaceSessionView[];
}

export interface AiWorkspaceResponse {
  workspace: AiWorkspaceView;
}

export const aiWorkspaceContract = 'jixia-ai-workspace-contract';
