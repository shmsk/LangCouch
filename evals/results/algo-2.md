<!-- findings:start -->
## Findings

Run of 2026-09-30 on the same learner, topics and models as [algo-1](algo-1.md). 120 of 120 replies came in, with no timeouts after the retry and the 300 s limit. The instruction also gained the deliverables rule, so the difference from algorithm 1 is two changes at once.

**1. Quality went up for every model.** Answer and weave scores, algorithm 1 → 2:

| model | answer | weave |
|---|---|---|
| DeepSeek | 3.7 → 4.5 | 1.8 → 2.9 |
| Qwen | 2.6 → 3.7 | 1.5 → 2.7 |
| GLM | 4.3 → 4.3 | 2.4 → 2.7 |
| Opus | 4.9 → 5.0 | 3.3 → 3.9 |

**2. Coverage fell hard.** Opus now weaves 23% of the listed words, the others 28–50%. The rule word dropped from 75–95% to 10–25%. Fit-only works as intended: words that don't fit get skipped. But the scheduler still counts a skipped word as shown, so progress would be overstated. Honest counting (only words actually woven) is required before algorithm 2 or 3 can become the default.

**3. The deliverables rule is only partly followed.** 13 of 24 LinkedIn posts still contain a glossed Spanish word. It needs a stronger formulation or a check.

**4. Metric note.** "code/facts touched" is mostly `missing Maya` in the meeting summary. Maya has no action item of her own, so leaving her name out is a fair summary. That `mustKeep` is too strict and should drop Maya.
<!-- findings:end -->

# Weave eval results: algorithm 2

Run `2026-09-30T17-47-59-616Z` on commit `05b97a9`. Logic and metric definitions: [README.md](../README.md).
Models: `deepseek/deepseek-v4.1-flash`, `opus`, `z-ai/glm-5.3-flash`, `qwen/qwen3.8-flash`. Judge: blind `opus`, scores 1-5.

## All stages

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek/deepseek-v4.1-flash | 30/30 | 43% | 0.0 | 0 | 5 | 1 | 15% | 50% | 4.5 | 2.9 | $0.048 |
| opus | 30/30 | 23% | 0.0 | 0 | 5 | 1 | 15% | 30% | 5.0 | 3.9 | subscription |
| z-ai/glm-5.3-flash | 30/30 | 50% | 0.0 | 0 | 10 | 4 | 25% | 80% | 4.3 | 2.7 | $0.053 |
| qwen/qwen3.8-flash | 30/30 | 28% | 0.0 | 0 | 2 | 3 | 10% | 40% | 3.7 | 2.7 | $0.065 |

## Stage: beginner (0% absorbed, level 1)

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek/deepseek-v4.1-flash | 10/10 | 37% | 0.0 | 0 | 0 | 0 | — | — | 4.8 | 4.3 | $0.007 |
| opus | 10/10 | 30% | 0.0 | 0 | 0 | 0 | — | — | 4.9 | 3.9 | subscription |
| z-ai/glm-5.3-flash | 10/10 | 50% | 0.0 | 0 | 0 | 1 | — | — | 4.1 | 3.4 | $0.007 |
| qwen/qwen3.8-flash | 10/10 | 20% | 0.0 | 0 | 0 | 2 | — | — | 4.1 | 3.6 | $0.007 |

## Stage: half (50% absorbed, level 5)

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek/deepseek-v4.1-flash | 10/10 | 47% | 0.0 | 0 | 0 | 1 | 20% | — | 4.4 | 2.3 | $0.019 |
| opus | 10/10 | 20% | 0.0 | 0 | 1 | 0 | 30% | — | 5.0 | 3.3 | subscription |
| z-ai/glm-5.3-flash | 10/10 | 47% | 0.0 | 0 | 4 | 2 | 30% | — | 4.2 | 2.3 | $0.017 |
| qwen/qwen3.8-flash | 10/10 | 33% | 0.0 | 0 | 0 | 0 | 10% | — | 3.7 | 2.8 | $0.019 |

## Stage: advanced (90% absorbed, level 8)

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek/deepseek-v4.1-flash | 10/10 | 41% | 0.1 | 0 | 5 | 0 | 10% | 50% | 4.3 | 2.2 | $0.023 |
| opus | 10/10 | 23% | 0.0 | 0 | 4 | 1 | 0% | 30% | 5.0 | 4.4 | subscription |
| z-ai/glm-5.3-flash | 10/10 | 51% | 0.0 | 0 | 6 | 1 | 20% | 80% | 4.6 | 2.4 | $0.028 |
| qwen/qwen3.8-flash | 10/10 | 27% | 0.0 | 0 | 2 | 1 | 10% | 40% | 3.4 | 1.7 | $0.038 |

## Judge notes (scores of 2 or lower)

