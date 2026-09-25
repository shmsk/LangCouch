---
description: Add a new LangCouch language for yourself (survives plugin updates)
argument-hint: <language name or ISO code>
allowed-tools: Read, Write, Edit, Bash(${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh *)
---

Add the language "$ARGUMENTS" to LangCouch for this user.

Follow `${CLAUDE_PLUGIN_ROOT}/docs/AddLanguage.md` (path "For yourself"), reading the concept inventory from `${CLAUDE_PLUGIN_ROOT}/concepts.json`. Differences from a repo contribution:

- Write the wordlist to `~/.langcouch/wordlists/<code>.json` (and an optional grammar file to `~/.langcouch/grammar/<code>.json`), never inside `${CLAUDE_PLUGIN_ROOT}`. Files in the plugin folder are replaced on every plugin update.
- Validate with `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh validate <code> --full` and fix every reported error until it passes.
- Then run `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh lang <code>` to switch to it.

Done means: the validator passes with full coverage, `lang` shows `<code> (local)` as current, and you tell the user how many entries needed forced compromises. Mention that they can share the language with everyone by opening a PR at https://github.com/shmsk/LangCouch with the same file under `wordlists/`.
