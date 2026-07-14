import type {
  AIProviderConfigListResponse,
  AIProviderConfigView,
  DocumentDTO,
  DocumentRevisionDTO,
  EditorSnapshot,
  AIUsageAggregateResponse,
  ListDocumentsResponse,
  ListAIConversationsResponse,
  LoginResponse
} from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

vi.mock("../features/documents/DocumentCopilotPanel", () => ({
  DocumentCopilotPanel: () => <section aria-label="Mock document copilot panel">Document copilot panel</section>
}));

describe("App", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      })),
      writable: true
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
    document.documentElement.lang = "en";
  });

  it("replaces auth URLs with the workspace URL after login", async () => {
    window.history.replaceState(null, "", "/login");
    const loginResponse: LoginResponse = {
      currentSession: {
        user: {
          id: "user-1",
          email: "researcher@example.test",
          displayName: "Researcher",
          space: { id: "space-1", name: "Jixia Lab", role: "SpaceMember" },
          projectMemberships: []
        },
        expiresAt: "2026-06-22T12:00:00.000Z"
      }
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(loginResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    render(<App />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "researcher@example.test" }
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "correct horse battery staple" }
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(window.location.pathname).toBe("/workspace"));
    expect(screen.getByText("Researcher")).toBeTruthy();
  });

  it("owns locale state above login and synchronizes the document language", () => {
    window.history.replaceState(null, "", "/login");

    render(<App />);

    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } });

    expect(document.documentElement.lang).toBe("zh-CN");
    expect(screen.getByRole("heading", { name: "继续推进你的研究。" })).toBeTruthy();
    expect(screen.getByLabelText("邮箱")).toBeTruthy();
  });

  it("synchronizes rendered routes when browser history changes", async () => {
    window.history.replaceState(null, "", "/home");

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /^Search$/ }));
    expect(window.location.pathname).toBe("/search");
    expect(screen.getByRole("heading", { name: "Search is being prepared for literature discovery." })).toBeTruthy();

    window.history.back();

    await waitFor(() => expect(window.location.pathname).toBe("/home"));
    expect(screen.getByRole("heading", { name: "Home is being prepared for your research day." })).toBeTruthy();
  });

  it("localizes deferred and account settings surfaces", () => {
    window.history.replaceState(null, "", "/home");

    const { unmount } = render(<App />);
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } });

    expect(screen.getByRole("heading", { name: "首页正在为你的研究日程做准备。" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "打开项目" })).toBeTruthy();

    unmount();
    window.history.replaceState(null, "", "/settings/account");
    render(<App />);
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "zh-CN" } });

    expect(screen.getByRole("heading", { level: 1, name: "设置" })).toBeTruthy();
    expect(screen.getByText("下方显示你当前的个人资料和研究空间信息。")).toBeTruthy();
    expect(screen.getAllByText("暂不可用")).toHaveLength(3);
  });

  it("opens the standalone AI workspace without document context", async () => {
    window.history.replaceState(null, "", "/ai");
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ configs: [providerConfig] } satisfies AIProviderConfigListResponse))
      .mockResolvedValueOnce(jsonResponse({ conversations: [] } satisfies ListAIConversationsResponse));
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("Start a private chat thread")).toBeTruthy();
    expect(screen.getAllByText("No automatic document context").length).toBeGreaterThan(0);
    expect(screen.queryByText(/current document body/i)).toBeNull();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/ai/configs", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/ai/conversations", expect.objectContaining({ credentials: "include" }));
  });

  it("opens account settings without mounting the AI provider editor", () => {
      window.history.replaceState(null, "", "/settings/account");
      const fetchMock = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetchMock);

      render(<App />);

      expect(screen.getByText("Your current profile and research space details appear below.")).toBeTruthy();
      expect(screen.queryByRole("navigation", { name: /Settings sections/i })).toBeNull();
      expect(screen.queryByText("Review and save provider")).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

  it("opens AI settings as its own detail surface", async () => {
      window.history.replaceState(null, "", "/settings/ai");
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
        jsonResponse({ configs: [providerConfig] } satisfies AIProviderConfigListResponse)
      );
      vi.stubGlobal("fetch", fetchMock);

      render(<App />);

      expect(await screen.findByText("Lab OpenAI")).toBeTruthy();
      expect(screen.getByText("Review and save provider")).toBeTruthy();
      expect(screen.queryByRole("navigation", { name: /Settings sections/i })).toBeNull();
      expect(screen.queryByText("Your current profile and research space details appear below.")).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith("/api/ai/configs", expect.objectContaining({ credentials: "include" }));
    });

  it("renders /notebook as a real document-backed surface", async () => {
    window.history.replaceState(null, "", "/notebook");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({ documents: [notebookDocument] } satisfies ListDocumentsResponse)
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByText("Notebook documents are returned by the API for the current owner only. Creating a note sends notebook-scoped intent to the same document service used by Project Docs.")).toBeTruthy();
    expect(await screen.findByText("Notebook draft")).toBeTruthy();
    expect(screen.queryByText("This workspace is still taking shape")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/notebook",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("opens notebook documents with the shared document editor", async () => {
    window.history.replaceState(null, "", "/notebook/documents/notebook-doc-1");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        document: notebookDocument,
        revision: notebookRevision,
        currentSnapshot: notebookSnapshot
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByDisplayValue("Notebook draft")).toBeTruthy();
    expect(screen.getByText("Draft autosave ready.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Notebook" }).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents/notebook-doc-1",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("switches from account settings to AI provider settings", async () => {
      window.history.replaceState(null, "", "/settings/account");
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
        jsonResponse({ configs: [] } satisfies AIProviderConfigListResponse)
      );
      vi.stubGlobal("fetch", fetchMock);

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /AI connections/i }));

      expect(window.location.pathname).toBe("/settings/ai");
      expect(await screen.findByText("No providers configured yet")).toBeTruthy();
      expect(screen.queryByRole("navigation", { name: /Settings sections/i })).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith("/api/ai/configs", expect.objectContaining({ credentials: "include" }));
    });

    it("opens AI usage from the Settings Context sidebar", async () => {
      window.history.replaceState(null, "", "/settings/account");
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
        jsonResponse({
          usage: {
            scope: "user",
            userId: "user-1",
            periodStart: "2026-06-01T00:00:00.000Z",
            periodEnd: "2026-06-18T00:00:00.000Z",
            metrics: []
          }
        } satisfies AIUsageAggregateResponse)
      );
      vi.stubGlobal("fetch", fetchMock);

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: /Usage/i }));

      expect(window.location.pathname).toBe("/settings/ai/usage");
      expect(screen.getByText("AI usage summaries without sensitive call details.")).toBeTruthy();
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringMatching(/^\/api\/ai\/usage\/me\?/),
          expect.objectContaining({ credentials: "include" })
        )
      );
    });
});

