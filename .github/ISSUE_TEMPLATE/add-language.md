---
name: Add my language
about: Contribute a new wordlist (and optionally grammar)
title: "Add language: <code> — <name>"
labels: add-language
---

**Thanks for adding your language.** The fastest path is to point your AI coding agent at [docs/AddLanguage.md](https://github.com/shmsk/LangCouch/blob/master/docs/AddLanguage.md) with your language code — it does the work end-to-end and opens a PR. A human can follow the same doc too.

Before opening the issue, please confirm:

- [ ] ISO 639-1 code: <!-- e.g. `de`, `fr`, `ja` -->
- [ ] Language name: <!-- e.g. German, French, Japanese -->
- [ ] I want to do this myself / I want my AI agent to do it
- [ ] I've read [docs/AddLanguage.md](https://github.com/shmsk/LangCouch/blob/master/docs/AddLanguage.md)

## Notes for reviewers

- Any forced compromises (shared words, periphrastic forms) — list them here so the second-model auditor reviews them deliberately.
- Native-language glosses you're adding (e.g. `de`, `fr`) — gloss keys are added to `concepts.json`, not to wordlists.
- Roughly how many entries are short (<3 chars, won't trigger prompt-recall)?

The validator gate (`bun tests/validate-wordlist.ts --full`) must pass with 100% concept coverage before the PR can merge.