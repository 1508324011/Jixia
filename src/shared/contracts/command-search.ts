export const commandSearchContract = "jixia-command-search-contract";

export type CommandSearchObjectKind =
  | "project"
  | "project-doc"
  | "library-entry"
  | "notebook"
  | "job";

export type CommandSearchMetadataValue = string | number | boolean | null;

export interface CommandSearchResultScope {
  id: string;
  projectId?: string;
  type: "user" | "project";
}

export interface CommandSearchResult {
  id: string;
  kind: CommandSearchObjectKind;
  metadata?: Record<string, CommandSearchMetadataValue>;
  route: string;
  scope: CommandSearchResultScope;
  subtitle?: string;
  title: string;
  updatedAt?: string;
}

export interface CommandSearchResponse {
  contract: typeof commandSearchContract;
  generatedAt: string;
  projectId?: string;
  query: string;
  results: CommandSearchResult[];
  totalCount: number;
}
