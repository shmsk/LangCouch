# Changelog

What changed in each version, written for people who use LangCouch. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/). `langcouch status` shows the newest section once
after an update. If an update ever needs you to do something, its section starts with
**Upgrade notes**: numbered steps. No version so far has needed any.

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
