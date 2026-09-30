# How models handle the weave

LangCouch runs inside whatever agent you use, and every agent has its own model. This page says how well four models follow the weave: whether the answer stays good, and whether the Spanish words read naturally. It is based on the [weave eval](README.md) of 2026-09-30: 30 replies per model on five everyday tasks (a bug fix, a LinkedIn post, a meeting summary, a travel plan, a budget), at three learner levels, scored 1–5 by a blind judge and read by hand.

Numbers below are for weave algorithm 3, the default since 0.6.0.

## At a glance

| model | answer (1–5) | weave (1–5) | words woven | cost for 30 replies |
|---|---|---|---|---|
| Claude Opus | 4.9 | 4.1 | 26% | subscription |
| DeepSeek V4.1 Flash | 4.4 | 3.0 | 27% | $0.10 |
| GLM 5.3 Flash | 4.4 | 2.6 | 42% | $0.07 |
| Qwen 3.8 Flash | 3.8 | 3.2 | 20% | $0.06 |

- **answer**: is the reply as good as it would be with no Spanish in it.
- **weave**: do the Spanish words sit where an English word was going to be anyway. A low score means sentences invented just to hold a word.
- **words woven**: share of the listed words the reply used. Low is fine: a skipped word comes back on the next turn.

No model let Spanish leak into code, and text meant to be copied (the post, the summary) stayed in English in 45 of 48 replies.

## Model by model

**Claude Opus: the one to use if you can.** The answers are as good as without LangCouch. It weaves few words, but they fit: "keeps every **carretera** (road) through the function on solid ground" as one closing line. Its faults are rare and small, like an ungrammatical "which **estar** hiding the problem", or skipping every word in a reply where one would have fit.

**DeepSeek: good at the start, messy later.** For a beginner it weaves almost as well as Opus (3.8 against 4.5). Once the learner knows many words, it starts stuffing them in: "It's **posible** to **crear** calm from chaos, **aprender** from beta feedback, **reconocer** what to **repetir**, and **olvidar** the rest." It also drops Spanish verbs into English sentences ("**Contar** every dollar"). The answers themselves stay solid.

**GLM: the most eager, and the most forced.** It weaves the most words and pays for it. It invents whole Spanish sentences ("**Ahora** el total **nuevo** empieza en cero"), leaves stray translation lines for words it never used, and sometimes glosses a word wrong. At the advanced level its weave drops to 1.9. The answers are fine.

**Qwen: careful with words, weak on the task.** It weaves the fewest words, so the weave score looks good. The answers are the weakest: thin travel plans, a budget built on $2,500 when the task said $3,000, and once a reply to the weave instruction instead of the task ("Understood — it is **posible** to use them only where the meaning already fits."). 3 of its 30 calls also failed on the first try.

## What this means for you

- On Claude Code with a Claude model, expect clean replies with a few well-placed words.
- With DeepSeek or GLM, expect more forced phrases as your level grows. With Qwen, the weave is the smaller problem; watch the answers themselves.
- Whatever the model, `/langcouch:pause` gives you a clean session at once.

The judge is one model's opinion. Full tables, per-level numbers and the replies behind them: [results/algo-3.md](results/algo-3.md).
