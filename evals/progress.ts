/**
 * Live progress bars for a weave-eval run, from another terminal:
 *
 *   bun evals/progress.ts [evals/out/<run>] [--reps 2]
 *
 * Reads the run's replies.jsonl and judge.jsonl as they grow; defaults to the latest run.
 * Exits when every model and the judge are done.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { renderLanes, type Lane } from "./progress-view.ts";

const DIR = import.meta.dir;
const argv = process.argv.slice(2);
const repsAt = argv.indexOf("--reps");
const reps = repsAt >= 0 ? Number(argv[repsAt + 1]) : 2;
const runArg = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--reps");
const run = runArg ?? join(DIR, "out", readdirSync(join(DIR, "out")).sort().pop()!);

const stages = (JSON.parse(readFileSync(join(DIR, "stages.json"), "utf8")) as { stages: unknown[] }).stages.length;
const topics = (JSON.parse(readFileSync(join(DIR, "topics.json"), "utf8")) as unknown[]).length;
const perModel = stages * topics * reps;

const lines = (f: string) => (existsSync(join(run, f)) ? readFileSync(join(run, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { model?: string; error?: string }) : []);
let tick = 0, drawn = 0;
function draw(): boolean {
  const replies = lines("replies.jsonl");
  const judged = lines("judge.jsonl");
  const lanes: Lane[] = [...new Set(replies.map((r) => r.model!))].map((m) => {
    const mine = replies.filter((r) => r.model === m);
    return { name: m, done: mine.length, total: perModel, errors: mine.filter((r) => r.error).length };
  });
  lanes.push({ name: "judge (opus, blind)", done: judged.length, total: perModel, errors: judged.filter((j) => j.error).length });
  const out = renderLanes(`Weave eval ${run.split("/").pop()}`, lanes, tick++);
  if (drawn) process.stdout.write(`\x1b[${drawn}A\x1b[J`);
  process.stdout.write(out.join("\n") + "\n");
  drawn = out.length;
  return judged.length >= perModel;
}

while (!draw()) await Bun.sleep(150);
