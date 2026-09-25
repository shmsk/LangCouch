# Security policy

## Reporting a vulnerability

Open a [GitHub Issue](https://github.com/shmsk/LangCouch/issues) with the `bug` label. There is no bounty program and no private disclosure address — issues are public from the moment you post them. If you'd prefer to discuss a sensitive issue first, DM [@shmsk](https://github.com/shmsk) on GitHub.

## Attack surface

LangCouch is a local CLI tool. It has **no network surface** and **no telemetry**.

- The `langcouch hook` command reads your prompt from stdin only to scan it for words you've already seen (the recall signal). The prompt is never written to disk, never logged, never sent over the network.
- The only thing written to disk is the per-language state file in `~/.langcouch/state.<lang>.json` (human-readable JSON: exposures, last-seen timestamps, recall counts).
- Config and state live in `~/.langcouch/` — inspect, back up, or `rm -rf` at any time.
- The hook contract is sacred: on any internal error it prints nothing and exits 0, so it can never break the host CLI session.

## Trust boundaries

| Boundary | Why it's safe |
|---|---|
| Your prompt | Read from stdin, scanned in-memory, never persisted or transmitted |
| `~/.langcouch/state.*.json` | Local, human-readable, deletable; no sensitive data beyond word counts |
| `concepts.json` / `wordlists/*.json` | Static data shipped with the repo; reviewed via PR + second-model audit |
| `grammar/*.json` | Same — static data, PR-reviewed |
| Network | None. No fetch, no telemetry, no auto-update. The tool never opens a socket. |

## Threat model (what LangCouch does *not* protect against)

- **A malicious wordlist/grammar file in your repo** could in principle inject instructions into the weave block (the model reads these as text). Mitigation: only install wordlists you reviewed, or wordlists from this repo's `master` branch. Third-party wordlist PRs go through `bun tests/validate-wordlist.ts --full` plus a second-model audit (see CONTRIBUTING.md) before merging.
- **The hook itself can be modified locally.** `git status` on your clone will show any tampering. Pin to a tag (`git checkout v0.1.0`) if reproducibility matters to you.

## Supported versions

Only the latest `master` and the most recent tag receive updates. When a new tag is cut, the previous one is considered end-of-life.