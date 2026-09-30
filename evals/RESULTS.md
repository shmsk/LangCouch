<!-- findings:start -->
## Findings

Run of 2026-09-30: 120 replies, 30 blind judge calls. One Qwen reply still timed out after two tries. I spot-checked the judge's quotes against the replies, and they matched.

**1. Every model forces words, Opus included.** The best weave score is Opus at 3.3 of 5. The cheap models land between 1.5 and 2.4. The cause is the instruction, not the models: the word list ignores the topic, and the instruction asks for every word on it. A day in Lisbon got `mano`, `ojo`, `cabeza`; a meeting summary got `niño`, `mundo`, `vida`. The judge's most common note is "a sentence invented just to host the word".

**2. Spanish lands inside deliverables.** A LinkedIn post, an email or a meeting summary is text the user copies and sends. DeepSeek put "Quiero una **habitación** para **hablar**. (I want a room to speak.)" into the post, and GLM put a Spanish slogan into the call to action. The weave belongs in the conversation around a deliverable, never inside it.

**3. Forcing damages facts and code.**
- In the meeting summary, models invented deadlines and team feelings to place a word. Qwen added a "Before Oct 22" due date nobody set.
- On the advanced tech task, DeepSeek and Qwen dropped the fixed code and wrote about "the running sum" instead, so `sumPrices` is missing.

**4. Coverage is the wrong target.** Coverage and quality move in opposite directions. Qwen weaves 97% of the words and scores 2.6 on the answer itself. Opus weaves 70% and scores 4.9, because it skips words that don't fit. That is the behaviour we want.

**5. Ranking for this job.** Opus, then GLM 5.3 flash, DeepSeek v4.1 flash, Qwen 3.8 flash.
- GLM keeps the answer nearly intact (4.3).
- DeepSeek and Qwen get worse as the list grows: at the advanced stage their answers score 3.3 and 1.8.
- Qwen was also the slowest. 11 of its 30 calls took over 180 s.

**What to change next** (not done yet):

- In the instruction: use a word only where the reply already needs that meaning, and skip the rest. Never write a sentence or a metaphor just to host a word.
- In the instruction: never weave into text the user will copy or send, such as posts, emails, summaries or commit messages. Weave only in the explanation around it.
- Later, in the scheduler: prefer unlocked words that fit the prompt's topic.
- Then rerun this eval with the same seed and compare.
<!-- findings:end -->

# Weave eval results

Run `2026-09-30T15-43-27-762Z` on commit `baa250b`. Logic and metric definitions: [README.md](README.md).
Models: `opus`, `deepseek/deepseek-v4.1-flash`, `z-ai/glm-5.3-flash`, `qwen/qwen3.8-flash`. Judge: blind `opus`, scores 1-5.

## All stages

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| opus | 30/30 | 70% | 0.0 | 0 | 5 | 0 | 85% | 80% | 4.9 | 3.3 | subscription |
| deepseek/deepseek-v4.1-flash | 30/30 | 96% | 0.0 | 0 | 2 | 1 | 75% | 70% | 3.7 | 1.8 | $0.105 |
| z-ai/glm-5.3-flash | 30/30 | 93% | 0.0 | 1 | 3 | 0 | 95% | 80% | 4.3 | 2.4 | $0.075 |
| qwen/qwen3.8-flash | 29/30 | 97% | 0.0 | 0 | 3 | 2 | 84% | 56% | 2.6 | 1.5 | $0.103 |

## Stage: beginner (0% absorbed, level 1)

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| opus | 10/10 | 90% | 0.0 | 0 | 0 | 0 | — | — | 4.7 | 3.5 | subscription |
| deepseek/deepseek-v4.1-flash | 10/10 | 100% | 0.0 | 0 | 0 | 0 | — | — | 4.2 | 2.4 | $0.012 |
| z-ai/glm-5.3-flash | 10/10 | 97% | 0.1 | 0 | 1 | 0 | — | — | 4.5 | 2.6 | $0.008 |
| qwen/qwen3.8-flash | 10/10 | 100% | 0.0 | 0 | 0 | 1 | — | — | 3.4 | 2.0 | $0.016 |

