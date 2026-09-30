# Weave eval

LangCouch is only as good as the model's handling of its `<langcouch>` instruction. This eval measures that across models, at three points of a learner's progress, on everyday tasks. It is a development tool: nothing here ships in the plugin.

Latest numbers: [RESULTS.md](RESULTS.md).

## What gets tested

**Stages** ([`stages.json`](stages.json)): each is a simulated learner.

| stage | words absorbed | level | words per reply | also asked for |
|---|---|---|---|---|
| `beginner` | 0% | 1 | 3 | nothing |
| `half` | 50% | 5 | 7 | a grammar construction, a word-building rule |
| `advanced` | 90% | 8 | 10 | grammar, a rule, one whole Spanish sentence |

"Words per reply" is what the hook serves in one reply, not the learner's vocabulary. An advanced learner here knows about 360 of the 402 words. Roughly 80% of each list is new words and 20% is review.

Absorbed words are chosen by a stable hash of each word id with a fixed `seed`. Every model and every run therefore sees the same learner. From that state the real scheduler builds the instruction (`pickWords`, `pickGrammar`, `pickPattern`, `buildInstruction`), the same path the hook takes. Topics run in order, and each is marked as exposed afterwards, as in a real session. Later topics therefore get new words.

**Topics** ([`topics.json`](topics.json)): the same five in every stage.

- `tech`: fix a TypeScript bug and explain it.
- `marketing`: a LinkedIn launch post.
- `meeting`: turn a meeting transcript into decisions and action items.
- `travel`: plan one day in Lisbon.
- `finance`: a monthly budget on one income.

`mustKeep` lists identifiers, names and product names that must survive the weave verbatim.

Every model gets the instruction prepended to the user message, the way the host adapters inject it, under the same neutral system prompt.

## Metrics

Deterministic, per reply ([`metrics.ts`](metrics.ts)):

- **coverage**: listed words woven as `**word** (translation)`.
- **off-list**: wordlist words that were woven but not listed, with or without a translation.
- **bad gloss**: a translation that repeats the word (`tiempo (tiempo)`) or doesn't match the listed one. Words spelled the same in both languages (`color`, `natural`) are exempt.
- **no gloss**: a listed word used in the prose without the `**word** (translation)` format.
- **code/facts touched**: a listed word or `**` inside code, or a `mustKeep` string missing.
- **rule used**, **sentence**: whether the word-building rule and the level 7+ sentence appeared.

Coverage alone rewards forcing. A model can reach 100% by inventing sentences only to host the words. So a **blind judge** also scores every reply. Opus runs through the local `claude` CLI. It sees the task and all replies under shuffled letters, with no model names, and gives two scores from 1 to 5:

- **answer**: is the reply still correct and useful, as if the Spanish were not there;
- **weave**: do the words sit where an English word was going to be anyway.

The judge is one model's opinion, not proof. Read the replies behind any surprising score.

## Running it

```sh
bun evals/weave.ts --dry                         # print the 15 instructions, no calls
bun evals/weave.ts                               # all stages, 4 models, 2 reps, judge
bun evals/weave.ts --stage half --models opus,qwen/qwen3.8-flash --reps 1 --no-judge
bun evals/weave.ts --fill evals/out/<run>        # re-ask failed replies, re-judge their groups
bun evals/weave.ts --rescore evals/out/<run>     # re-score saved replies after a metric change
bun evals/progress.ts                            # watch the latest run from another terminal
```

- A model id without a slash (`opus`) runs through your local `claude` CLI and your Claude subscription, one call at a time.
- `provider/model` goes to OpenRouter, four calls at a time per model. The key is read from the macOS Keychain, else from `OPENROUTER_API_KEY`. To store it in the Keychain: `security add-generic-password -s langcouch-openrouter -a "$USER" -w`.
- A call that fails is retried once.
- Raw replies and judge verdicts go to `out/<run>/` (gitignored). The tables are regenerated into `RESULTS.md`, and the hand-written Findings at the top survive a rerun.

To measure an instruction change, rerun with the same `stages.json` and `topics.json`. The seed is the same, so the learner is the same. Any difference comes from the change or from model randomness; `--reps` shows how much of it is randomness.
