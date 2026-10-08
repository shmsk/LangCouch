---
description: Learn the words for a goal first (a trip, an exam, a move), or list, end, delete and edit your Lazy Polyglot topics
argument-hint: "<goal, e.g. restaurants in Barcelona by Nov 20> | list | end <name> | delete <name> | drop <name> <entry>"
allowed-tools: Read, Write, Bash(${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh *)
---

The user wrote: "$ARGUMENTS"

- `list`, `end <name>`, `drop <name> <entry>`, `delete <name>`: run `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh topic $ARGUMENTS` and show the output as-is.
- Empty: run `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh topic list`, then ask in one line what goal they want words for.
- Anything else is a goal. Follow `${CLAUDE_PLUGIN_ROOT}/docs/Topics.md`: ask one or two skippable questions only if the goal is vague, build the set as a JSON file in their home folder, then run `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh topic add <file>`. Read `${CLAUDE_PLUGIN_ROOT}/data/concepts.json` to link core words.

Done means: `topic add` printed "Added topic" (or the user declined a third topic), and you told them in one or two lines what was added and the pace. If the CLI asks for a yes (a third topic, or `delete`), ask the user; add `--yes` only on their answer.
