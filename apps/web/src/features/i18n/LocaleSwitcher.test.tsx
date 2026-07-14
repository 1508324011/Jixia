import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocaleSwitcher } from "./LocaleSwitcher";

describe("LocaleSwitcher", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses an accessible select and reports the selected supported locale", () => {
    const onLocaleChange = vi.fn();
    render(<LocaleSwitcher locale="en" onLocaleChange={onLocaleChange} />);

    const select = screen.getByLabelText("Language") as HTMLSelectElement;
    expect(select.value).toBe("en");
    expect(screen.getByRole("option", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Simplified Chinese" })).toBeTruthy();

    fireEvent.change(select, { target: { value: "zh-CN" } });

    expect(onLocaleChange).toHaveBeenCalledWith("zh-CN");
  });

  it("renders Chinese chrome when Chinese is active", () => {
    render(<LocaleSwitcher locale="zh-CN" onLocaleChange={vi.fn()} />);

    expect(screen.getByLabelText("语言")).toBeTruthy();
    expect(screen.getByRole("option", { name: "简体中文" })).toBeTruthy();
  });

  it("uses short bilingual option labels in compact navigation", () => {
    render(<LocaleSwitcher compact locale="en" onLocaleChange={vi.fn()} />);

    const select = screen.getByLabelText("Language");
    expect(select.getAttribute("title")).toBe("English");
    expect(screen.getByRole("option", { name: "EN" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "中文" })).toBeTruthy();
  });
});
