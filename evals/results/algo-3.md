<!-- findings:start -->
## Findings

Two runs on the same learner stages, topics and models as [algo-1](algo-1.md) and [algo-2](algo-2.md). Run A (`2026-09-30T18-28-12-442Z`, commit `d9d73fa`) used the first algorithm 3 wording. Reading its replies turned up three faults: a closing glossary line listing a word the reply never used, the whole Spanish sentence used as a post headline, and a metaphor built only to host an ordinary word. Commit `6b7a2b2` fixed all three, and run B (this file's tables) uses the fixed wording. Both runs came in 120 of 120 after `--fill`.

**1. The judge first missed the known words.** Until the fix that came with these findings, `judgePrompt` told the judge about the known words and the glossary line only in cases that also had a nudge word. With no nudge word, it marked correct use of a known word (**médico**, **salud** in the budget reply) as "off-list, no translation", and it marked the closing line as "translation in a footer". Both runs were re-judged after the fix, and every score below uses the fixed judge.

**2. Weave matches or beats algorithm 2, and answer quality holds.** Run B, all stages, algorithm 2 → 3:

| model | answer | weave | Spanish /100 words |
|---|---|---|---|
| Opus | 5.0 → 4.9 | 3.9 → 4.1 | 1.0 → 1.6 |
| DeepSeek | 4.5 → 4.4 | 2.9 → 3.0 | 1.8 → 3.1 |
| GLM | 4.3 → 4.4 | 2.7 → 2.6 | 1.9 → 2.7 |
| Qwen | 3.7 → 3.8 | 2.7 → 3.2 | 1.8 → 2.7 |

Run A with the fixed judge scored weave 3.9 / 3.0 / 2.5 / 2.3, so the `6b7a2b2` wording mainly helped Qwen (2.3 → 3.2) and Opus (3.9 → 4.1). The learner sees more Spanish per 100 words than under algorithm 2, because known words come back freely without a translation.

**3. Coverage of the listed words is no higher than under algorithm 2: 20–42% against 25–55%.** The plan expected fit plus nudge to raise it clearly. It didn't, but under algorithm 3 a low number costs less: a skipped due word stays due and comes back next turn, and after three misses it takes a nudge slot. Nudge words got woven in 92–100% of cases, almost always as one closing line or a short aside (Opus: "keeps every **carretera** (road) through the function on solid ground").

**4. Deliverables stay clean: 3 of 48 copyable parts carry Spanish (algorithm 2: 3 of 48; algorithm 1: 39 of 47).** The glossary line shows up in 43 of 44 replies that used a familiar word.

**5. What is still wrong, from reading replies:**

- **The known list invites stuffing.** DeepSeek closes a clean LinkedIn post with "It's **posible** to **crear** calm from chaos, **aprender** from beta feedback, **reconocer** what to **repetir**, and **olvidar** the rest." Five known words in one sentence that exists only to hold them.
- **The whole-sentence task still produces invented sentences**, mostly from GLM ("**Ahora** el total **nuevo** empieza en cero"), and GLM leaves a stray `parte = part` line.
- **Qwen once answered the instruction instead of the task** (half/meeting: "Understood — it is **posible** to use them only where the meaning already fits."). Answer 1.

The beginner stage is the strongest of all three algorithms (weave 3.3–4.5). Half and advanced, where the known list is long, carry most of the faults above, so a cap on known words per reply is the next change to test.

**Verdict:** algorithm 3 stays the default. It matches algorithm 2 on answer and weave, beats it for Opus, DeepSeek and Qwen, gives the learner more Spanish, and its counting is honest: a word climbs only when a reply actually wove it.
<!-- findings:end -->

# Weave eval results: algorithm 3

Run `2026-09-30T18-51-43-231Z` on commit `6b7a2b2`. Logic and metric definitions: [README.md](../README.md).
Models: `deepseek/deepseek-v4.1-flash`, `opus`, `qwen/qwen3.8-flash`, `z-ai/glm-5.3-flash`. Judge: blind `opus`, scores 1-5.

## All stages

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek/deepseek-v4.1-flash | 30/30 | 27% | 0.0 | 0 | 0 | 0 | 0% | 20% | 4.4 | 3.0 | $0.098 |
| opus | 30/30 | 26% | 0.0 | 0 | 0 | 0 | 0% | 20% | 4.9 | 4.1 | subscription |
| qwen/qwen3.8-flash | 30/30 | 20% | 0.0 | 0 | 0 | 1 | 0% | 20% | 3.8 | 3.2 | $0.069 |
| z-ai/glm-5.3-flash | 30/30 | 42% | 0.1 | 0 | 3 | 0 | 5% | 60% | 4.4 | 2.6 | $0.065 |

| model | deliverables with Spanish | Spanish /100 words | nudge woven | familiar glossed inline | glossary line | known used/reply |
| --- | --- | --- | --- | --- | --- | --- |
| deepseek/deepseek-v4.1-flash | 1/12 | 3.1 | 100% | 0 | 7/7 | 2.3 |
| opus | 0/12 | 1.6 | 92% | 1 | 15/15 | 1.3 |
| qwen/qwen3.8-flash | 1/12 | 2.7 | 100% | 1 | 4/4 | 1.2 |
| z-ai/glm-5.3-flash | 1/12 | 2.7 | 92% | 1 | 17/18 | 2.1 |

## Stage: beginner (0% absorbed, level 1)

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek/deepseek-v4.1-flash | 10/10 | 53% | 0.0 | 0 | 0 | 0 | — | — | 4.5 | 3.8 | $0.017 |
| opus | 10/10 | 30% | 0.0 | 0 | 0 | 0 | — | — | 4.8 | 4.5 | subscription |
| qwen/qwen3.8-flash | 10/10 | 33% | 0.0 | 0 | 0 | 0 | — | — | 4.3 | 4.0 | $0.008 |
| z-ai/glm-5.3-flash | 10/10 | 70% | 0.0 | 0 | 0 | 0 | — | — | 4.3 | 3.3 | $0.006 |

## Stage: half (50% absorbed, level 5)

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek/deepseek-v4.1-flash | 10/10 | 17% | 0.0 | 0 | 0 | 0 | 0% | — | 4.5 | 2.9 | $0.034 |
| opus | 10/10 | 24% | 0.0 | 0 | 0 | 0 | 0% | — | 5.0 | 3.7 | subscription |
| qwen/qwen3.8-flash | 10/10 | 16% | 0.0 | 0 | 0 | 1 | 0% | — | 3.5 | 3.0 | $0.024 |
| z-ai/glm-5.3-flash | 10/10 | 39% | 0.3 | 0 | 2 | 0 | 0% | — | 4.5 | 2.7 | $0.024 |

## Stage: advanced (90% absorbed, level 8)

| model | ok | coverage | off-list/reply | bad gloss | no gloss | code/facts touched | rule used | sentence | answer (1-5) | weave (1-5) | cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| deepseek/deepseek-v4.1-flash | 10/10 | 26% | 0.1 | 0 | 0 | 0 | 0% | 20% | 4.2 | 2.4 | $0.047 |
| opus | 10/10 | 25% | 0.0 | 0 | 0 | 0 | 0% | 20% | 4.8 | 4.2 | subscription |
| qwen/qwen3.8-flash | 10/10 | 19% | 0.0 | 0 | 0 | 0 | 0% | 20% | 3.7 | 2.6 | $0.036 |
| z-ai/glm-5.3-flash | 10/10 | 36% | 0.1 | 0 | 1 | 0 | 10% | 60% | 4.3 | 1.9 | $0.034 |

## Judge notes (scores of 2 or lower)

- `deepseek/deepseek-v4.1-flash` beginner/marketing#1: answer 5, weave 2. 'a few días — or rather, a few minutes' is a self-correcting aside invented only to host the word, and 'minutes of tiempo' is clunky.
- `z-ai/glm-5.3-flash` beginner/marketing#0: answer 4, weave 2. The opening sentence seems built mainly to host both día and tiempo ('publish it any día... a minute of your tiempo'), which reads as forced.
- `deepseek/deepseek-v4.1-flash` beginner/travel#1: answer 4, weave 2. An invented opener ('Leave your casa'), a filler vida sentence and an awkward mundo line tacked onto the end read as hosts for the words rather than natural prose.
- `z-ai/glm-5.3-flash` beginner/finance#0: answer 3, weave 2. 'mano (hand) cash' and 'by mano' are forced into invented phrasing, and the Needs bullet confusingly describes automating savings.
- `opus` half/tech#0: answer 5, weave 2. 'which **estar** hiding the problem' drops an unconjugated infinitive into a technical fact, and the door metaphor is invented mainly to host **cerrado**, which the aside exception does not cover.
- `z-ai/glm-5.3-flash` half/marketing#0: answer 5, weave 2. Invented filler sentences host 'equivocado' and 'un año' (the 'not un año' line exists only to fit the word). The post itself is strong.
- `z-ai/glm-5.3-flash` beginner/finance#1: answer 4, weave 1. All three words lack the required translations and are forced in: 'tiempo freedom' is an invented phrase, 'each día you get paid' is awkward, and 'a better mano' is a pun that doesn't work. Separately, $150 biweekly does not reach the $600/month savings target.
- `deepseek/deepseek-v4.1-flash` half/tech#1: answer 5, weave 2. Final line is garbled ('explicar (to explain) aside:'), so the Spanish reads as jammed-in fragments that muddle the closing takeaway.
- `z-ai/glm-5.3-flash` half/meeting#0: answer 4, weave 2. The opening sentence is built to host words: 'las noticias', a framing about protecting the release's 'éxito', and an added 'temprano' that nobody in the meeting said. The migration-risk due date is invented.
- `qwen/qwen3.8-flash` half/meeting#0: answer 1, weave 1. It gives no summary, decisions or action items, only a meta remark about the Spanish words.
- `deepseek/deepseek-v4.1-flash` half/marketing#1: answer 4, weave 1. Forced phrases like 'bien written', 'igual well', 'cerca to the end' and a sentence invented just to host 'noticia'.
- `z-ai/glm-5.3-flash` half/travel#0: answer 3, weave 2. It ends in a broken, unfinished closing line. Spanish is forced in: 'a mes's worth of sights', 'largo panoramas', 'andar down' used as an English verb, and an invented niño/árbol scene. List words also lack translations.
- `qwen/qwen3.8-flash` half/travel#0: answer 3, weave 2. 'keep it light with a fruta grande' is an invented, odd lunch suggestion made only to host words, and it hurts the advice.
- `deepseek/deepseek-v4.1-flash` half/travel#1: answer 4, weave 2. Several words are forced: 'Then andar through Alfama' is broken grammar, 'the castle is cerca, so...' makes odd logic, and 'which is grande' is filler.
- `qwen/qwen3.8-flash` half/travel#1: answer 2, weave 2. The plan is vague and names almost no places. 'If time is posible' is awkward, and the niño clause was invented to host the word.
- `z-ai/glm-5.3-flash` half/finance#1: answer 4, weave 2. The 'cabeza' line is invented to host the word, 'crear' and 'olvidar' are verbs forced into English sentences, and nested bold breaks the formatting.
- `deepseek/deepseek-v4.1-flash` half/finance#1: answer 4, weave 2. The 'per cabeza' line is contrived, 'gastos' is off-list, the 'cocina line' points to a category that doesn't exist, and too many words are packed into one paragraph.
- `deepseek/deepseek-v4.1-flash` half/finance#0: answer 4, weave 2. Opening packs six Spanish words together, including the invented 'clear cabeza' metaphor and stilted 'Contar every dollar'.
- `z-ai/glm-5.3-flash` advanced/tech#0: answer 5, weave 2. The closing aside is a full invented Spanish sentence built to host viaje and posible, which the exception does not cover, on top of dense insertions throughout the prose.
- `z-ai/glm-5.3-flash` advanced/marketing#1: answer 4, weave 1. The intro invents a Spanish sentence and a room/food metaphor just to host words, and the notes cram in rápido, ejemplo, posible, temprano and respuestas.
- `z-ai/glm-5.3-flash` advanced/meeting#0: answer 4, weave 2. The opening and closing sentences exist only to host pasar, noticia, parte and venir; 'wouldn't pasar' is awkward and the closing Spanish line adds nothing.
- `qwen/qwen3.8-flash` advanced/meeting#0: answer 3, weave 1. Drops Tom's migration-risk item and the Oct 22 review; the opener is built to host words, uses off-list 'Las decisiones', and 'moves despacio' misstates the deferral.
- `z-ai/glm-5.3-flash` advanced/tech#1: answer 4, weave 2. Invents a whole Spanish sentence ('Ahora el total nuevo empieza en cero') only to host words, and forces 'posible' where the loop never running on an empty array is certain, not possible.
- `deepseek/deepseek-v4.1-flash` advanced/tech#1: answer 4, weave 2. Adds filler sentences to host words ('El viaje…', 'This fix is posible'), and the closing aside is meta and garbled ('a hablar aside').
- `z-ai/glm-5.3-flash` advanced/meeting#1: answer 5, weave 2. The full Spanish clause 'las otras partes vienen después' is built to host words and then translated in parentheses, which is forced rather than a natural substitution.
- `qwen/qwen3.8-flash` advanced/marketing#0: answer 3, weave 2. Has only two body paragraphs instead of three and no clearly marked headline; the opening line about the noticia not needing to be grande was invented just to host those words.
- `deepseek/deepseek-v4.1-flash` advanced/marketing#0: answer 4, weave 1. The closing paragraph about each task getting a habitación exists only to cram in habitación, ejemplo, respuesta and six more words, and it adds confusing clutter after a solid post.
- `z-ai/glm-5.3-flash` advanced/marketing#0: answer 4, weave 2. The preface about comida, cocina and años and the added Spanish pitch line for habitación were invented to host words, though the craft-note uses fit fine.
- `qwen/qwen3.8-flash` advanced/travel#0: answer 3, weave 2. The closing 'Language aside' sentence exists only to host words and has nothing to do with Lisbon.
- `z-ai/glm-5.3-flash` advanced/travel#0: answer 4, weave 2. It invents a Spanish sentence about the monastery, a window-table detail just to host 'ventana', the off-list 'casas bonitas', and 'sirven' glossed as 'to serve'.
- `deepseek/deepseek-v4.1-flash` advanced/travel#1: answer 4, weave 2. 'decidir a tight but doable loop' is ungrammatical, 'cocina grande of stalls' is forced, and the inserted Spanish sentence 'La cocina grande está cerca' exists only to host words.
- `qwen/qwen3.8-flash` advanced/travel#1: answer 3, weave 1. Most words are forced: 'coffee near a ventana', 'slow andar', 'modest precio' and an invented closing sentence about a big window by the river.
- `deepseek/deepseek-v4.1-flash` advanced/finance#1: answer 3, weave 1. Weave: forced grammar ('the primero step'), a pile of crammed-in words (contar, cerca, posible, temprano, cocina, médico) and a Spanish sentence invented just to host words.
- `z-ai/glm-5.3-flash` advanced/finance#1: answer 4, weave 1. Weave: invented Spanish motto, off-list words (metas, gastos, consumismo), a hybrid 'crear-ing' and unbolded 'olvidar' all get in the way of the reply.
- `z-ai/glm-5.3-flash` advanced/finance#0: answer 4, weave 2. Forced sentence 'Los meses malos son posibles', off-list 'compras grandes', and awkward 'cerca of' and 'single grande expense' that misstates 'biggest'.
- `deepseek/deepseek-v4.1-flash` advanced/finance#0: answer 4, weave 1. Ungrammatical 'a malo budget is one you olvidar', a tacked-on sentence 'Primero, contar los gastos grandes', and clunky 'Contar every dollar' all hurt readability.
- `qwen/qwen3.8-flash` advanced/finance#0: answer 4, weave 2. Invented sentence 'Los centros grandes son caros', redundant 'Start primero', and a nonsensical tie-in 'supports your salud'.
