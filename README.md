# LangCouch 🛋️

English · [Русский](README.ru.md) · [O'zbekcha](README.uz.md)

**Learn a language without getting off the couch — or leaving your terminal.**

LangCouch weaves words from the language you're learning into your AI coding agent's replies (Claude Code, opencode, Codex CLI, Hermes Agent, OpenClaw, and Gemini CLI in beta). This is the *diglot weave* technique: you work as usual, and the answers gradually get laced with target-language words — 3–5 per reply at first, then more often and more complex, up to word-building rules, collocations and simple constructions. No lessons. Immersion instead of studying.

> You: "why is the deploy failing?"
> Agent: "Port 8080 is still held by a **viejo** (old) process from your **primero** (first) run this morning. Kill it with `lsof -ti :8080 | xargs kill` and the deploy will go through **ahora** (now)."

10 target languages ship out of the box. Glosses (the translation in parentheses) come in English, Russian or Uzbek, in whichever of them you write your message.

## What's new in 0.7.5

- **Translations in the language you write in.** Write to the agent in Russian and you get **casa** (дом); write in English and you get **casa** (house). No setting to switch. If LangCouch can't tell the language, it uses your `native` and asks you once which one you want.
- **Gemini CLI, beta.** `langcouch install gemini` registers the hooks. It is built from Gemini's hooks reference and covered by tests, but hasn't been run against a live Gemini CLI yet.

## What's new in 0.7.0

- **Take your progress to another machine.** `langcouch export` saves it to one file, `langcouch import <file>` merges it in on the other side. If you already started learning there, nothing is lost: see [Moving to another machine](#moving-to-another-machine).

## What's new in 0.6.0

- **Spaced repetition.** Each word comes back after 30 minutes, 8 hours, a day, 4 days, 2 weeks, a month, then 6 months. It moves up a step only when a reply actually used it.
- **Honest counting.** LangCouch reads the finished reply back, so a word the model skipped isn't counted as learned. It returns on the next turn instead.
- **Translations fade.** New words come as **casa** (house). Familiar ones come as plain **casa**, with a single `casa = house` line at the end of the reply. Words you know get no translation at all.
- **Only words that fit.** The model uses a word only where the reply already needs its meaning. A word that keeps getting skipped may go into one short aside, never into code or text you will copy.

We tested this against the old behaviour on four models: answers stayed as good, and the words read more naturally. [How each model does](evals/MODELS.md). `langcouch mode 1` brings the old weave back. If you installed outside the Claude Code plugin, see the [upgrade notes](CHANGELOG.md).

## Why I built this

I read a lot every day, and these days most of that text is my AI agents' replies in a terminal. Reading in the language you're learning is one of the oldest ways to pick it up, and Toucan does exactly that for web pages in the browser. Nothing did it for the terminal, so I built LangCouch for myself. It's free for anyone who wants it too.

## Quick start

**Requirement:** [bun](https://bun.sh) or Node.js ≥ 22.6 (check with `bun -v` or `node -v`). If neither is found, the plugin stays inactive and Claude tells you at session start.

### As a Claude Code plugin (recommended)

```
/plugin marketplace add shmsk/LangCouch
/plugin install langcouch@langcouch
# restart the session — replies start weaving Spanish (default: es, level 2)
```

Zero setup: no `npm install`, no build step, and the hook bootstraps its own config on first use. Control it from inside Claude Code with `/langcouch:status`, `/langcouch:lang pt`, `/langcouch:level up`, `/langcouch:mode 3`, `/langcouch:pause` / `/langcouch:resume`, `/langcouch:spinner on`, and add your own language with `/langcouch:add-language <language>`.

**Glosses in your language:** translations follow the language of your message. Cyrillic gets Russian; Latin gets your `native` if it is `en` or `uz` (Uzbek, Latin script), else English. `langcouch native <en|ru|uz>` (default `en`) sets the fallback for a message LangCouch can't read, and the language of quiz answers and spinner tips.

### Manual hook install

The clone path needs one `bun install` (dev dependencies only; LangCouch has no runtime dependencies).

```bash
git clone https://github.com/shmsk/LangCouch && cd LangCouch
bun install
bun src/cli.ts init                       # create ~/.langcouch
bun src/cli.ts install claude            # hook into the project's .claude/settings.json
# restart your Claude Code session — replies start weaving Spanish
```

Pick one install, not both. If you do combine them, a duplicate-delivery guard keeps the counting honest. The interactive `quiz` runs in a terminal: use the manual clone, or call the CLI inside the plugin cache (`~/.claude/plugins/cache/langcouch/…/scripts/cli.sh quiz`).

### As an opencode plugin

```
git clone https://github.com/shmsk/LangCouch && cd LangCouch
bun install
bun src/cli.ts install opencode           # project scope (.opencode/plugin/)
#   or:  bun src/cli.ts install opencode --scope user   # global (~/.config/opencode/plugin/)
# quit and restart opencode — replies start weaving Spanish
```

One command installs two paths, both active at once:

- **Plugin (primary, reliable)** — auto-discovered by opencode. Hooks `experimental.chat.messages.transform` to run `langcouch hook` on your latest user message and inject the `<langcouch>` block into context. Works on every model.
- **AGENTS.md section (fallback, experimental)** — if you disable plugins or the plugin can't load, the model is instructed to run `langcouch hook` itself at the start of each reply. Model-compliance-dependent.

A duplicate-delivery guard keeps the counting honest if both paths fire for the same prompt.

### As a Codex CLI hook

```bash
git clone https://github.com/shmsk/LangCouch && cd LangCouch
bun install
bun src/cli.ts install codex --scope user   # ~/.codex/hooks.json (or --scope project: ./.codex/hooks.json)
# start codex, open /hooks and trust the langcouch hook — replies start weaving Spanish
```

Codex skips any hook you haven't reviewed, so the `/hooks` step is needed once (and again if the hook command changes). A project-scope hook also needs the project to be trusted. If you installed the old experimental version, the installer removes its `AGENTS.md` section for you. Codex currently shows the injected instruction as a visible developer message in the transcript ([openai/codex#16933](https://github.com/openai/codex/issues/16933)); it's cosmetic.

### As a Gemini CLI hook (beta)

```bash
git clone https://github.com/shmsk/LangCouch && cd LangCouch
bun install
bun src/cli.ts install gemini --scope user   # ~/.gemini/settings.json (or --scope project: ./.gemini/settings.json)
# start gemini — replies start weaving Spanish
```

Beta: the adapter follows Gemini CLI's [hooks reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md) (`BeforeAgent` adds the instruction, `AfterAgent` reads the reply back) and is covered by tests, but nobody has run it against a live Gemini CLI yet. If it doesn't weave for you, please [open an issue](https://github.com/shmsk/LangCouch/issues). Gemini asks before running a new project-scope hook: allow `langcouch` when it does.

### As a Hermes Agent plugin

```bash
git clone https://github.com/shmsk/LangCouch && cd LangCouch
bun install
bun src/cli.ts install hermes           # $HERMES_HOME/plugins/langcouch/ (default ~/.hermes)
hermes plugins enable langcouch         # Hermes plugins are opt-in
# restart hermes — replies start weaving Spanish
```

The plugin is a small Python file that hands every turn to the LangCouch CLI through Hermes' `pre_llm_call` hook, so it works the same in the CLI and on gateway platforms like Telegram. Control it from any session with `/langcouch status`, `/langcouch lang pt`, `/langcouch level up`, `/langcouch pause` / `/langcouch resume`. You don't need Python yourself beyond what Hermes already ships with.

### As an OpenClaw plugin

```bash
git clone https://github.com/shmsk/LangCouch && cd LangCouch
bun install
bun src/cli.ts install openclaw         # generates the plugin in ~/.langcouch/openclaw-plugin/
openclaw plugins install --link ~/.langcouch/openclaw-plugin --force --accept-capabilities
openclaw config set plugins.entries.langcouch.hooks.allowConversationAccess true --strict-json
openclaw plugins enable langcouch
```

OpenClaw only runs prompt hooks of plugins you have allowed, so the `allowConversationAccess` line is required. The plugin uses the `before_prompt_build` hook, and `/langcouch status`, `/langcouch lang pt`, `/langcouch pause` work in any chat channel. OpenClaw's `claude-cli` provider doesn't run prompt hooks ([openclaw/openclaw#65157](https://github.com/openclaw/openclaw/issues/65157)); every other provider does.

## Will it make my agent's answers worse?

It's designed not to. The weave instruction forbids touching code blocks, inline code, identifiers, commands, paths, URLs, quotes and technical terms, and it tells the model that the meaning and quality of the reply always outweigh the weaving. The cost is one short instruction (≤600 tokens) per prompt, mostly read from the prompt cache: about 1–3% of a typical session ([details](docs/TokenUsage.md)). How four models handle it: [evals/MODELS.md](evals/MODELS.md). If you need a clean session, `/langcouch:pause` stops it instantly and `/langcouch:resume` brings it back.

## How it works

Browser extensions (Toucan, Vocabo) rewrite the page DOM. In a CLI there is no post-hoc rewrite — so LangCouch injects a short instruction through a CLI hook, and the model does the weaving itself. The core knows nothing about any CLI — adapters are thin (architecture inspired by [context-mode](https://github.com/mksglu/context-mode)).

```mermaid
flowchart LR
    A[You type a prompt] --> B[CLI hook runs<br/>langcouch hook]
    B --> C{Scan prompt<br/>for known words}
    C -->|recall found| D[Bump recall count<br/>in state.<lang>.json]
    C -->|no recall| E[Scheduler picks N<br/>least-seen words]
    D --> E
    E --> F[Build ≤600-token<br/>weave instruction]
    F --> G[Instruction injected<br/>into agent context]
    G --> H[Model weaves words<br/>into its reply]
    H --> I[After the reply: words it used<br/>climb the ladder in local state]
```

- **Concept-keyed vocabulary**: meanings live once in `concepts.json` (id, pos, tier, glosses per native language); each `wordlists/<lang>.json` is a thin concept→lemma map, so adding a language is one small file and glosses never drift
- **Wordlists**: ~400 core content words per language (noun/verb/adj/adv), no function words; the tier field reserves room for the →1000-word band, unlocked when the core is ~80% absorbed
- **Per-language progress**: state lives in `~/.langcouch/state.<lang>.json`, keyed by concept id — progress survives lemma fixes and can be compared across languages ("you know *sun* in 3 of 5")
- **Interval ladder**: each word comes back after 30 min, 8 h, 1 day, 4 days, 2 weeks, 1 month, then 6 months. It climbs a step only when a reply actually uses it while it is due; words that are due come first, and a quarter of each list stays open for new words
- **Honest counting**: after the reply, a Stop hook (or the host's after-reply event) reads it back, and only the words it used count as shown. A host without such an event counts the words served, as before
- **Translations fade**: a new word comes as **casa** (house). From the fourth step it appears as plain **casa**, with the translation in one closing line (`casa = house · nombre = name`). From step five (absorbed) there is no translation at all, and absorbed words come back as a rotating sample the model may use freely, so the share of the language in replies grows
- **Only where it fits, plus a nudge**: the model weaves a word only where the reply already needs its meaning, so nothing is invented to host a word. The one exception is one or two words that kept missing: those may go into a short aside or a closing line, never into code, facts or text you will copy
- **Recall signal**: exposure is not knowledge. A word you use in your own prompt, or answer right in `quiz`, climbs a step; a wrong quiz answer sends it back to the start
- **Modes**: `langcouch mode 3` is the above (default). `mode 2` weaves only words that fit, and `mode 1` asks for every listed word; both count a word when it is served
- **Levels 1–10**: words from level 1; [word-building rules](#word-building-rules) from level 2 (`patterns/<lang>.json`); collocations from 4 and simple sentences from 7, using the constructions in `grammar/<lang>.json` where a language has them
- **Native language**: when you learn your own native language (e.g. `en` with native `en`), glosses fall back to another language

## Supported languages

| Language | Code | Words | Grammar constructions | Word-building rules |
|---|---|---|---|---|
| English (US) | `en` | 402 | — | 7 (for Russian speakers) |
| English (UK) | `en-GB` | 402, same as US except 9 (*colour*, *centre*, *film*…) | — | 7 (from US) |
| German | `de` | 402 | — | 8 |
| French | `fr` | 402 | — | 8 |
| Italian | `it` | 402 | — | 8 |
| Spanish (Spain) | `es` | 402 | 10 | 8 |
| Spanish (Latin America) | `es-419` | 402, same as Spain except 9 (*carro*, *computadora*, *lindo*…) | 10 + 2 regional (*ustedes*, preterite for today) | 8 (from Spain) |
| Portuguese (Portugal) | `pt` | 402 | — | 8 |
| Portuguese (Brazil) | `pt-BR` | 402, same as Portugal except 8 (*trem*, *celular*, *cachorro*…) | — | 8 (from Portugal) |
| Turkish | `tr` | 402 | — | 5 |

The code is what you pass to switch languages, e.g. `/langcouch:lang es-419` (or simply `/langcouch:lang latam`).

Every bundled list went through a second-model audit (a different vendor than the one that wrote it). English verbs are listed as `to work`, `to love`: English nouns and verbs often share a spelling, and each concept needs its own word. The weave still inflects them in context (*worked*, *she loves*).

Adding your language is one JSON file. Just for yourself: run `/langcouch:add-language Georgian` in Claude Code, and the file lands in `~/.langcouch/wordlists/`, where it survives plugin updates. For everyone: open a PR, see [docs/AddLanguage.md](docs/AddLanguage.md). The doc is written so an AI coding agent can do it end-to-end.

Regional variants work the same way: `pt-BR.json` lists only the words where Brazilian Portuguese differs from `pt`, and the rest comes from the base. `/langcouch:add-language Brazilian Portuguese` builds one; `/langcouch:lang pt-br` switches to it.

Switching to a variant doesn't start you over. Every word spelled the same in both shares one progress pool, so if you learned Spain Spanish and move to `es-419`, you keep *casa* and all the rest and only learn the 9 words that differ. Those come first, next to the Spain word: *carro = car, Spain: coche*. Grammar works the same way: the regional constructions (*ustedes trabajan*, not *vosotros trabajáis*) come first. Where the base word is rude in the variant's region, the contrast says so: *tomar = to take, Spain: coger (vulgar in much of Latin America)*.

## Word-building rules

Many words are built the same way in several languages. *Revolution* is *revolución* in Spanish, *revolução* in Portuguese, *rivoluzione* in Italian, *révolution* in French and *революция* in Russian. Learn the rule *-tion → -ción* once, and you can read hundreds of Spanish words you already half-know. That gets the weave to phrases sooner.

- **When:** from level 2 (the default), every reply teaches one rule with an example: *-tion → -ción (revolución = revolution)*.
- **Beyond the word list:** a reply that teaches a rule may also use one more word built by it, even if that word isn't one of your ~400.
- **Your side of the rule:** the suffix is shown in your native language. An English speaker sees *-tion → -ción*, a Russian speaker sees *-ция → -ción*. Some rules exist for one side only: *-ly → -mente* for English speakers, *-ировать → -ieren* (*kopieren*) for Russian speakers.
- **Progress:** a rule counts as introduced after three replies, and then the next one starts. `status` shows it as *Word-building rules: 1/8 introduced*.
- **False friends:** a rule warns about words that look like it but mean something else, e.g. *actual = current* next to *-al*.
- **Where the data lives:** rules in `patterns/<lang>.json`, false friends and rude words in `falseFriends/<lang>.json`. The table in [Supported languages](#supported-languages) shows how many rules each language has. Every rule and example was checked against a dictionary (mostly Wiktionary) and then audited by a second model from another vendor.

What changed in each version is in [CHANGELOG.md](CHANGELOG.md). After an update, `status` shows the new version's changes once.

## Supported CLIs

| CLI | Status | Install | Mechanism |
|---|---|---|---|
| Claude Code | **Production** | `/plugin marketplace add shmsk/LangCouch` → `/plugin install langcouch@langcouch`, or `langcouch install claude` | `UserPromptSubmit` hook (context injection, reliable); `Stop` reads the reply back |
| opencode | **Production** (plugin) + **experimental** (fallback) | `langcouch install opencode [--scope project\|user]` | `experimental.chat.messages.transform` plugin hook + AGENTS.md self-serve fallback; `session.idle` reads the reply back |
| Codex CLI | **Production** | `langcouch install codex [--scope project\|user]` | `UserPromptSubmit` hook in `hooks.json` (context injection, reliable); `Stop` reads the reply back |
| Gemini CLI | **Beta** (not live-tested yet) | `langcouch install gemini [--scope project\|user]` | `BeforeAgent` hook in `settings.json` (JSON `additionalContext`); `AfterAgent` reads the reply back |
| Hermes Agent | **Production** | `langcouch install hermes` | `pre_llm_call` plugin hook (context appended to your message); `post_llm_call` reads the reply back |
| OpenClaw | **Production** | `langcouch install openclaw` | `before_prompt_build` plugin hook (`prependContext`); `agent_end` reads the reply back |

Codex CLI, opencode, Hermes Agent and OpenClaw are installed on a clean CI runner and tested end to end ([hosts-smoke workflow](.github/workflows/hosts-smoke.yml)): the plugin loads, the block reaches the model, and real models on OpenRouter weave the words they were given.

Adding yours is welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). The hook contract any adapter must satisfy: never break the host session (on any error, print nothing and exit 0).

## Commands

| Command | What it does |
|---|---|
| `init` | create the config (idempotent) |
| `status` | level and progress for every language with state |
| `lang [code]` | switch target language / list available ones (your own are marked `local`) |
| `validate <code> [--full]` | check a wordlist, e.g. one you added in `~/.langcouch/wordlists/` |
| `native [en\|ru\|uz]` | your language: translations when a message's language is unclear, quiz answers, spinner tips |
| `level <1-10\|up\|down>` | weaving intensity |
| `mode [1\|2\|3]` | weave algorithm: 3 interval ladder (default), 2 only words that fit, 1 every listed word |
| `quiz [n]` | absorption check (default 5 words); a failed word goes back into rotation |
| `pause` / `resume` | kill switch for weaving |
| `export [file\|-] [--force]` | save progress, settings and your own wordlists to one file, `~/langcouch-export-<date>.json` by default (`-` prints it; an existing file is replaced only with `--force`) |
| `import <file> [--config]` | merge an export into this machine's progress, keeping the best of both; `--config` also takes its settings |
| `spinner <on\|off\|status>` | opt-in: words you are learning in the Claude Code spinner tips |
| `instruction` | print the weave instruction (without marking exposures) |
| `hook` | CLI-hook mode: before a reply, builds the instruction and scans your prompt for recalls; after it (a `Stop` payload), counts the words the reply used. Exits 0 on any error so it never breaks the host session |
| `install claude [--scope project\|user]` | register the UserPromptSubmit, SessionStart and Stop hooks |
| `install opencode [--scope project\|user]` | install the plugin + AGENTS.md fallback for opencode |
| `install codex [--scope project\|user]` | register the UserPromptSubmit, SessionStart and Stop hooks in Codex CLI's `hooks.json` |
| `install gemini [--scope project\|user]` | beta: register the BeforeAgent, SessionStart and AfterAgent hooks in Gemini CLI's `settings.json` |
| `install hermes` | install the Hermes Agent plugin into `$HERMES_HOME/plugins/langcouch/` |
| `install openclaw` | generate the OpenClaw plugin and print the commands that link and enable it |

## Spinner tips (opt-in)

While Claude Code is thinking, its spinner rotates tips. `/langcouch:spinner on` adds up to 5 words you are currently learning there (`LangCouch · frío = cold`), refreshed at every session start. It is a free bonus: spinner tips do not count as exposures.

A plugin cannot ship spinner tips itself, so this writes to your `~/.claude/settings.json`, carefully:

- **Off by default.** Installing LangCouch never touches your settings.
- **Only our lines.** Every added tip starts with `LangCouch · `; your own tips, `excludeDefault` and every other key are left alone. If the file is not valid JSON, nothing is written.
- **Backup + atomic write.** The original file is copied to `~/.langcouch/settings.backup.json` before the first change.
- **Clean off.** `/langcouch:spinner off` removes every `LangCouch · ` line by its prefix, and the `spinnerTipsOverride` key too if we created it.

## Moving to another machine

Progress lives in `~/.langcouch/`, so every CLI on one machine already shares it. To carry it to another computer:

```bash
langcouch export                 # writes ~/langcouch-export-YYYY-MM-DD.json
langcouch import ~/Downloads/langcouch-export-2026-10-01.json   # on the other machine
```

In a chat the same works as `/langcouch:export` and `/langcouch:import <file>` (Claude Code) or `/langcouch export` and `/langcouch import <file>` (Hermes, OpenClaw).

Import merges, it never overwrites. If you already started the same language on the other machine, words only it has stay, words only the export has are added, and a word both have keeps the better record: more exposures and recalls, the higher step on the review ladder. Your local settings stay unless you pass `--config`, and your own wordlists are kept if they differ. Before changing anything, import copies the old files to `~/.langcouch/backups/`. Importing the same file twice, or sending it back, changes nothing.

One trade-off: if you learned the same word on both machines, its counts are not added up (5 and 10 become 10, not 15). Adding them would count everything twice the moment a file goes back and forth.

## Privacy

The hook runs locally. It reads your prompt only to scan it for words you've already seen (the recall signal) — your prompt is never logged, sent over the network, or stored anywhere. The only thing written to disk is the per-language state file in `~/.langcouch/` (human-readable JSON), which you can inspect, back up, or `rm -rf` at any time. LangCouch has no network surface and no telemetry.

Once a reply is finished, the hook also reads it (the host hands it over, or Claude Code's local transcript has it) to count only the words the reply actually used. The words offered for the current turn wait in `~/.langcouch/served.json` until then. The reply is not stored, and nothing leaves your machine. `langcouch mode 1` or `mode 2` turns this off.

## Uninstall

- **Claude Code plugin:** if you turned the spinner on, run `/langcouch:spinner off` **first** (Claude Code has no uninstall hook, so the plugin can't clean up after itself). Then `/plugin uninstall langcouch@langcouch` and restart the session. Already uninstalled with the spinner on? Delete the lines starting with `LangCouch · ` from `spinnerTipsOverride.tips` in `~/.claude/settings.json`.
- **Manual Claude Code hook:** remove the `UserPromptSubmit`, `SessionStart` and `Stop` entries whose command ends in `src/cli.ts hook` in `.claude/settings.json` (or `~/.claude/settings.json` if you installed with `--scope user`).
- **opencode:** delete `langcouch.ts` from `.opencode/plugin/` (or `~/.config/opencode/plugin/`) and the section between `<!-- langcouch:start -->` and `<!-- langcouch:end -->` in `AGENTS.md`.
- **Codex CLI:** remove the `UserPromptSubmit`, `SessionStart` and `Stop` entries whose command ends in `src/cli.ts hook` from `~/.codex/hooks.json` (or `.codex/hooks.json` for `--scope project`).
- **Gemini CLI:** remove the `BeforeAgent`, `SessionStart` and `AfterAgent` entries named `langcouch` from `~/.gemini/settings.json` (or `.gemini/settings.json` for `--scope project`).
- **Hermes Agent:** `hermes plugins disable langcouch`, then delete `~/.hermes/plugins/langcouch/` (or under your `$HERMES_HOME`).
- **OpenClaw:** `openclaw plugins uninstall langcouch`, then delete `~/.langcouch/openclaw-plugin/`.
- **Your progress:** `rm -rf ~/.langcouch` (skip this if you might come back — progress survives reinstalls).

## Feedback

Got an idea, or is something annoying you? Either is useful.

- **A concrete wish:** [open a feature request](https://github.com/shmsk/LangCouch/issues/new?template=feature-request.md).
- **A rough idea or a question:** [start a discussion](https://github.com/shmsk/LangCouch/discussions).
- **Something broken:** [file a bug](https://github.com/shmsk/LangCouch/issues/new?template=bug-report.md).

## Contributing

The most valuable contribution is your language, and [docs/AddLanguage.md](docs/AddLanguage.md) is written so your AI agent can do it end-to-end. Dev loop, tests and ground rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- Grammar constructions beyond Spanish (pt, it, fr, de, en, tr), with regional overlays for pt-BR and en-GB
- Tier 2 vocabulary (→1000 words per language), unlocked at ~80% core absorption
- Lexical chunks (whole phrases) once most of the core is absorbed
- Spanish gerunds in the spinner verbs ("Pensando…")
- Gemini CLI out of beta, after a live run
- More languages — yours? ([docs/AddLanguage.md](docs/AddLanguage.md))

## License

[MIT](LICENSE): free to use, modify, fork and redistribute.
