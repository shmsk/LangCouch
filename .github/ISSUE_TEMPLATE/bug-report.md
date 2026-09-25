---
name: Bug report
about: Something is broken or behaves wrong
labels: bug
---

## What happened

<!-- A short description of the broken behavior. -->

## What I expected

<!-- What you thought would happen instead. -->

## Reproduction

1. `langcouch …` (or: had the hook installed, then …)
2. …
3. Observed:

```text
<paste output or error>
```

## Environment

- OS: <!-- macOS / Linux / Windows + version -->
- Runtime: <!-- bun --version / node --version -->
- LangCouch version: <!-- git sha, or tag, or `cat ~/.langcouch/config.json` lang/level -->
- Installed via: <!-- /plugin install (Claude Code) | langcouch install claude | langcouch install opencode (plugin) | langcouch install opencode (AGENTS.md fallback) | langcouch install codex | other -->

## State (optional)

```bash
cat ~/.langcouch/config.json
# and, if relevant:
ls ~/.langcouch/
```