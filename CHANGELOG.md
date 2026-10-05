# Changelog

What changed in each version, written for people who use LangCouch. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). `langcouch status` shows the newest section once
after an update. If an update ever needs you to do something, its section starts with
**Upgrade notes**: numbered steps.

## [0.9.1] - 2026-10-05

### Upgrade notes
1. If you installed the flashcards plugin in 0.9.0, remove it, or `/cards` is registered
   twice: run `/plugin uninstall langcouch-cards@langcouch` in Claude Code. Your card progress
   is kept: it lives in `~/.langcouch`, not in the plugin.
2. Restart the session. `/cards` now comes from LangCouch itself.

### Changed
- Flashcards ship inside the `langcouch` plugin: `/cards` and its status line count are there
  after a normal update, with nothing extra to install. The separate `langcouch-cards` plugin is
  gone from the marketplace.

## [0.9.0] - 2026-10-05

### Upgrade notes
1. If you are on a version older than 0.7.6, update to 0.7.6 first, run `langcouch status`
   once, and only then update to this version. Data from before 0.7.6 is no longer tested, so it may not carry over.
   You can tell which version you have from `langcouch status`, or `/plugin` in Claude Code.

### Added
- Flashcards: `/plugin install langcouch-cards@langcouch` adds `/cards`, a pane in the
  terminal, the Desktop Code tab, VS Code and mobile. It reviews the words that are due, the
  most overdue first, then asks placement words. From the 3rd ladder step a card can also ask
  the other way: your language → the one you learn. Where there is no text field (mobile)
  you show the answer and say whether you knew it. The status line shows how many words are due.
- `langcouch cards status | next | answer | reveal | grade`: the JSON the cards mod reads.
  Every card is graded and recorded by LangCouch, so cards and replies share one progress.

### Changed
- Data written by 0.4.0–0.7.5 is no longer tested or supported: update through 0.7.6 (see Upgrade notes).

## [0.8.0] - 2026-10-05

### Added
- Numbers 1–1000 in every language. The 30 numerals every number is built from (0–20, the
  tens, 100, 1000) are on your list like other words, at most one per reply, woven next to
  its digit so the fact stays readable: 3 (**tre**). They come early, after the first ~40 words.
- Number rules: when a numeral is in the reply, a short rule shows how bigger numbers are
  built, in the language you write in (English: learn 11 and 12, then -teen; French: 70 is
  60+10, 80 is 4×20; Turkish: learn the tens). Each rule takes the word-building rule's
  place until it has been shown three times. `status` shows "Number rules: 2/7 introduced".
  Your own rules can go in `~/.langcouch/numbers/<lang>.json`, and export/import carries them.

### Changed
- False friends next to a word-building rule now give the real meaning in Russian or Uzbek
  too, not only English: "attualmente = сейчас". Your own `falseFriends` files with a plain
  text meaning keep working as before.

## [0.7.6] - 2026-10-02

### Added
- Placement test for a language you already partly know: `langcouch placement` in a
  terminal, or `/langcouch:placement` in Claude Code. It asks the listed words you haven't
  absorbed yet, most common first. A right translation sends the word straight to the
  absorbed pool (reviewed in two weeks), so it is no longer taught as new; a word you don't
  know stays new. Progress saves after every word, and the next run carries on where you
  stopped. `langcouch placement --reset` asks the "don't know" words again.
- LangCouch offers the test once when you start a language, and again whenever you say the
  words are too easy ("слишком простые слова", "I already know these words").

## [0.7.5] - 2026-10-01

### Added
- Translations follow the language you write in: a message in Russian gets `casa (дом)`,
  one in English gets `casa (house)`, with no setting to change. Cyrillic means Russian;
  Latin means your `native` when it is English or Uzbek, otherwise English. Pasted code and
  links don't count.
- When LangCouch can't tell a message's language, it uses your `native` and the agent asks
  you once which language you want translations in.
- `langcouch native <en|ru|uz>` sets your language: the fallback above, quiz answers and
  spinner tips.
- Gemini CLI support, **beta**: `langcouch install gemini [--scope project|user]` registers
  the `BeforeAgent`, `SessionStart` and `AfterAgent` hooks in Gemini's `settings.json`. It
  follows Gemini's hooks reference and is covered by tests, but has not been run against a
  live Gemini CLI yet.

### Changed
- The rule about text you will copy or send (posts, emails, commit messages) no longer
  names a language: it only says to keep target-language words out.

## [0.7.0] - 2026-10-01

### Added
- `langcouch export` saves your progress, settings and own wordlists to one file, and
  `langcouch import <file>` merges it into another machine. Words only the other machine
  has stay, words only the file has are added, and a word on both keeps the better record.
  Your settings stay unless you pass `--config`. The old files are backed up to
  `~/.langcouch/backups/` first, and importing the same file again changes nothing.
  The export goes to `~/langcouch-export-<date>.json` unless you name a file, and an
  existing file is replaced only with `--force`.
- `/langcouch:export` and `/langcouch:import` in Claude Code; `/langcouch export` and
  `/langcouch import` in Hermes Agent and OpenClaw.

### Changed
- Progress and settings files are now written through a temporary file and a rename, so a
  crash or a sync client never leaves half a file behind. A file you symlinked elsewhere
  is written at its target and keeps its permissions.

## [0.6.0] - 2026-09-30

**Upgrade notes**

Your progress carries over by itself: on first use each word is placed on the new ladder
from its old counts, and every word you had absorbed stays absorbed. Two steps are needed
only if you installed LangCouch outside the Claude Code plugin:

