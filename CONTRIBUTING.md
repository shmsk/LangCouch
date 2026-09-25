# Contributing to LangCouch

## The contribution we want most: add your language

Every language is one JSON file mapping ~400 canonical concepts to that language's words. The full flow — designed so **your AI coding agent can do it for you** — lives in [docs/AddLanguage.md](docs/AddLanguage.md). Point Claude Code (or any agent) at that file with your language code and review the PR it produces.

Also welcome via the same doc: native-language glosses (so learners can see translations in their own language) and grammar construction files for existing languages.

## Dev loop

```bash
bun install
bun test                        # unit tests
bunx tsc --noEmit               # typecheck
bun tests/validate-wordlist.ts  # data validation (add --full when contributing a language)
```

All three must be green before a PR. CI runs the same commands.

## Ground rules

- TypeScript + bun; no runtime dependencies (the hook must start in milliseconds).
- The hook contract is sacred: `langcouch hook` never breaks the host session — on any error it prints nothing and exits 0.
- All product surfaces (CLI output, docs, code comments, weave instructions) are English-only. Wordlist/gloss data and README translations (`README.<lang>.md`, which follow `README.md`) are the only places other languages appear.
- Data changes should come with a second-model audit (see docs/AddLanguage.md, Step 6).