- `z-ai/glm-5.3-flash` beginner/tech#0: answer 5, weave 2. 'each tiempo through the loop' uses tiempo in the wrong sense: 'time' as an occurrence is 'vez' in Spanish.
- `qwen/qwen3.8-flash` beginner/tech#0: answer 5, weave 2. 'the loop spends no tiempo updating it' is a contrived phrasing made up to host the word.
- `opus` beginner/tech#0: answer 5, weave 1. It repeats the wrong-sense 'each tiempo through the loop' and forces tiempo into the technical term 'compile time', without the (translation) format.
- `z-ai/glm-5.3-flash` beginner/tech#1: answer 4, weave 2. The clause 'no extra check needed each tiempo (time) through the loop' seems added just to host the word, and 'tiempo' is the wrong sense of 'time' here (Spanish uses 'vez' for an occurrence), so it teaches a mistranslation.
- `z-ai/glm-5.3-flash` beginner/marketing#1: answer 4, weave 2. The post is strong, but año appears only in an appended timing tip that seems invented to host the word, and the post claims features (owners, deadlines) the brief never mentioned.
- `qwen/qwen3.8-flash` beginner/travel#0: answer 5, weave 2. Uses no Spanish words at all, and even writes 'keep an eye on your phone' where ojo fit naturally.
- `z-ai/glm-5.3-flash` beginner/travel#0: answer 4, weave 2. Invents claims just to host words: eating nata by hand as 'the proper way' and 'famously low' tram doorways for cabeza, which adds dubious information.
- `qwen/qwen3.8-flash` beginner/travel#1: answer 4, weave 2. Opening sentence exists only to host 'ojo' and sits oddly before the plan starts.
- `z-ai/glm-5.3-flash` half/tech#0: answer 4, weave 2. 'inicialización' is not on the list and sits on a technical term; 'el ojo' and 'días' live in a closing sentence invented to host them.
- `opus` half/tech#0: answer 5, weave 2. Its only Spanish word, 'función', is not on the list and is dropped into the code explanation. None of the given words are used.
- `deepseek/deepseek-v4.1-flash` half/tech#1: answer 5, weave 2. The día sentence is filler written to host the word, and inicialización is not on the given list.
- `z-ai/glm-5.3-flash` half/marketing#0: answer 5, weave 2. The 'angle notes' paragraph exists mainly to host the Spanish words ('a lugar to land', 'call to acción'), and 'acción' was not on the given list.
- `deepseek/deepseek-v4.1-flash` half/marketing#0: answer 4, weave 2. 'una forma to frame it' is awkward, and the closing 'In my own framing' sentence was invented only to fit cabeza, posible and momento.
- `z-ai/glm-5.3-flash` half/marketing#1: answer 5, weave 2. Keeps the post clean, but the 'forma' sentence is forced and a notifications bullet seems invented to host 'notificaciones', which isn't on the list.
- `deepseek/deepseek-v4.1-flash` half/marketing#1: answer 4, weave 2. 'take un momento to frame it' and 'That's una forma to share it' are awkward sentences built just to host the words.
- `z-ai/glm-5.3-flash` half/meeting#0: answer 4, weave 2. Both Spanish words sit in sentences invented to host them; 'Don't olvidar' is broken grammar, and the closing line wrongly says the coupon decision is made at the Oct 22 review.
- `deepseek/deepseek-v4.1-flash` half/meeting#0: answer 5, weave 2. Uses 'estimación', which is not on the list, and 'las partes (the parts) restantes — the remaining parts —' is a redundant mixed-language phrase that hurts readability.
- `z-ai/glm-5.3-flash` half/meeting#1: answer 4, weave 2. Framing lines are invented to host words, it adds meta-commentary about the Spanish, and it uses 'migración', which is not in the list; only 'olvidar' sits naturally.
- `deepseek/deepseek-v4.1-flash` half/meeting#1: answer 4, weave 1. The preamble exists only to host words, is meta and awkward, and adds 'decisión', which is not in the list.
- `deepseek/deepseek-v4.1-flash` half/travel#0: answer 5, weave 2. The opening 'pregunta buena… respuesta rápida' and 'I won't repetir every option' are invented just to host words, and they add extra Spanish.
- `qwen/qwen3.8-flash` half/travel#0: answer 3, weave 1. The opening paragraph ('A caso bonito is an idea clara', 'That razón gives you…') is nonsensical filler built around the words.
- `deepseek/deepseek-v4.1-flash` half/travel#1: answer 4, weave 2. The opening lines ('Good pregunta', 'Here's a respuesta', 'one-day caso') are filler invented to host words, and 'pick one ejemplo from Belém' is awkward.
- `qwen/qwen3.8-flash` half/travel#1: answer 3, weave 2. 'My respuesta fácil is:', 'a smoother caso' and 'If the pregunta is where to eat' are forced constructions added to fit the words.
- `qwen/qwen3.8-flash` half/finance#0: answer 3, weave 2. 'coches caros' and 'viajes largos/turismo' read as sentences built to host words, and 'turismo' is not on the given list
- `z-ai/glm-5.3-flash` half/finance#0: answer 2, weave 1. Says '10 percentage points for wants' against its own 30% split, and has a garbled tracking sentence; the words lack translations and one hosts a rambling vignette the reply then retracts
- `qwen/qwen3.8-flash` half/finance#1: answer 3, weave 2. Several sentences exist only to host words (coches viejos, escuela, carretera commute, a one-hora setup), and they pad and sidetrack the budget advice.
- `qwen/qwen3.8-flash` advanced/tech#0: answer 5, weave 2. The fix and explanation are correct, but the tacked-on Spanish sentence exists only to host 'respuesta' and adds nothing.
- `z-ai/glm-5.3-flash` advanced/tech#0: answer 4, weave 2. The answer is correct, but it crams in six words, including an invented Spanish sentence and a forced 'ojo' idiom, which clutters the explanation.
- `z-ai/glm-5.3-flash` advanced/tech#1: answer 4, weave 2. Full Spanish sentences are invented to host words, 'declaración' is not on the list, and the claim that the bare let evolves to any and gives no warning is misleading (TS infers number | undefined).
- `deepseek/deepseek-v4.1-flash` advanced/tech#1: answer 3, weave 1. The closing Spanish lines are nonsensical filler built to host words, and 'posible non-empty inputs' makes the explanation confusing.
- `qwen/qwen3.8-flash` advanced/tech#1: answer 4, weave 2. 'The fix is posible' is awkward, and the final Spanish sentence is invented just to host words and adds no meaning.
- `qwen/qwen3.8-flash` advanced/marketing#0: answer 2, weave 1. The post has no call to action to join the beta, and its 'paragraphs' are one-line fragments. The weave uses an awkward 'un proyecto (a project)' and adds a Spanish sentence invented just to host a word.
- `deepseek/deepseek-v4.1-flash` advanced/marketing#1: answer 5, weave 2. 'I'll hablar plainly' and the closing line exist only to host olvidado/repetir; that closer adds nothing useful.
- `z-ai/glm-5.3-flash` advanced/marketing#1: answer 5, weave 1. 'ven back and I'll repetir' is forced, and the invented all-Spanish tagline sits right after the post where it could be pasted by mistake.
- `deepseek/deepseek-v4.1-flash` advanced/meeting#0: answer 3, weave 2. Invents a 'courier dependency' not in the meeting; 'trabajar on writing up' is forced and the Spanish heading 'Las decisiones' makes the summary harder to reuse.
- `qwen/qwen3.8-flash` advanced/meeting#0: answer 4, weave 1. No Spanish words were woven in at all.
- `qwen/qwen3.8-flash` advanced/meeting#1: answer 5, weave 2. The only Spanish word sits in a meta sentence written just to announce it, so it isn't replacing any natural English.
- `z-ai/glm-5.3-flash` advanced/meeting#1: answer 5, weave 2. It adds a standalone Spanish sentence plus forced phrasings ('plenty to trabajar through') purely to host words.
- `deepseek/deepseek-v4.1-flash` advanced/meeting#1: answer 5, weave 1. The opening paragraph is stuffed with Spanish words in invented meta-commentary, and the closing 'pasa' line exists only to host a word.
- `qwen/qwen3.8-flash` advanced/travel#0: answer 3, weave 1. Thin plan, and it closes on an invented Spanish sentence ('tu piel quiere aire libre') plus forced phrases like 'tired piel' and 'not malo'.
- `deepseek/deepseek-v4.1-flash` advanced/travel#0: answer 4, weave 2. Opens with an invented first-person Spanish sentence, and 'By ahora' is misused and left untranslated.
- `qwen/qwen3.8-flash` advanced/travel#1: answer 2, weave 1. The plan is thin and muddled ('rápido but unhurried', 'aprender the route before riding'), and nearly every word is forced in, ending with an invented nonsense sentence.
- `z-ai/glm-5.3-flash` advanced/finance#0: answer 4, weave 2. Several words need invented content to fit: a cracked diente, the budget's friendly cara, and a closing Spanish slogan that adds nothing to the budget advice.
- `deepseek/deepseek-v4.1-flash` advanced/finance#0: answer 4, weave 2. 'dólares enteros' is forced, and the Spanish check sentence about living on a whole income is filler added only to host words.
- `qwen/qwen3.8-flash` advanced/finance#0: answer 3, weave 2. Answer applies 50/30/20 without adjusting for rent on $3,000, which limits usefulness; weave uses the off-list word perfeccionismo and ends with an invented Spanish sentence ('cada día') that contradicts the weekly review advice.
- `qwen/qwen3.8-flash` advanced/finance#1: answer 3, weave 2. A 'use whole numbers' step and a standalone Spanish sentence were invented only to host 'enteros'; the budget reasoning is thin.
- `z-ai/glm-5.3-flash` advanced/finance#1: answer 4, weave 1. It forces in campo (field of work), periódico, cracked diente, right pie and historia, adds perfeccionismo, which was not on the list, and ends with a filler Spanish sentence.
