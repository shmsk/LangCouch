---
description: Merge a Lazy Polyglot export into this machine's progress (keeps the best of both)
argument-hint: <file> [--config]
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh *)
---

Run `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh import $ARGUMENTS` and show the user its output verbatim in a code block. If it errors, show the error message as-is.
