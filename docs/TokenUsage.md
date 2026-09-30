# How many tokens does LangCouch cost?

Short answer: a few hundred input tokens per prompt, almost all of them read from the prompt cache. In a typical session that is roughly 1–3% of what you would spend anyway.

## Where the tokens go

LangCouch adds tokens in three places:

- **Every prompt.** The `UserPromptSubmit` hook adds one short weave instruction to the context. It stays in the conversation history, so the context grows by the size of that instruction with each prompt you send.
- **Session start.** The `SessionStart` hook adds the same instruction once.
- **The reply.** The model writes a few target-language words, each with a translation in brackets the first time. That is about 15–25 extra output tokens per reply, and fewer on low levels.

Nothing else is sent. There are no extra requests to the model, no tool calls and no network traffic.

## Instruction size by level

Measured with `langcouch instruction` on 0.4.0. Tokens are estimated at about 4 bytes per token, so treat them as approximate.

| Level | Spanish / French | German | English |
|-------|------------------|--------|---------|
| 1 | ~645 B · ~160 tok | ~640 B · ~160 tok | ~655 B · ~165 tok |
| 2 (default) | ~960 B · ~240 tok | ~890 B · ~220 tok | ~670 B · ~170 tok |
| 5 | ~1,140 B · ~285 tok | ~1,060 B · ~265 tok | ~875 B · ~220 tok |
| 10 | ~1,365 B · ~340 tok | ~1,290 B · ~320 tok | ~1,120 B · ~280 tok |

Higher levels weave more words, so both the instruction and the reply get a little longer. The instruction stays well under 600 tokens on every level.

## What it adds up to

A coding agent's base context (system prompt, tool definitions, project instructions) is usually 30–60k tokens. Next to that:

- **First prompt:** about +240 tokens on the default level, well under 1%.
- **After 50 prompts:** the instructions left in the history add up to about 12k tokens, roughly 5–10% of the context.
- **Billing and limits:** instructions from earlier turns are re-read from the prompt cache, which costs about a tenth of normal input. Only the newest instruction and the woven words are paid at full price. In practice that comes to about 1–3% of a typical session.

The overhead grows linearly with the number of prompts. It shows most in long sessions made of many short questions, and least in sessions with a few long, tool-heavy turns.

## Paying less

- **Lower the level.** `/langcouch:level 1` cuts the instruction by about a third compared to the default.
- **Pause it.** `/langcouch:pause` makes the hook print nothing, so it costs zero tokens until `/langcouch:resume`.

## Measure it yourself

Print the exact instruction your current settings produce and count its bytes:

```sh
langcouch instruction | wc -c
```

Inside Claude Code, use `${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh instruction`. To compare whole sessions, run `/context` in two similar sessions, one with LangCouch paused and one with it on.
