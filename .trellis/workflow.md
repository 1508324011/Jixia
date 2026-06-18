# Trellis Workflow

Trellis keeps project-specific AI work repeatable. It separates durable project knowledge, active task state, and session memory so each AI session can start from facts instead of assumptions.

## Core Principles

1. Read before writing.
2. Put requirements in a task before implementation.
3. Load project guidelines before code changes.
4. Check work against guidelines after code changes.
5. Record useful session knowledge before stopping.

## Directory Structure

```text
.trellis/
|-- .developer              # Local identity, ignored by git
|-- .current-task           # Active task pointer, ignored by git
|-- workflow.md             # This workflow guide
|-- workspace/              # Session memory
|-- tasks/                  # Task directories and PRDs
|-- spec/                   # Project-specific development guidance
+-- scripts/                # Trellis helper scripts
```

## Session Start

Run:

```bash
python3 ./.trellis/scripts/get_context.py
python3 ./.trellis/scripts/get_context.py --mode packages
```

Read `.trellis/workflow.md`, then read the relevant `.trellis/spec/` index files for the task.

## Task Workflow

For a development task:

```bash
TASK_DIR=$(python3 ./.trellis/scripts/task.py create "Task title" --slug task-slug)
python3 ./.trellis/scripts/task.py init-context "$TASK_DIR" fullstack
python3 ./.trellis/scripts/task.py start "$TASK_DIR"
```

Then fill `prd.md`, implement the change, run checks, and finish the task:

```bash
python3 ./.trellis/scripts/task.py finish "$TASK_DIR"
```

## Guideline Customization

The initial files under `.trellis/spec/` are templates. Replace “To be filled by the team” with observed Jixia conventions as the implementation grows.
