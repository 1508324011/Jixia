#!/usr/bin/env python3
"""Manage Trellis task directories."""

from __future__ import annotations

import argparse
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Protocol, cast


logger = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[2]
TRELLIS_DIR = ROOT / ".trellis"
TASKS_DIR = TRELLIS_DIR / "tasks"

TaskKind = Literal["backend", "frontend", "fullstack", "planning"]
ContextKind = Literal["backend", "frontend", "fullstack"]
ContextPhase = Literal["implement", "check", "debug"]
CommandName = Literal["create", "init-context", "add-context", "start", "finish", "list"]


class CreateArgs(Protocol):
    title: str
    slug: str | None
    type: TaskKind


class InitContextArgs(Protocol):
    task_dir: str
    type: ContextKind


class AddContextArgs(Protocol):
    task_dir: str
    phase: ContextPhase
    path: str
    reason: str


class TaskDirArgs(Protocol):
    task_dir: str


class ListArgs(Protocol):
    pass


class ParsedArgs(argparse.Namespace):
    command: CommandName = "list"


def slugify(value: str) -> str:
    """Convert text to a filesystem-safe slug."""

    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "task"


def now_iso() -> str:
    """Return a UTC timestamp."""

    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def write_json(path: Path, payload: dict[str, object]) -> None:
    """Write formatted JSON."""

    _ = path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_task(task_dir: Path) -> dict[str, object]:
    """Load task metadata."""

    task_file = task_dir / "task.json"
    return cast(dict[str, object], json.loads(task_file.read_text(encoding="utf-8")))


def save_task(task_dir: Path, payload: dict[str, object]) -> None:
    """Save task metadata."""

    payload["updatedAt"] = now_iso()
    write_json(task_dir / "task.json", payload)


def resolve_task_dir(raw_path: str) -> Path:
    """Resolve a task path from absolute or repo-relative input."""

    path = Path(raw_path)
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


