---
description: Add a new Lazy Polyglot language for yourself (survives plugin updates)
argument-hint: <language name or ISO code>
allowed-tools: Read, Write(~/.lazy-polyglot/**), Edit(~/.lazy-polyglot/**), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh *)
---

Add the language "$ARGUMENTS" to Lazy Polyglot for this user.

Follow `${CLAUDE_PLUGIN_ROOT}/docs/AddLanguage.md` (path "For yourself"), reading the concept inventory from `${CLAUDE_PLUGIN_ROOT}/concepts.json`. Differences from a repo contribution:

- Write the wordlist to `~/.lazy-polyglot/wordlists/<code>.json`, and any optional file next to it under `~/.lazy-polyglot/grammar/`, `~/.lazy-polyglot/patterns/` or `~/.lazy-polyglot/falseFriends/` (each `<code>.json`, see the doc's Steps 4 and 4b), never inside `${CLAUDE_PLUGIN_ROOT}`. Files in the plugin folder are replaced on every plugin update.
- Validate with `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh validate <code> --full` and fix every reported error until it passes.
- Then run `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh lang <code>` to switch to it.
- If the user asks for a regional variant ("Brazilian Portuguese", `pt-BR`, "Mexican Spanish") of a language that already exists, follow the doc's "Adding a regional variant" section instead: the file `~/.lazy-polyglot/wordlists/<base>-<REGION>.json` holds only the words that differ from the base.

Done means: the validator passes with full coverage, `lang` shows `<code> (local)` as current, and you tell the user how many entries needed forced compromises. Mention that they can share the language with everyone by opening a PR at https://github.com/shmsk/lazy-polyglot with the same file under `wordlists/`.
