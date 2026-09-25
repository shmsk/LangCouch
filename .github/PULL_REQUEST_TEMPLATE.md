<!-- Thanks for the PR! For data contributions (wordlists, glosses, grammar),
     the checklist below is what reviewers will check against. -->

## What this PR changes

<!-- One or two sentences. If this is a new language, name the code. -->

## Checklist

All boxes must be ticked before review.

- [ ] `bunx tsc --noEmit` is clean
- [ ] `bun test` is green
- [ ] `bun tests/validate-wordlist.ts --full` is green (100% concept coverage for any new/edited language)
- [ ] All product surfaces (CLI output, docs, code comments, weave instruction) are English-only — non-English appears only in data (wordlists, glosses, grammar patterns)
- [ ] No new runtime dependencies (the hook must stay fast and zero-dep)

## If this PR adds or edits data

- [ ] A second-model audit has run (see docs/AddLanguage.md, Step 6) and findings are triaged
- [ ] Every forced compromise (homonym, id-collision, periphrastic form, <3-char entry) is listed below so the auditor reviews it deliberately

<!-- List compromises here, one per line:
     - <concept id>: <what and why> (e.g. "son: Turkish 'son' collides with concept id `son`, used the next synonym 'bitiş'")
-->

## If this PR changes the hook path

- [ ] `langcouch hook` still exits 0 with empty stdout on every error path (the hook contract is sacred — it must never break the host session)
- [ ] Tested under both `bun` and `node >=22.6` (the plugin fallback runs under Node)

## Verification

<!-- Paste the exact commands you ran and their exit codes:

     $ bunx tsc --noEmit ; echo $?
     $ bun test ; echo $?
     $ bun tests/validate-wordlist.ts --full ; echo $?
     $ echo '{"session_id":"ci","hook_event_name":"UserPromptSubmit","prompt":"hi"}' | bun src/cli.ts hook | head -1
-->