## Stage: half (50% absorbed, level 5)

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| opus | 10/10 | 79% | 0.0 | 0 | 0 | 0 | 80% | — | 5.0 | 3.4 | subscription |
| deepseek/deepseek-v4.1-flash | 10/10 | 93% | 0.0 | 0 | 2 | 0 | 80% | — | 3.5 | 1.8 | $0.035 |
| z-ai/glm-5.3-flash | 10/10 | 93% | 0.0 | 0 | 1 | 0 | 100% | — | 4.5 | 2.6 | $0.026 |
| qwen/qwen3.8-flash | 10/10 | 99% | 0.0 | 0 | 0 | 0 | 80% | — | 2.6 | 1.4 | $0.035 |

## Stage: advanced (90% absorbed, level 8)

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| opus | 10/10 | 58% | 0.0 | 0 | 5 | 0 | 90% | 80% | 4.9 | 3.1 | subscription |
| deepseek/deepseek-v4.1-flash | 10/10 | 96% | 0.0 | 0 | 0 | 1 | 70% | 70% | 3.3 | 1.3 | $0.057 |
| z-ai/glm-5.3-flash | 10/10 | 92% | 0.0 | 1 | 1 | 0 | 90% | 80% | 4.0 | 2.1 | $0.040 |
| qwen/qwen3.8-flash | 9/10 | 96% | 0.0 | 0 | 3 | 1 | 89% | 56% | 1.8 | 1.1 | $0.052 |

## Judge notes (scores of 2 or lower)