1. Codex CLI, or a manual Claude Code hook: run `langcouch install codex` (or
   `langcouch install claude`) again with the same `--scope`. It adds the `Stop` hook and
   leaves your other hooks alone. In Codex, open `/hooks` and trust the new entry.
2. opencode, Hermes Agent or OpenClaw: run `langcouch install opencode` (with the same
   `--scope`), `langcouch install hermes` or `langcouch install openclaw` again, so the
   plugin file picks up the after-reply event. For OpenClaw, run the printed link command
   again too.

If you skip them, weaving keeps working and words are counted when they are served, as
before. To keep the old weave entirely, run `langcouch mode 1`.

### Changed
- Words come back on an interval ladder: 30 minutes, 8 hours, a day, 4 days, 2 weeks, a
  month, then 6 months. A word climbs a step only when a reply actually uses it while it
  is due, and it keeps coming back until one does.
- A word counts as shown only when the reply used it. LangCouch reads the finished reply
  back through the host's after-reply event: `Stop` in Claude Code and Codex,
  `post_llm_call` in Hermes, `agent_end` in OpenClaw, `session.idle` in opencode.
- Translations fade. A new word comes as **casa** (house). A familiar one comes as plain
  **casa**, and the reply ends with one line such as `casa = house · nombre = name`.
  Absorbed words get no translation, so more of each reply is in the language you learn.
- The model weaves a word only where the reply already needs its meaning, instead of
  fitting in every listed word. One or two words that kept missing may still go into a
  short aside or a closing line, never into code, facts or text you will copy.
- Posts, emails, summaries and commit messages you will copy or send stay free of
  foreign words; the weave stays in the text around them.
- A wrong `quiz` answer sends a word back to the start of the ladder.

### Added
- `langcouch mode [1|2|3]` and `/langcouch:mode`: 3 is the new default, 2 weaves only
  words that fit, 1 is the old "every listed word".
- `status` shows the current mode.

## [0.5.0] - 2026-09-30

### Added
- Hermes Agent support: `langcouch install hermes` puts a plugin into
  `$HERMES_HOME/plugins/langcouch/`, then `hermes plugins enable langcouch`. It works in the
  Hermes CLI and on gateway platforms such as Telegram.
- OpenClaw support: `langcouch install openclaw` generates a plugin and prints the three
  commands that link, allow and enable it.
- `/langcouch status`, `/langcouch lang pt`, `/langcouch level up`, `/langcouch pause` and
  `/langcouch resume` inside Hermes and OpenClaw chats.
- Every host except Claude Code is now tested end to end in CI on a clean machine: Codex
  CLI, opencode, Hermes Agent and OpenClaw. The tests check that the plugin loads, that the
  instruction reaches the model, and that real models (DeepSeek, GLM) weave the words they
  were given.

## [0.4.0] - 2026-09-28

### Added
- Word-building rules. Learn one rule, such as -tion → -ción, and you can read a whole
  family of words: *revolución*, *información*, *nación*. From level 2, each reply teaches
  one rule and may use one extra word built by it.
- Rules for Spanish, Portuguese, Italian, French, German, Turkish and English, 5 to 8 per
  language. You see the rule from your native language: -tion for English speakers,
  -ция for Russian speakers.
- False friends next to their rule, so *actual* is taught as "current", not "actual".
- Latin American Spanish grammar: *ustedes trabajan* instead of Spain's *vosotros trabajáis*,
  and the preterite for today (*hoy trabajé*).
- A warning when a Spain word is rude in Latin America:
  *tomar = to take, Spain: coger (vulgar in much of Latin America)*.
- `status` shows your word-building progress, and this list once after each update.

### Changed
- From level 7, the whole sentence in a reply is kept when a grammar construction is used,
  and the construction goes inside it. Before, the construction replaced the sentence.
- Grammar progress is shared between a regional variant and its base, like words.
- A variant's grammar file (your own in `~/.langcouch/grammar/`, too) now adds to its base's
  constructions instead of replacing them all. An item with the same `id` still replaces
  the base's one.

## [0.3.7] - 2026-09-28

### Changed
- Switching to a regional variant (es → es-419, pt → pt-BR, en → en-GB) no longer starts
  over: words spelled the same share one progress pool with the base, and only the
  variant's own words are new. They come first, with a contrast: *carro = car, Spain: coche*.
  Old variant progress is merged into the base on first save.
- `status` shows a *Regional* line for variants.

## [0.3.6] - 2026-09-27

### Fixed
- Windows: the plugin found no wordlists when its path had a drive letter or spaces.

## [0.3.5] - 2026-09-25

### Added
- `latam` works as a name for es-419.
- README in Russian and Uzbek.

### Changed
- Codex CLI runs on a real hook instead of an AGENTS.md section; the old section is removed
  for you.

## [0.3.0] - 2026-09-25

### Added
- Spinner tips: words you're learning show up in the Claude Code spinner
  (`langcouch spinner on`).

## [0.2.2] - 2026-09-25

### Added
- New languages: English (US and UK), German, French, Italian, Spanish (Latin America),
  Portuguese (Portugal and Brazil).
- Uzbek glosses.

### Changed
- Every wordlist audited by a second model from another vendor.
- Two concepts may share a word when the language does, so lists use natural words instead
  of rare synonyms.

## [0.2.1] - 2026-09-25

### Added
- Regional variants as small overlays on their base language (pt-BR over pt).

## [0.2.0] - 2026-09-25

### Added
- Your own languages in `~/.langcouch/` survive plugin updates.
- `/langcouch:add-language` and `langcouch validate`.

## [0.1.0] - 2026-09-25

### Added
- First release: passive language immersion for Claude Code, opencode and Codex CLI.
