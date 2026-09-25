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
const CONCEPTS_PATH = join(REPO_ROOT, "concepts.json");

let conceptsCache: Concept[] | null = null;

/** All concepts (language-independent meanings). Cached per process. */
export function loadConcepts(): Concept[] {
  if (!conceptsCache) conceptsCache = readJson<Concept[]>(CONCEPTS_PATH, "concepts");
  return conceptsCache;
}

/** Raw concept→lemma mapping for a language. */
export function loadWordMapping(lang: string): WordMapping {
  const path = join(WORDLISTS_DIR, `${lang}.json`);
  if (!existsSync(path)) {
    throw new Error(`langcouch: no wordlist for "${lang}" at ${path}`);
  }
  return readJson<WordMapping>(path, `wordlist ${lang}`);
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

const GRAMMAR_DIR = join(REPO_ROOT, "grammar");

/** Grammar constructions for a language; [] when the language has no grammar file yet. */
export function loadGrammar(lang: string): GrammarItem[] {
  const path = join(GRAMMAR_DIR, `${lang}.json`);
  if (!existsSync(path)) return [];
  return readJson<GrammarItem[]>(path, `grammar ${lang}`);
}

/** Language codes that ship a wordlist (scan of wordlists/*.json). */
export function availableLangs(): string[] {
  return readdirSync(WORDLISTS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length))
    .sort();
}

/** Language codes that have accumulated local state (scan of state.<lang>.json). */
export function langsWithState(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  return readdirSync(DATA_DIR)
    .map((f) => /^state\.([a-z-]+)\.json$/.exec(f)?.[1])
    .filter((l): l is string => Boolean(l))
    .sort();
}
