import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";

describe("AppShell", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("exposes every primary workbench surface through named navigation controls", () => {
    const onNavigate = vi.fn();
    render(
      <AppShell activeSurface="projects" locale="en" onLocaleChange={vi.fn()} onNavigate={onNavigate}>
        <p>Workspace content</p>
      </AppShell>
    );

    const navigation = screen.getByRole("navigation", { name: "Workbench navigation" });
    expect(within(navigation).getByRole("button", { name: "Home" })).toBeTruthy();
    expect(within(navigation).getByRole("button", { name: "Search" })).toBeTruthy();
    expect(within(navigation).getByRole("button", { name: "Library" })).toBeTruthy();
    expect(within(navigation).getByRole("button", { name: "Projects" }).getAttribute("aria-current")).toBe("page");
    expect(within(navigation).getByRole("button", { name: "Notebook" })).toBeTruthy();
    expect(within(navigation).getByRole("button", { name: "AI" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(navigation.querySelectorAll("svg[aria-hidden='true']")).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("localizes navigation and retains an accessible compact language control", () => {
    const onLocaleChange = vi.fn();
    render(
      <AppShell activeSurface="notebook" locale="zh-CN" onLocaleChange={onLocaleChange} onNavigate={vi.fn()}>
        <p>工作台内容</p>
      </AppShell>
    );

    const navigation = screen.getByRole("navigation", { name: "工作台导航" });
    expect(within(navigation).getByRole("button", { name: "首页" })).toBeTruthy();
    expect(within(navigation).getByRole("button", { name: "笔记本" }).getAttribute("aria-current")).toBe("page");

    fireEvent.change(screen.getByLabelText("语言"), { target: { value: "en" } });

    expect(onLocaleChange).toHaveBeenCalledWith("en");
  });
});
