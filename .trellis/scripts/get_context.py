#!/usr/bin/env python3
"""Print Trellis session context for the current repository."""

from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Literal, cast


logger = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[2]
TRELLIS_DIR = ROOT / ".trellis"


class ContextArgs(argparse.Namespace):
    mode: Literal["default", "packages"] = "default"


def run_git(args: list[str]) -> str:
    """Run a git command and return trimmed output."""

    try:
        result = subprocess.run(
            ["git", *args],
            cwd=ROOT,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError:
        return "git unavailable"
    return result.stdout.strip() or result.stderr.strip()


def read_developer() -> str:
    """Read local developer identity."""

    developer_file = TRELLIS_DIR / ".developer"
    if developer_file.exists():
        return developer_file.read_text(encoding="utf-8").strip() or "unknown"
    return os.environ.get("USER", "unknown")


def read_current_task() -> str:
    """Read the active Trellis task pointer."""

    current_task_file = TRELLIS_DIR / ".current-task"
    if not current_task_file.exists():
        return "none"
    return current_task_file.read_text(encoding="utf-8").strip() or "none"


def load_tasks() -> list[dict[str, str]]:
    """Load task metadata files."""

    tasks: list[dict[str, str]] = []
    tasks_dir = TRELLIS_DIR / "tasks"
    for task_file in sorted(tasks_dir.glob("*/task.json")):
        try:
            payload = cast(dict[str, object], json.loads(task_file.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            continue
        tasks.append(
            {
                "path": str(task_file.parent.relative_to(ROOT)),
                "title": str(payload.get("title", "untitled")),
                "status": str(payload.get("status", "unknown")),
                "type": str(payload.get("type", "unknown")),
            }
        )
    return tasks


def print_default_context() -> None:
    """Print repository and Trellis state."""

    # ========================================================================
    # 步骤1：读取会话基础状态
    # ========================================================================
    # 目标：输出当前开发者、分支、工作树和任务状态。
    # 数据源：.trellis 本地文件、git status、task.json。
    logger.info("开始读取 Trellis 会话状态")

    # 1.1 读取身份和 Git 信息
    print("# Trellis Context")
    print(f"Developer: {read_developer()}")
    print(f"Branch: {run_git(['branch', '--show-current']) or 'unknown'}")
    print("\n## Git Status")
    status = run_git(["status", "--short"])
    print(status or "clean")

    # 1.2 读取当前任务和任务列表
    print("\n## Current Task")
    print(read_current_task())
    print("\n## Tasks")
    tasks = load_tasks()
    if not tasks:
        print("none")
    for task in tasks:
        print(f"- {task['path']} [{task['status']}] {task['title']} ({task['type']})")
    logger.info("完成读取 Trellis 会话状态")


def print_packages_context() -> None:
    """Print available spec packages and indexes."""

    # ========================================================================
    # 步骤1：读取代码规范索引
    # ========================================================================
    # 目标：列出可注入的 spec 包和索引文件。
    # 数据源：.trellis/spec 下的 index.md 文件。
    logger.info("开始读取 Trellis spec 索引")

    # 1.1 遍历 spec 目录
    print("# Trellis Spec Packages")
    spec_dir = TRELLIS_DIR / "spec"
    if not spec_dir.exists():
        print("none")
        logger.info("完成读取 Trellis spec 索引")
        return
    for index_file in sorted(spec_dir.glob("*/index.md")):
        package = index_file.parent.name
        print(f"\n## {package}")
        print(str(index_file.relative_to(ROOT)))
        for guideline in sorted(index_file.parent.glob("*.md")):
            if guideline.name == "index.md":
                continue
            print(f"- {guideline.relative_to(ROOT)}")
    logger.info("完成读取 Trellis spec 索引")


def main() -> None:
    """Parse arguments and print requested context."""

    parser = argparse.ArgumentParser(description="Print Trellis context")
    _ = parser.add_argument("--mode", choices=["default", "packages"], default="default")
    args = parser.parse_args(namespace=ContextArgs())

    if args.mode == "packages":
        print_packages_context()
        return
    print_default_context()


if __name__ == "__main__":
    main()
