import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import type { Concept, Config, State, Word, WordMapping } from "./types.ts";
import type { GrammarItem } from "./grammar.ts";

export const DATA_DIR = process.env.LANGCOUCH_DIR ?? join(homedir(), ".langcouch");
const CONFIG_PATH = () => join(DATA_DIR, "config.json");
const STATE_PATH = (lang: string) => join(DATA_DIR, `state.${lang}.json`);

export const DEFAULT_CONFIG: Config = { lang: "es", native: "en", level: 2 };

function readJson<T>(path: string, what: string): T {
  const raw = readFileSync(path, "utf8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`langcouch: ${what} at ${path} is not valid JSON — fix or delete it and run \`langcouch init\``);
  }
}

export function initConfig(overrides: Partial<Config> = {}): { config: Config; created: boolean } {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(CONFIG_PATH())) {
    return { config: loadConfig(), created: false }; // idempotent: never clobber
  }
  const config: Config = { ...DEFAULT_CONFIG, ...overrides };
  writeFileSync(CONFIG_PATH(), JSON.stringify(config, null, 2));
  return { config, created: true };
}

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH())) {
    throw new Error(`langcouch: no config at ${CONFIG_PATH()} — run \`langcouch init\` first`);
  }
  const cfg = readJson<Config>(CONFIG_PATH(), "config");
  if (typeof cfg.level !== "number" || cfg.level < 1 || cfg.level > 10) {
    throw new Error(`langcouch: config level must be 1..10, got ${String(cfg.level)}`);
  }
  return cfg;
}

export function saveConfig(config: Config): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH(), JSON.stringify(config, null, 2));
}

export function loadState(lang: string): State {
  if (!existsSync(STATE_PATH(lang))) return {};
  return readJson<State>(STATE_PATH(lang), `state ${lang}`);
}

export function saveState(lang: string, state: State): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATE_PATH(lang), JSON.stringify(state, null, 2));
}

const REPO_ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
export const WORDLISTS_DIR = join(REPO_ROOT, "wordlists");
const GRAMMAR_DIR = join(REPO_ROOT, "grammar");
// User-added languages live next to progress, so they survive plugin updates
// (the plugin itself is replaced wholesale per version). A user file overrides a bundled one.
export const USER_WORDLISTS_DIR = join(DATA_DIR, "wordlists");
const USER_GRAMMAR_DIR = join(DATA_DIR, "grammar");
export const CONCEPTS_PATH = join(REPO_ROOT, "concepts.json");

let conceptsCache: Concept[] | null = null;

/** All concepts (language-independent meanings). Cached per process. */
export function loadConcepts(): Concept[] {
  if (!conceptsCache) conceptsCache = readJson<Concept[]>(CONCEPTS_PATH, "concepts");
  return conceptsCache;
}

/**
 * Canonical spelling of a language code, BCP 47 style: base lowercase, region uppercase,
 * anything else lowercase ("PT_br" → "pt-BR"). File names and state keys use this form.
 * Friendly aliases resolve first, for codes nobody can guess ("latam" → "es-419").
 */
const LANG_ALIASES: Record<string, string> = { latam: "es-419" };

export function normalizeLang(code: string): string {
  const alias = LANG_ALIASES[code.trim().toLowerCase()];
  if (alias) return alias;
  const [base = "", ...rest] = code.trim().split(/[-_]/);
  const tail = rest.map((t) => (/^([a-z]{2}|\d{3})$/i.test(t) ? t.toUpperCase() : t.toLowerCase()));
  return [base.toLowerCase(), ...tail].join("-");
}

/** Base language of a regional variant ("pt-BR" → "pt"); null for a plain code. */
export function baseLang(lang: string): string | null {
  const i = lang.indexOf("-");
  return i > 0 ? lang.slice(0, i) : null;
}

/** First existing `<lang>.json`: the user dir wins over the bundled one. */
function resolveData(userDir: string, bundledDir: string, lang: string): string | null {
  for (const dir of [userDir, bundledDir]) {
    const path = join(dir, `${normalizeLang(lang)}.json`);
    if (existsSync(path)) return path;
  }
  return null;
}

/** Path of the wordlist file for exactly this code (for a variant: its overlay), or null. */
export function wordlistPath(lang: string): string | null {
  return resolveData(USER_WORDLISTS_DIR, WORDLISTS_DIR, lang);
}

/**
 * Files that make up a language, base first. A regional variant (`pt-BR`) is a sparse
 * overlay: only the words that differ from its base (`pt`), which supplies the rest.
 */
export function wordlistLayers(lang: string): string[] {
  const own = wordlistPath(lang);
  if (!own) {
    throw new Error(`langcouch: no wordlist for "${lang}" in ${USER_WORDLISTS_DIR} or ${WORDLISTS_DIR}`);
  }
  const base = baseLang(normalizeLang(lang));
  if (!base) return [own];
  const basePath = wordlistPath(base);
  if (!basePath) {
    throw new Error(`langcouch: "${lang}" is a variant of "${base}", but there is no ${base} wordlist to build on`);
  }
  return [basePath, own];
}

/** Raw concept→lemma mapping for a language (a variant's overlay merged over its base). */
export function loadWordMapping(lang: string): WordMapping {
  const layers = wordlistLayers(lang).map((path) => readJson<WordMapping>(path, `wordlist ${lang}`));
  return Object.assign({}, ...layers) as WordMapping;
}

/** Concepts joined with their lemmas in the target language. */
export function loadWordlist(lang: string): Word[] {
  const mapping = loadWordMapping(lang);
  const concepts = new Map(loadConcepts().map((c) => [c.id, c]));
  const words: Word[] = [];
  for (const [id, lemma] of Object.entries(mapping)) {
    const c = concepts.get(id);
    if (!c) throw new Error(`langcouch: wordlist ${lang} maps unknown concept "${id}" — run tests/validate-wordlist.ts`);
    words.push({ id, target: lemma, pos: c.pos, tier: c.tier, gloss: c.gloss });
  }
  return words;
}

/** Grammar constructions for a language; a variant without its own file uses its base's; [] when none exists. */
export function loadGrammar(lang: string): GrammarItem[] {
  const base = baseLang(normalizeLang(lang));
  const path = resolveData(USER_GRAMMAR_DIR, GRAMMAR_DIR, lang) ?? (base ? resolveData(USER_GRAMMAR_DIR, GRAMMAR_DIR, base) : null);
  if (!path) return [];
  return readJson<GrammarItem[]>(path, `grammar ${lang}`);
}

function langsIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));
}

/** Language codes the user added in ~/.langcouch/wordlists/. */
export function userLangs(): string[] {
  return langsIn(USER_WORDLISTS_DIR).sort();
}

/** Every usable language code: bundled plus user-added, deduped. */
export function availableLangs(): string[] {
  return [...new Set([...langsIn(WORDLISTS_DIR), ...langsIn(USER_WORDLISTS_DIR)])].sort();
}

/** Language codes that have accumulated local state (scan of state.<lang>.json). */
export function langsWithState(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR)
    .map((f) => /^state\.([a-z]+(?:-[A-Za-z0-9]+)*)\.json$/.exec(f)?.[1])
    .filter((l): l is string => Boolean(l))
    .sort();
}
