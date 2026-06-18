import type { CreateProjectRequest, CreateProjectResponse, ProjectDTO } from "@jixia/shared";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { apiFetch } from "../../lib/api";
import { Button, EmptyState, Field, ListRow, Notice, Pane, Pill, SurfaceHeader, WorkbenchSurface } from "../layout/workbench";

type ProjectListPageProps = {
  readonly onOpenProject: (projectId: string) => void;
};

type ListProjectsResponse = {
  readonly projects: readonly ProjectDTO[];
};

export function ProjectListPage({ onOpenProject }: ProjectListPageProps) {
  const [projects, setProjects] = useState<readonly ProjectDTO[]>([]);
  const [projectName, setProjectName] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [createState, setCreateState] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  async function loadProjects(): Promise<void> {
    setLoadState("loading");
    setErrorMessage(null);

    try {
      const response = await apiFetch<ListProjectsResponse>("/projects");
      setProjects(response.projects);
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setErrorMessage(error instanceof Error ? error.message : "Unable to load projects.");
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateState("submitting");
    setCreateError(null);

    const payload: CreateProjectRequest = {
      name: projectName
    };

    try {
      const response = await apiFetch<CreateProjectResponse>("/projects", {
        method: "POST",
        json: payload
      });
      setProjects((currentProjects) => [
        response.project,
        ...currentProjects.filter((project) => project.id !== response.project.id)
      ]);
      setProjectName("");
      setCreateState("idle");
      onOpenProject(response.project.id);
    } catch (error) {
      setCreateState("error");
      setCreateError(error instanceof Error ? error.message : "Unable to create project.");
    }
  }

  return (
    <WorkbenchSurface aria-labelledby="projects-title" width="wide">
      <SurfaceHeader
        description="Project membership and visibility are returned by the API. Creating a project sends only user intent and relies on the server to create owner membership."
        eyebrow="Projects"
        title="Server-authorized research projects"
        titleId="projects-title"
      />

      <form className="jixia-toolbar" onSubmit={handleCreateProject}>
        <Field label="Project name" style={{ flex: "1 1 320px" }}>
          <input
            onChange={(event) => setProjectName(event.currentTarget.value)}
            placeholder="e.g. Protein engineering review"
            required
            type="text"
            value={projectName}
          />
        </Field>
        <Button disabled={createState === "submitting"} type="submit" variant="primary">
          {createState === "submitting" ? "Creating…" : "Create project"}
        </Button>
      </form>

      {createError ? (
        <Notice role="alert" tone="danger">
          {createError}
        </Notice>
      ) : null}

      <Pane
        actions={
          <>
            <Pill tone="accent">{projects.length} loaded</Pill>
            <Button onClick={loadProjects}>Refresh</Button>
          </>
        }
        aria-label="Project list"
        title="Available projects"
      >
        {loadState === "loading" ? <p className="jixia-description">Loading projects…</p> : null}
        {loadState === "error" && errorMessage ? (
          <Notice role="alert" tone="danger">
            {errorMessage}
          </Notice>
        ) : null}

        {loadState === "ready" && projects.length === 0 ? (
          <EmptyState
            description="Project records will appear here only after the API returns memberships visible to the current session."
            title="No projects returned by the API yet"
          />
        ) : null}

        {projects.length > 0 ? (
          <div className="jixia-list">
            {projects.map((project) => (
              <ListRow
                actions={<Pill>Project</Pill>}
                key={project.id}
                meta={`Updated ${formatDate(project.updatedAt)}`}
                onOpen={() => onOpenProject(project.id)}
                title={project.name}
              />
            ))}
          </div>
        ) : null}
      </Pane>
    </WorkbenchSurface>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
