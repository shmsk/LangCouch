---
description: Pick the LangCouch weave algorithm (3 interval ladder, 2 fit only, 1 every word)
argument-hint: [1|2|3]
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh *)
---

Run `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh mode $ARGUMENTS` and show the user its output verbatim. If it errors, show the error message as-is.