def create_task(args: CreateArgs) -> None:
    """Create a Trellis task directory."""

    # ========================================================================
    # 步骤1：创建任务目录
    # ========================================================================
    # 目标：为一次开发工作建立可追踪目录。
    # 数据源：命令行 title、slug、type。
    # 操作要点：写入 task.json 和 prd.md，输出任务路径供 shell 捕获。
    logger.info("开始创建 Trellis 任务")

    # 1.1 生成目录名
    slug = slugify(args.slug or args.title)
    prefix = datetime.now().strftime("%m-%d")
    task_dir = TASKS_DIR / f"{prefix}-{slug}"
    task_dir.mkdir(parents=True, exist_ok=False)

    # 1.2 写入任务元数据
    payload: dict[str, object] = {
        "title": args.title,
        "slug": slug,
        "type": args.type,
        "status": "created",
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    write_json(task_dir / "task.json", payload)

    # 1.3 写入 PRD 模板
    prd = f"""# {args.title}

## Goal

To be filled by the team.

## Requirements

- To be filled by the team.

## Acceptance Criteria

- [ ] To be filled by the team.

## Technical Notes

To be filled by the team.
"""
    _ = (task_dir / "prd.md").write_text(prd, encoding="utf-8")
    print(task_dir.relative_to(ROOT))
    logger.info("完成创建 Trellis 任务")


def init_context(args: InitContextArgs) -> None:
    """Initialize task context JSONL files."""

    # ========================================================================
    # 步骤1：初始化任务上下文
    # ========================================================================
    # 目标：为 implement/check/debug 三类动作创建上下文清单。
    # 数据源：任务类型和默认 spec 索引。
    logger.info("开始初始化 Trellis 任务上下文")

    # 1.1 创建 context 目录
    task_dir = resolve_task_dir(args.task_dir)
    context_dir = task_dir / "context"
    context_dir.mkdir(parents=True, exist_ok=True)

    # 1.2 选择默认 spec 文件
    default_paths = [".trellis/spec/guides/index.md"]
    if args.type in {"backend", "fullstack"}:
        default_paths.append(".trellis/spec/backend/index.md")
    if args.type in {"frontend", "fullstack"}:
        default_paths.append(".trellis/spec/frontend/index.md")

    # 1.3 写入 JSONL 文件
    for phase in ["implement", "check", "debug"]:
        target = context_dir / f"{phase}.jsonl"
        rows = [
            json.dumps({"path": path, "reason": f"Default {args.type} Trellis guidance"}, ensure_ascii=False)
            for path in default_paths
        ]
        _ = target.write_text("\n".join(rows) + "\n", encoding="utf-8")

    # 1.4 更新任务元数据
    payload = load_task(task_dir)
    payload["type"] = args.type
    payload["status"] = "context-ready"
    save_task(task_dir, payload)
    logger.info("完成初始化 Trellis 任务上下文")


def add_context(args: AddContextArgs) -> None:
    """Add one context entry to a task phase."""

    # ========================================================================
    # 步骤1：追加上下文条目
    # ========================================================================
    # 目标：把特定规范或代码路径加入某个任务阶段。
    # 数据源：phase、path、reason 参数。
    logger.info("开始追加 Trellis 上下文条目")

    # 1.1 定位 JSONL 文件
    task_dir = resolve_task_dir(args.task_dir)
    context_dir = task_dir / "context"
    context_dir.mkdir(parents=True, exist_ok=True)
    target = context_dir / f"{args.phase}.jsonl"

    # 1.2 追加记录
    row = json.dumps({"path": args.path, "reason": args.reason}, ensure_ascii=False)
    with target.open("a", encoding="utf-8") as file:
        _ = file.write(row + "\n")
    logger.info("完成追加 Trellis 上下文条目")


def start_task(args: TaskDirArgs) -> None:
    """Mark a task as active."""

    # ========================================================================
    # 步骤1：激活任务
    # ========================================================================
    # 目标：设置 .current-task，供后续会话读取。
    # 数据源：任务目录路径。
    logger.info("开始激活 Trellis 任务")

    # 1.1 写入当前任务指针
    task_dir = resolve_task_dir(args.task_dir)
    relative = task_dir.relative_to(ROOT)
    _ = (TRELLIS_DIR / ".current-task").write_text(str(relative) + "\n", encoding="utf-8")

    # 1.2 更新任务状态
    payload = load_task(task_dir)
    payload["status"] = "active"
    save_task(task_dir, payload)
    logger.info("完成激活 Trellis 任务")


def finish_task(args: TaskDirArgs) -> None:
    """Mark a task as finished and clear active pointer if needed."""

    # ========================================================================
    # 步骤1：完成任务
    # ========================================================================
    # 目标：更新任务状态并清理当前任务指针。
    # 数据源：任务目录路径。
    logger.info("开始完成 Trellis 任务")

    # 1.1 更新任务状态
    task_dir = resolve_task_dir(args.task_dir)
    payload = load_task(task_dir)
    payload["status"] = "finished"
    save_task(task_dir, payload)

    # 1.2 清理当前任务指针
    current_task_file = TRELLIS_DIR / ".current-task"
    if current_task_file.exists() and current_task_file.read_text(encoding="utf-8").strip() == str(task_dir.relative_to(ROOT)):
        current_task_file.unlink()
    logger.info("完成 Trellis 任务")


def list_tasks(_: ListArgs) -> None:
    """List Trellis tasks."""

    # ========================================================================
    # 步骤1：列出任务
    # ========================================================================
    # 目标：输出所有 task.json 摘要。
    # 数据源：.trellis/tasks/*/task.json。
    logger.info("开始列出 Trellis 任务")

    # 1.1 读取并输出任务
    for task_file in sorted(TASKS_DIR.glob("*/task.json")):
        payload = cast(dict[str, object], json.loads(task_file.read_text(encoding="utf-8")))
        print(f"{task_file.parent.relative_to(ROOT)} [{payload.get('status')}] {payload.get('title')}")
    logger.info("完成列出 Trellis 任务")


def build_parser() -> argparse.ArgumentParser:
    """Build command-line parser."""

    parser = argparse.ArgumentParser(description="Manage Trellis tasks")
    subparsers = parser.add_subparsers(dest="command", required=True)

    create = subparsers.add_parser("create")
    _ = create.add_argument("title")
    _ = create.add_argument("--slug")
    _ = create.add_argument("--type", choices=["backend", "frontend", "fullstack", "planning"], default="planning")

    init = subparsers.add_parser("init-context")
    _ = init.add_argument("task_dir")
    _ = init.add_argument("type", choices=["backend", "frontend", "fullstack"])

    add = subparsers.add_parser("add-context")
    _ = add.add_argument("task_dir")
    _ = add.add_argument("phase", choices=["implement", "check", "debug"])
    _ = add.add_argument("path")
    _ = add.add_argument("reason")

    start = subparsers.add_parser("start")
    _ = start.add_argument("task_dir")

    finish = subparsers.add_parser("finish")
    _ = finish.add_argument("task_dir")

    _ = subparsers.add_parser("list")

    return parser


def main() -> None:
    """Execute selected command."""

    parser = build_parser()
    args = parser.parse_args(namespace=ParsedArgs())
    TASKS_DIR.mkdir(parents=True, exist_ok=True)
    if args.command == "create":
        create_task(cast(CreateArgs, cast(object, args)))
        return
    if args.command == "init-context":
        init_context(cast(InitContextArgs, cast(object, args)))
        return
    if args.command == "add-context":
        add_context(cast(AddContextArgs, cast(object, args)))
        return
    if args.command == "start":
        start_task(cast(TaskDirArgs, cast(object, args)))
        return
    if args.command == "finish":
        finish_task(cast(TaskDirArgs, cast(object, args)))
        return
    list_tasks(cast(ListArgs, cast(object, args)))


if __name__ == "__main__":
    main()
