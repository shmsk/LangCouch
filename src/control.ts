import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * "Switch Lazy Polyglot to French" said in plain words: without a hint the agent has to
 * dig through the plugin to find out how (live Codex run: 46k tokens for one setting).
 * When the user's own message talks about the plugin or about switching the language
 * being learned, the instruction carries the exact command. A cheap signal in Russian,
 * English or Uzbek; a false hit costs one line.
 */
const LANGUAGE_WORD =
  "(language|lang|french|spanish|italian|portuguese|german|english|turkish|uzbek|russian|" +
  "язык|французск|испанск|итальянск|португальск|немецк|английск|турецк|узбекск|" +
  "til|fransuz|ispan|italyan|portugal|nemis|ingliz|turk)";
const CONTROL = [
  /lazy[\s-]?polyglot|langcouch|ленив\S*\s+полиглот/,
  new RegExp(`\\b(switch|change|set|move)\\b.{0,40}\\b(to|into)\\b.{0,20}${LANGUAGE_WORD}`),
  new RegExp(`\\b(switch|change)\\b.{0,20}\\b(the\\s+|my\\s+)?(target\\s+)?language\\b`),
  new RegExp(`(переключи|смени|поменяй|поставь|переведи|хочу\\s+учить|давай\\s+учить)\\S*.{0,40}${LANGUAGE_WORD}`),
  new RegExp(`(tilni|tilga).{0,30}(almashtir|o['ʻ‘’]?zgartir|o['ʻ‘’]?tkaz)`),
];

export function detectControl(prompt: string): boolean {
  const p = prompt.toLowerCase();
  return CONTROL.some((re) => re.test(p));
}

/** The settings command for this checkout: the wrapper picks bun or Node by itself. */
export function controlCommand(cliFile = fileURLToPath(import.meta.url)): string {
  return `sh "${resolve(dirname(cliFile), "..", "scripts", "cli.sh")}"`;
}

/**
 * Inside the Claude Code plugin (its hooks get CLAUDE_PLUGIN_ROOT) the slash commands exist, so
 * the line only points the user at them; other hosts get the shell command to run.
 */
export const claudeControlLine =
  "The user is asking about Lazy Polyglot settings. Do not run anything: tell them, in one line, to type `/lazy-polyglot:lang <code>` (`/lazy-polyglot:lang` lists the codes), or `/lazy-polyglot:level`, `/lazy-polyglot:pause`, `/lazy-polyglot:resume`, `/lazy-polyglot:status`.";

export const controlLine = (cmd: string) =>
  `The user is asking about Lazy Polyglot settings. To change them, run \`${cmd} lang <code>\` (\`${cmd} lang\` lists the codes), or \`${cmd} level <1-10|up|down>\`, \`${cmd} pause\`, \`${cmd} resume\`, \`${cmd} status\`. Then confirm in one line.`;

/**
 * "Why does Lazy Polyglot keep showing the same words?" The plugin is young and moves fast,
 * so the first answer to a problem is often "it's fixed in a newer version". When the user's
 * message names the plugin (or its woven words) and sounds like trouble, the instruction
 * carries that recommendation and the troubleshooting doc, so the agent doesn't dig through
 * the code first. Russian, English or Uzbek; a false hit costs one line.
 */
const PLUGIN_NAME = /lazy[\s-]?polyglot|langcouch|ленив\S*\s+полиглот/;
const WOVEN_WORDS =
  /(foreign|italian|spanish|french|portuguese|german|turkish|woven|bold)\s+words|(иностранн|итальянск|испанск|французск|португальск|немецк|турецк|вплетённ|вплетенн)\S*\s+слов/;
const TROUBLE =
  /\b(why|not working|doesn'?t work|does not work|stopped|broken|bug|error|wrong|weird|issue|problem)\b|почему|зачем|не работает|перестал|сломал|ошибк|баг|глюч|странн|nega|ishlamay|xato/;

export function detectTrouble(prompt: string): boolean {
  const p = prompt.toLowerCase();
  return (PLUGIN_NAME.test(p) || WOVEN_WORDS.test(p)) && TROUBLE.test(p);
}

const TROUBLESHOOTING_DOC = (cliFile: string) => resolve(dirname(cliFile), "..", "docs", "TROUBLESHOOTING.md");

/** The recommendation itself: check for a newer version first, then the doc. The agent updates nothing. */
export const troubleLine = (version: string, cliFile = fileURLToPath(import.meta.url)) =>
  `The user may be reporting a Lazy Polyglot problem. Installed version: ${version}. As a first step, recommend checking for a newer version (CHANGELOG: https://github.com/shmsk/lazy-polyglot/blob/main/CHANGELOG.md), since it may already be fixed; just say it in one line, don't update anything yourself. Then help using ${TROUBLESHOOTING_DOC(cliFile)}.`;