const providerConfig: AIProviderConfigView = {
  id: "config-1",
  ownerUserId: "user-1",
  name: "Lab OpenAI",
  provider: "openai",
  baseURL: "https://api.openai.com/v1",
  hasKey: true,
  isDefault: true,
  modelProfiles: [
    {
      id: "model-profile-1",
      providerConfigId: "config-1",
      model: "gpt-4o-mini",
      displayName: "GPT-4o mini",
      temperature: 0.2,
      maxTokens: 4096,
      enabled: true,
      isDefault: true,
      createdAt: "2026-06-16T10:00:00.000Z",
      updatedAt: "2026-06-16T10:00:00.000Z"
    }
  ],
  createdAt: "2026-06-16T10:00:00.000Z",
  updatedAt: "2026-06-16T10:00:00.000Z"
};

const notebookDocument: DocumentDTO = {
  id: "notebook-doc-1",
  type: "notebook",
  status: "active",
  title: "Notebook draft",
  ownerUserId: "user-1",
  projectId: null,
  currentRevisionId: "notebook-revision-1",
  revisionNumber: 1,
  createdAt: "2026-06-18T09:00:00.000Z",
  updatedAt: "2026-06-18T09:05:00.000Z"
};

const notebookSnapshot: EditorSnapshot = {
  editorSchemaVersion: 1,
  blocks: [{ id: "paragraph-1", type: "paragraph", text: "Notebook body" }]
};

const notebookRevision: DocumentRevisionDTO = {
  id: "notebook-revision-1",
  documentId: "notebook-doc-1",
  revisionNumber: 1,
  contentSnapshot: notebookSnapshot,
  editorUserId: "user-1",
  createdAt: "2026-06-18T09:05:00.000Z"
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