- `opus` beginner/tech#1: answer 5, weave 2. 'next tiempo' fits, but the last sentence ('adopt every día', 'your own casa codebase') is invented just to host words and reads awkwardly
- `z-ai/glm-5.3-flash` beginner/tech#1: answer 5, weave 2. the 'ledger at casa' metaphor and 'día after día' band-aid line are invented to host words, and 'día' is left untranslated
- `deepseek/deepseek-v4.1-flash` beginner/tech#1: answer 4, weave 1. 'Every día, a robust code casa should…' is garbled filler that obscures the one explanatory sentence
- `qwen/qwen3.8-flash` beginner/tech#1: answer 4, weave 2. 'the loop never spends any tiempo' and 'keep the default at casa' contort the explanation and make it less clear
- `qwen/qwen3.8-flash` beginner/marketing#0: answer 2, weave 2. Only two thin paragraphs instead of three, and the 'before this año slips away' line and the men/women line exist mainly to host the words.
- `z-ai/glm-5.3-flash` beginner/marketing#0: answer 4, weave 2. The man-on-a-run / woman-between-meetings sentence is invented to hold hombre/mujer and reads oddly gendered for a LinkedIn post.
- `opus` beginner/marketing#1: answer 5, weave 2. The 'hombre or mujer' clause in the preamble exists only to host the words; 'año' in the closing tip is acceptable.
- `qwen/qwen3.8-flash` beginner/marketing#1: answer 2, weave 2. The paragraphs are one-line fragments, too thin for a real LinkedIn announcement, and the 'every hombre... every mujer' framing is contrived to fit the words.
- `deepseek/deepseek-v4.1-flash` beginner/meeting#0: answer 4, weave 1. All three words sit in invented metaphors ('payment screen is a niño', 'real mundo', coupon field's 'vida') that muddy the summary.
- `qwen/qwen3.8-flash` beginner/meeting#0: answer 3, weave 1. Summary invents team feelings ('helpless niño', more 'vida') just to host words; mundo is forced too.
- `z-ai/glm-5.3-flash` beginner/meeting#0: answer 3, weave 1. Invents a 'one sprint later' timeline, pads with a filler retail-world line, and forces 'niño stage' into an action-item cell.
- `deepseek/deepseek-v4.1-flash` beginner/meeting#1: answer 4, weave 1. All three words sit in invented phrases ('e-commerce mundo', 'no niño's play', 'giving it more vida') that add nothing to the summary.
- `qwen/qwen3.8-flash` beginner/meeting#1: answer 3, weave 1. Answer: it invents a 'Before Oct 22' due date for Tom's risk write-up and drops that the coupon decision comes after release. Weave: the niño-learning-to-walk metaphor and 'project vida' are filler built only to host the words.
- `z-ai/glm-5.3-flash` beginner/meeting#1: answer 4, weave 2. Calling the coupon field 'the niño' makes no sense, and 'lead a vida of its own' is a stretched metaphor; only 'ideal mundo' reads naturally.
- `deepseek/deepseek-v4.1-flash` beginner/travel#0: answer 4, weave 2. 'Use your manos to hold a bifana' is a sentence invented just to host the word, and the cabeza line is forced too.
- `qwen/qwen3.8-flash` beginner/travel#0: answer 3, weave 1. The mano sentence about asking for help is contrived and makes the midday advice confusing; the cabeza line is also forced.
- `qwen/qwen3.8-flash` beginner/travel#1: answer 3, weave 2. 'Hold your coffee with both manos' and 'clear your cabeza' on the ferry are invented just to host the words.
- `deepseek/deepseek-v4.1-flash` beginner/finance#0: answer 4, weave 2. Repeats agua, trabajo and ciudad several times, including in the budget line items; the last paragraph reads as if built to host the words.
- `qwen/qwen3.8-flash` half/tech#0: answer 4, weave 1. Fix and explanation are correct, but the final paragraph is invented nonsense that exists only to host the words; 'explicación' is also unformatted.
- `deepseek/deepseek-v4.1-flash` half/tech#0: answer 4, weave 1. Correct fix, but the middle paragraph is padding written only to fit the words in, and the 'la casa example' line makes no sense.
- `z-ai/glm-5.3-flash` half/tech#0: answer 5, weave 2. 'ojo' and 'año' fit, but the hombre/niño rule, the casa receipts metaphor and 'la vida of a good default' are invented to host words.
- `opus` half/tech#1: answer 5, weave 2. Correct fix with return type and reduce alternative, but 'flag any future día' is awkward, 'even a niño could spot it' and 'El ojo gets trained quickly' exist only to host words, and the off-list 'inicialización' was added
- `z-ai/glm-5.3-flash` half/tech#1: answer 5, weave 2. Excellent explanation including TS evolving type, but the casa metaphor, counting like a niño and the reviewing hombre are invented just to host words; off-list 'solución' was added
- `qwen/qwen3.8-flash` half/tech#1: answer 3, weave 1. The empty-house metaphor exists only to cram in every word; the explanation never says the loop doesn't run or that ?? 0 sits inside the loop
- `deepseek/deepseek-v4.1-flash` half/tech#1: answer 3, weave 1. Nearly every sentence (opening día, casa, vida/año, niño, hombre) is built to host a word, which buries the explanation; the fixed code also keeps the now-redundant ?? 0 guard
- `deepseek/deepseek-v4.1-flash` half/marketing#0: answer 3, weave 2. Filler like 'getting agua' and 'each momento of rambling', an off-list 'transformación' in a garbled closing line, and broken nested bold in the headline.
- `opus` half/marketing#0: answer 5, weave 2. The post is clean, but the Spanish is packed into framing and tips with invented lines ('replies flowing like agua', 'cabeza headspace', 'lugar in their feed') plus an off-list 'atención'.
- `qwen/qwen3.8-flash` half/marketing#0: answer 2, weave 1. Too thin for the task (two tiny paragraphs plus CTA), and the prose is mostly built around the words ('slip away like agua', 'every thought needs a clear lugar'), with an off-list 'invitación'.
- `qwen/qwen3.8-flash` half/marketing#1: answer 3, weave 2. The 'glass of agua' clause is invented to host the word, and the call to action is folded into a thin third paragraph.
- `deepseek/deepseek-v4.1-flash` half/marketing#1: answer 4, weave 2. Forced lines like 'Tidy is that forma' and 'like agua for a cluttered mind' exist mainly to host the words.
- `z-ai/glm-5.3-flash` half/meeting#0: answer 4, weave 2. Invented metaphors host the words (payment screen as firstborn hijo, a date as madre of the schedule, padre of the checkout); it also adds 'migración', which was not on the list, and assumes the coupon decision happens at the Oct 22 review.
- `deepseek/deepseek-v4.1-flash` half/meeting#0: answer 4, weave 2. The closing familia/madre/padre/hijo paragraph is invented only to host words; 'decisión' is unlisted and unformatted.
- `qwen/qwen3.8-flash` half/meeting#0: answer 3, weave 1. Forced metaphors (padre/hijo branches, 'madre open question') muddle the summary; it also invents the migration write-up's scope and deadline and omits the Oct 22 review.
- `z-ai/glm-5.3-flash` half/travel#1: answer 4, weave 2. Weave: the openers 'Great pregunta' and 'Short respuesta: yes' are forced, since no yes/no question was asked. 'For a calmer caso' is unnatural. 'For ejemplo' introduces something that isn't an example. 'turismo' is not on the word list.
- `deepseek/deepseek-v4.1-flash` half/travel#1: answer 3, weave 2. Weave: the opening sentences exist mainly to host pregunta, caso, respuesta and razón. 'Don't repetir the mistake' is contrived. The closing 'respuesta clara' is tacked on. 'turismo' is off-list.
- `qwen/qwen3.8-flash` half/travel#1: answer 1, weave 1. Answer: there is no real morning-to-evening plan, only vague fragments. Weave: nearly every sentence is built to showcase a Spanish word, as in 'caso práctico' and 'Keep that idea simple'.
- `deepseek/deepseek-v4.1-flash` half/finance#0: answer 4, weave 2. Sentences are built to host words (an hour and an afternoon each month, tolls on the carretera), and it adds unlisted terms like horas extras and consumismo.
- `qwen/qwen3.8-flash` half/finance#0: answer 3, weave 2. The weave causes errors: 'carretera upkeep' is not a personal cost, and the forced 'meses tranquilos', 'tardes ocupadas' and 'turismo' lines confuse the advice.
- `qwen/qwen3.8-flash` half/finance#1: answer 3, weave 2. Invented kids-after-school and toll-road sentences just to host words; oddly avoids the word 'debt' and has thin detail
- `deepseek/deepseek-v4.1-flash` half/finance#1: answer 4, weave 2. Irrelevant hourly-wage calculation, 'road tolls', 'long months' and 'fixed hours' all forced in to host words
- `z-ai/glm-5.3-flash` advanced/tech#1: answer 5, weave 2. Accurate fix and explanation. The año example, the viaje/carretera metaphor and the hijo sentence were invented only to use the words, and inicialización is off-list.
- `deepseek/deepseek-v4.1-flash` advanced/tech#1: answer 4, weave 1. The fix is correct, but nearly every word is forced in: hijo module, carretera for reduce, años. It ends with a meaningless Spanish sentence that clutters the explanation.
- `qwen/qwen3.8-flash` advanced/tech#1: answer 3, weave 1. Correct code and a one-line cause, but everything after is filler that only hosts the words ('learn from a curious hijo', 'do not skip the next año'), which makes the reply harder to use.
- `deepseek/deepseek-v4.1-flash` advanced/finance#1: answer 4, weave 1. Words are forced in with ungrammatical phrases ('how you contar each dollar', 'vivir costs'), a repeated invented 'campo' metaphor, an unrelated Spanish sentence, and pie/diente/cara stuffed into table labels.
- `qwen/qwen3.8-flash` advanced/finance#1: answer 3, weave 2. Some lines exist only to host a word ('shoe needs for the pie', 'cara of your monthly plan', 'largest campo'), and the Spanish sentence is invented filler; the budget itself lacks a line-item breakdown.
- `z-ai/glm-5.3-flash` advanced/finance#1: answer 4, weave 2. Forced metaphors ('look your habits in the cara', 'campo for surprises', 'back on your pies') and an invented Spanish sentence; separately, $7,200 is about 4.8 months of $1,500 needs, not 'roughly three'.
- `z-ai/glm-5.3-flash` beginner/tech#0: answer 5, weave 2. The closing paragraph (saving tiempo, the bill for the whole casa) exists only to host the words and adds nothing to the fix.
- `qwen/qwen3.8-flash` beginner/tech#0: answer 5, weave 1. It adds a nonsensical paragraph ('a quiet casa and an empty día both need a zero starting tiempo') purely to host the words.
- `deepseek/deepseek-v4.1-flash` beginner/tech#0: answer 5, weave 2. 'at the tiempo the loop starts' is forced into the bug explanation, and 'the function's own casa' is a metaphor invented to host the word.
- `qwen/qwen3.8-flash` half/meeting#1: answer 2, weave 1. Drops Tom's migration-risk write-up and the Oct 22 review. The padre/madre/hijo/familia metaphor is invented just to host the words and muddles the summary.
- `deepseek/deepseek-v4.1-flash` half/meeting#1: answer 3, weave 2. Forced phrasings like 'checkout familia redesign' and 'that ventana is the review point' hurt clarity, and 'do not olvidar' is tacked onto an action item.
- `deepseek/deepseek-v4.1-flash` advanced/meeting#0: answer 3, weave 1. Weave: invents filler notes (Maya woke up, Priya drinks coffee) and a nonsense Spanish sentence just to host words, and the phrase 'crear migración risks' garbles the action item.
- `z-ai/glm-5.3-flash` advanced/meeting#0: answer 4, weave 2. Weave: 'los pasos' is forced in, and the closing 'plan in one line' is an invented nonsense sentence that exists only to host leftover words.
- `qwen/qwen3.8-flash` advanced/meeting#0: answer 1, weave 1. Answer: omits the Oct 14 QA handoff, the Friday test plan, the coupon decision, the migration write-up and the Oct 22 review, and invents owners and dates. Weave: contrived sentences about schools, drinking and waking up.
- `z-ai/glm-5.3-flash` advanced/meeting#1: answer 3, weave 1. Invents a deadline for Tom's migration write-up and adds filler (schools, coffee, waking early); Spanish words are forced into made-up sentences, plus a random Spanish closing line.
- `opus` advanced/meeting#1: answer 5, weave 2. Inserts an invented full Spanish sentence and a filler 'acción' line (not a given word), and leaves 'decidir' untranslated; the summary itself is accurate and correctly marks the migration write-up as undated.
- `deepseek/deepseek-v4.1-flash` advanced/meeting#1: answer 3, weave 1. Gives Tom's migration notes an Oct 22 deadline that was never set and pads the summary with coffee and wake-up filler; adds an unrelated grammar-reminder sentence and untranslated 'decidimos'.
- `deepseek/deepseek-v4.1-flash` half/travel#0: answer 3, weave 2. Phrases like 'pregunta buena/respuesta sencilla' are invented to host words, 'For ejemplo' and 'In that caso' are misused, and 'repetir' a walk is forced.
- `qwen/qwen3.8-flash` half/travel#0: answer 2, weave 2. Answer: vague and thin, few concrete sights or timings, and a sunset viewpoint placed after dinner. Weave: the viewpoint 'pregunta/respuesta' setup and 'do not repetir the same route twice' exist only to host words.
- `qwen/qwen3.8-flash` advanced/tech#0: answer 1, weave 1. No code and no clear fix; mostly invented metaphors and filler sentences built to host words (hijo, carretera, año), plus a standalone Spanish sentence and an extra unlisted word.
- `deepseek/deepseek-v4.1-flash` advanced/tech#0: answer 2, weave 1. Diagnosis is correct but there is no code and the fix is buried in padding; the año, viaje/carretera and hijo lines are invented only to fit the words, plus a standalone Spanish sentence.
- `z-ai/glm-5.3-flash` advanced/tech#0: answer 4, weave 2. Fix and code are solid, though the implicit-any claim is shaky. The hijo-of-the-bug, loop-making-a-viaje, carretera-to-undefined and años-of-linters lines are all forced, and it ends with an inserted Spanish sentence.
- `qwen/qwen3.8-flash` advanced/marketing#0: answer 2, weave 1. The headline misstates the product as a 'proyecto' instead of a to-do list, the sea, river and food lines are invented only to host words, a Spanish sentence is inserted, and the off-list 'solución' is added.
- `deepseek/deepseek-v4.1-flash` advanced/marketing#0: answer 3, weave 2. Words are forced in ungrammatically ('We hablar', 'pasado week'), the room and river images are invented, and a stray Spanish sentence inside the post would make it unusable as written.
- `z-ai/glm-5.3-flash` advanced/marketing#0: answer 3, weave 2. The Spanish sits inside the post meant for pasting, the example sentence is ungrammatical ('Ven hablar'), the room and river metaphors are invented to host words, and 'just hablar' is used as an English verb.
- `deepseek/deepseek-v4.1-flash` advanced/marketing#1: answer 3, weave 1. Metaphors like 'habitación of calm' and 'comida for your workflow' exist only to host words; it adds unlisted words and ends paragraph three with a nonsense Spanish sentence.
- `z-ai/glm-5.3-flash` advanced/marketing#1: answer 4, weave 2. The post is solid, but 'mar of a Monday' and 'clearing una habitación in your head' are forced; it adds the unlisted 'organización' and closes on an invented Spanish tagline.
- `qwen/qwen3.8-flash` advanced/marketing#1: answer 1, weave 1. Incoherent: the paragraphs are strings of place and food words, there is no clear product explanation, and 'Una comida viene por el proyecto' is meaningless.
- `qwen/qwen3.8-flash` advanced/travel#0: answer 1, weave 1. Not a real itinerary: it names no sights, gives no timing or logistics, and most sentences seem invented to host a Spanish word; it opens with a gratuitous Spanish sentence and adds 'turismo', which was not on the list.
- `deepseek/deepseek-v4.1-flash` advanced/travel#0: answer 4, weave 2. Several forced placements ('libre' then 'día libre', a stilted 'Ahora (now), here's...') plus an invented, awkward Spanish sentence and filler at the end make it harder to read.
- `deepseek/deepseek-v4.1-flash` advanced/travel#1: answer 4, weave 2. Words are forced into lines built just to hold them ('un café rápido', 'no mala choice', 'Ahora is a good time'), a tacked-on Spanish closing sentence, and an unlisted 'turismo'.
- `qwen/qwen3.8-flash` advanced/travel#1: answer 2, weave 1. Vague plan with almost no named sights or timings; almost every sentence exists to host a word ('At ahora', 'nuevas plazas', a forced 'Hoy tengo' line, an unlisted 'optimismo').
- `z-ai/glm-5.3-flash` advanced/finance#0: answer 4, weave 2. Several metaphors exist only to hold a word (right pie, campo of finance, cara of spending, budget as historia), an off-list 'consumismo' is added, and a Spanish closing sentence is tacked on.
- `deepseek/deepseek-v4.1-flash` advanced/finance#0: answer 3, weave 1. Reasoning is broken up by nonsense built to host words ('Quiero vivir en un campo con historias enteras', 'periódicos enteros'), off-list 'capitalismo' appears, and the forced metaphors make it harder to use.
- `qwen/qwen3.8-flash` advanced/finance#0: answer 2, weave 1. Answer: transport and phone are misfiled as flexible costs and the sample split lacks line items. Weave: nearly every bullet uses an invented metaphor, plus an irrelevant Spanish sentence and off-list 'turismo'.
