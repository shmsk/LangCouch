# Privacy Policy

Effective: October 7, 2026

Lazy Polyglot runs entirely on your computer. It collects nothing, has no servers, and sends nothing over the network.

## What it reads

- **Your prompt**, to notice words you already know.
- **The agent's finished reply**, to count which of your words it used. `lazy-polyglot mode 1` or `mode 2` turns this off.

Neither is saved or sent anywhere.

## What it stores

Only your settings and word progress, as plain JSON files in `~/.lazy-polyglot/` on your machine. No prompts, no replies, no names or emails.

Some commands write elsewhere, only when you run them:

- `/lazy-polyglot:spinner on` adds your words to `~/.claude/settings.json`; `off` removes them.
- `lazy-polyglot install <host>` adds the hook to that agent's own config (Claude Code, Codex, OpenCode, Gemini CLI, Hermes Agent, OpenClaw).

## What it shares

Nothing. There is no telemetry, no analytics, and no third party.

## Deleting your data

Delete the `~/.lazy-polyglot/` folder. Uninstalling the plugin leaves your progress there in case you come back.

## Children

Lazy Polyglot is not aimed at children under 18.

## Changes

Any change to this policy will appear in the [CHANGELOG](../CHANGELOG.md).

## Contact

Open an issue at [github.com/shmsk/lazy-polyglot/issues](https://github.com/shmsk/lazy-polyglot/issues).
