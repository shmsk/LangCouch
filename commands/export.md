---
description: Save Lazy Polyglot progress to one file, to carry to another machine
argument-hint: [file]
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh *)
---

Run `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh export $ARGUMENTS` and show the user its output verbatim in a code block. If it errors, show the error message as-is.
