# Upgrading from LangCouch to Lazy Polyglot

LangCouch is now **Lazy Polyglot**. Same plugin, same words, same progress. It has a new name because it's going into Anthropic's official plugin directory, and the new name is quicker to understand there.

If you installed LangCouch before version 0.9.7, do the steps below once. They take about a minute. Your progress (learned words, levels, settings) carries over.

**Using an AI agent?** Tell it: *"Read https://github.com/shmsk/lazy-polyglot/blob/main/UPGRADING.md and do it for me."* The steps are written for both people and agents.

## Claude Code

1. **Back up your progress (recommended).** Run:
   ```
   /langcouch:export
   ```
   It saves everything to one file in your home folder (`~/langcouch-export-YYYY-MM-DD.json`). If you don't have `/langcouch:export`, skip this step; your data is still safe in `~/.langcouch`.

2. **Remove the old marketplace.** This uninstalls the old plugin. It does not touch your progress, which lives in `~/.langcouch`, outside Claude Code.
   ```
   /plugin marketplace remove langcouch
   ```

3. **Add the new one and install.**
   ```
   /plugin marketplace add shmsk/lazy-polyglot
   /plugin install lazy-polyglot@lazy-polyglot
   ```

4. **Reload.** Run `/reload-plugins`, or restart Claude Code.

5. **Check that it worked.**
   ```
   /lazy-polyglot:status
   ```
   You should see your language and the same word counts as before. On first run, Lazy Polyglot moves `~/.langcouch` to `~/.lazy-polyglot` by itself.

**If the status shows zero words:** run `/lazy-polyglot:import ~/langcouch-export-YYYY-MM-DD.json` with the file from step 1. Import merges, so running it twice is harmless.

## OpenCode, Codex CLI, Gemini CLI, Hermes Agent, OpenClaw

1. Back up: `bun src/cli.ts export` (in your old checkout).
2. Update your checkout. GitHub redirects the old URL, so `git pull` works. Optionally point it at the new address: `git remote set-url origin https://github.com/shmsk/lazy-polyglot.git`.
3. Run the install for your host again, for example `bun src/cli.ts install codex --scope user`. The installer replaces the old LangCouch entry with the new one.
4. Check: `bun src/cli.ts status` shows your words.

Two hosts need one more step after the install. Hermes Agent plugins are opt-in, so run `hermes plugins enable lazy-polyglot` (the plugin now lives in `$HERMES_HOME/plugins/lazy-polyglot`). OpenClaw needs its config entry and enable again: the commands are in the [README](README.md), under `plugins.entries.lazy-polyglot`.

## What changed

| Before | Now |
|---|---|
| `langcouch@langcouch` | `lazy-polyglot@lazy-polyglot` |
| `/langcouch:status`, `/langcouch:lang`, … | `/lazy-polyglot:status`, `/lazy-polyglot:lang`, … |
| `~/.langcouch/` | `~/.lazy-polyglot/` (moved automatically) |
| `LANGCOUCH_DIR` | `LAZY_POLYGLOT_DIR` (the old variable still works) |
| `~/langcouch-export-YYYY-MM-DD.json` | `~/lazy-polyglot-export-YYYY-MM-DD.json` |
| `<langcouch>` block in the context, spinner tips `LangCouch · …` | `<lazy-polyglot>`, `Lazy Polyglot · …` |
| github.com/shmsk/LangCouch | github.com/shmsk/lazy-polyglot (old links redirect) |

Something went wrong? Open an issue: https://github.com/shmsk/lazy-polyglot/issues
