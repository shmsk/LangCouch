# Adding a language to LangCouch

This document is written for an AI coding agent (Claude Code, Codex, etc.) — a human can follow it too. Following it end-to-end produces a complete, validated language, either just for yourself or as a PR for everyone.

## What you are building

LangCouch weaves target-language words into an AI agent's replies. Vocabulary is defined once as a canonical inventory of ~400 language-independent meanings (`concepts.json`); each language is a thin file mapping concept ids to that language's words. You will produce **one JSON file** (plus, optionally, a grammar file). No code changes: the language name is derived from its ISO code.

Inputs you need before starting:
- the ISO 639-1 language code (`tr`, `de`, `fr`, …) — called `<code>` below

## Two ways to add a language

- **For yourself** (Claude Code plugin users): run `/langcouch:add-language <language>`, or follow this doc and put the file at `~/.langcouch/wordlists/<code>.json` (grammar: `~/.langcouch/grammar/<code>.json`). It lives next to your progress and survives plugin updates. No clone needed; validate with `langcouch validate <code> --full` (inside Claude Code: `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh validate <code> --full`). Never write into the plugin folder (`~/.claude/plugins/cache/…`): it is replaced on every update.
- **For everyone** (a PR): work in a clone of this repo with [bun](https://bun.sh) (`bun install`), put the file at `wordlists/<code>.json`, and follow every step below including the PR checklist.

A file in `~/.langcouch/wordlists/` overrides a bundled one with the same code, so you can also fix a word locally.

## Step 1 — Read the concept inventory

Open `concepts.json` (repo root). Each entry is:

```json
{ "id": "house", "pos": "noun", "tier": 1, "gloss": { "en": "house", "ru": "дом" } }
```

- `id` — stable kebab-case concept id; this is what your file keys on
- `pos` — part of speech the translation must match (`noun` | `verb` | `adj` | `adv`)
- `gloss.en` — the English meaning; where an id carries a sense hint (`time-occasion`, `floor-surface`), translate that specific sense
- `tier` — vocabulary band (all current concepts are tier 1); ignore it when translating

A complete contribution covers **every** concept.

## Step 2 — Create `<code>.json`

A flat JSON object, one line per entry, concept id → word:

```json
{
 "house": "ev",
 "time": "zaman"
}
```

Translation rules (the validator enforces the mechanical ones):

1. **Most common everyday word** for the concept, matching its `pos`. No rare, literary, or archaic words — pick what a beginner hears daily.
2. **Lemma / citation form**: nouns in singular, verbs in the language's dictionary form (infinitive where that is the convention), adjectives in the base (masculine singular where applicable).
3. **Single word strongly preferred**; hard maximum 3 space-separated tokens.
4. **The natural word wins, even when two concepts share it.** If your language really uses one everyday word for two concepts (Spanish *mañana* = morning and tomorrow, Turkish *ay* = moon and month), use it for both; don't swap in a rare synonym to keep them apart. LangCouch handles it: a batch shows the word once, a recall credits both concepts, and the quiz accepts either meaning. At most 2 concepts may share a word (the validator enforces it), and it prints every shared word, so **list them in your PR** for the auditor to confirm each is real.
5. **Keep noun and verb apart by citation form where the language has one.** English writes verbs as `to work`, `to love`, so the verb entry never reads like the noun; the weave inflects it in context anyway (*worked*, *she loves*). Where the language has no such form, rule 4 applies.
6. **Content words only.** If the natural translation is a particle or function word, choose the nearest content-word synonym. When your language expresses a concept grammatically rather than lexically (no verb "to have", modality as a suffix, comparatives needing a particle), use the closest common periphrastic or derived form — that is expected, not a violation; note it in the PR.
7. Native script, lowercase by the language's own convention (this matters for recall matching — e.g. Turkish dotted/dotless i). Where correct orthography and what users actually type diverge, **the typed form wins**.
8. No transliterations of English, no offensive words. Words shorter than 3 characters are fine when they're the natural choice — they just never trigger prompt-recall (see FAQ); mention roughly how many such entries you have in the PR.

## Step 3 — Language name: nothing to register

The instruction names the language via `Intl.DisplayNames` (`ka` → Georgian). Use a standard ISO 639-1 code and it just works; there is no code to edit.

## Step 4 (optional) — `grammar/<code>.json`

Grammar constructions unlock at higher levels. Mirror the schema of `grammar/es.json`:

```json
{ "id": "def-article", "pattern": "gender + definite article (el/la + noun)", "exampleTarget": "la casa", "exampleGloss": "the house", "unlock": { "pos": "noun", "absorbedCount": 3 } }
```

8–12 constructions, ordered easy → hard with rising `absorbedCount` thresholds (compare `grammar/es.json`). `pattern` and `exampleGloss` are in English; `exampleTarget` must use words from your wordlist. Skip this step if unsure — languages work without a grammar file.

## Step 5 — Validate

All three must pass; paste their output into your PR description:

```bash
bun tests/validate-wordlist.ts <code> --full   # every concept covered, shared words listed (for yourself: langcouch validate <code> --full)
bunx tsc --noEmit                              # typecheck
bun test                                       # unit tests
```

If `tsc` or `bun test` fail in files you never touched, that's a pre-existing repo issue, not yours: verify your two files aren't in the error output, report it in the PR, and continue — the wordlist validator passing is your gate.

## Step 6 — Second-model quality audit (strongly recommended)

Have a **different model or vendor** than the one that generated the list review it read-only. Prompt template:

> You are auditing a beginner-frequency wordlist for {Language} learners. Below are entries `conceptId: word`, each with the concept's English gloss and part of speech. Flag any entry that is: (a) a wrong translation for the glossed sense, (b) wrong part of speech, (c) a rare/unnatural choice where a more common everyday word exists, or (d) not the lemma/citation form. Output ONLY a list of `conceptId: current → suggested (one-line reason)`. Do not rewrite the file, do not comment on correct entries.

Apply the fixes you agree with, re-run Step 5, and note in the PR which findings you applied or rejected and why. (Precedent: the Portuguese list went through such an audit; 19 of 24 findings were applied.)

## Step 7 — Live smoke test

```bash
export LANGCOUCH_DIR=$(mktemp -d)
bun src/cli.ts init
bun src/cli.ts lang <code>
bun src/cli.ts instruction
```

Expect a `<langcouch>` block containing `word = gloss` pairs in your language. (The inflection example inside the block — "casas, bonitas" — is currently fixed Spanish wording regardless of language; that's expected.) Unset `LANGCOUCH_DIR` afterwards.

## Step 8 — PR checklist

- [ ] Files touched are exactly: `wordlists/<code>.json` and optionally `grammar/<code>.json`
- [ ] Output of all three Step 5 commands pasted
- [ ] Audit summary: model used, findings applied/rejected
- [ ] Live smoke test output pasted
- [ ] Listed: shared words (rule 4), periphrastic forms (rule 6), count of <3-char recall-dead entries (rule 8)

## Adding a regional variant (pt-BR, pt-PT, es-MX, …)

Some learners want one regional standard specifically: Brazilian Portuguese says *trem* and *celular*, European Portuguese says *comboio* and *telemóvel*. A variant is **not** a full copy of the language. It is a small file holding only the words that differ from the base language; every other concept comes from the base.

- **Code**: BCP 47, `<base>-<REGION>` (`pt-BR`, `es-MX`, `es-419`). Case doesn't matter on the command line (`lang pt-br` works); the file name uses the canonical form, `pt-BR.json`. The name comes from `Intl.DisplayNames` ("Brazilian Portuguese"), nothing to register.
- **File**: `~/.langcouch/wordlists/pt-BR.json` for yourself, `wordlists/pt-BR.json` for a PR. The base (`pt`) must exist, bundled or local.
- **Content**: go through the base wordlist and add an entry only where the variant's everyday word differs. Rules 1–8 above apply to each entry. Don't copy a base word into the variant: the validator rejects entries identical to the base.
- **Grammar**: optional `grammar/pt-BR.json`; without one, the variant uses the base's grammar.
- **Validate**: `langcouch validate pt-BR --full` (repo: `bun tests/validate-wordlist.ts pt-BR --full`). Duplicates and coverage are checked on the merged result, so a variant word that clashes with another base word is caught.
- **Audit**: run Step 6 on the variant entries plus the base entries you considered and kept. The question for the auditor is "is this what a speaker of that region says every day?"
- **Progress** is separate per variant (`state.pt-BR.json`): switching from `pt` to `pt-BR` starts fresh, and `pt` progress is kept.

## Also possible: adding native-language glosses

Learners see translations in their own language via `config.native`. To support a new *native* language, add a `"<code>": "…"` key to the `gloss` object of every concept in `concepts.json` (keep `en` and existing keys). The same quality rules and audit flow apply; validate with `bun tests/validate-wordlist.ts`.

## FAQ / known limitations

- **Why at most 2 concepts per word?** Progress is kept per concept, but a recall of a shared word credits every concept that uses it. Two is a real homonym; more means the list is dodging the work.
- **Multi-token entries** are never counted by the prompt-recall scanner (it matches single tokens only) — another reason to prefer single words.
- **Words shorter than 3 characters** are never counted as recalls (noise filter).
- **Case folding**: recall matching lowercases with default Unicode rules; store words pre-lowercased in your language's own convention (Turkish `İstanbul` → dotted lowercase `i̇stanbul` differs from `istanbul` — prefer the form users actually type).
