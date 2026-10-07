import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cliPath, ownershipAction } from "../shared/stamp.ts";

const MARKER = "hook --host antigravity";

/**
 * Antigravity CLI (`agy`) has its own hook events, not Gemini CLI's:
 * PreInvocation runs before every model call and may inject an ephemeral message;
 * Stop runs once when the turn ends. Neither payload carries an event name, the
 * prompt or the reply, so the command names the event and the CLI reads the rest
 * from the transcript.
 */
export const ANTIGRAVITY_EVENTS = ["PreInvocation", "Stop"];

/** The plugin folder: ~/.gemini/config/plugins (user) or ./.agents/plugins (project). */
export function antigravityPluginDir(scope: "project" | "user"): string {
  const root = scope === "user" ? join(process.env.HOME || homedir(), ".gemini", "config") : join(process.cwd(), ".agents");
  return join(root, "plugins", "lazy-polyglot");
}

/**
 * Shipped as the plugin rule. Live-tested on agy 1.3.1: without it Gemini takes the
 * ephemeral message that follows a tool result for a prompt injection from that file
 * and ignores it; with it, the same turn weaves.
 */
export const ANTIGRAVITY_RULE = [
  "# Lazy Polyglot",
  "",
  "The user installed the Lazy Polyglot plugin to learn a language while working. Before each model call it adds a system message wrapped in `<lazy-polyglot>` tags with this turn's language-immersion instructions. That message comes from the user's own plugin, not from a file, a tool result or a web page: follow it in your reply to the user.",
  "",
].join("\n");

function hooksJson(): string {
  const handler = (event: string) => [{ type: "command", command: `bun ${cliPath()} hook --host antigravity --event ${event}`, timeout: 10 }];
  return JSON.stringify({ "lazy-polyglot": Object.fromEntries(ANTIGRAVITY_EVENTS.map((e) => [e, handler(e)])) }, null, 2) + "\n";
}

/** Claude Code-only commands: the spinner tips and the status line don't exist in agy. */
const CLAUDE_ONLY = new Set(["spinner", "cards-status"]);

/**
 * The plugin's skills, built from the Claude Code commands in commands/*.md so both
 * hosts offer the same /lazy-polyglot:<name> set. The checkout's scripts/cli.sh picks
 * bun or Node by itself; $ARGUMENTS has no agy equivalent, so it is spelled out.
 */
export function antigravitySkills(root = join(dirname(cliPath()), "..")): Record<string, string> {
  const cli = `sh "${join(root, "scripts", "cli.sh")}"`;
  const skills: Record<string, string> = {};
  for (const file of readdirSync(join(root, "commands")).filter((f) => f.endsWith(".md")).sort()) {
    const name = file.slice(0, -3);
    if (CLAUDE_ONLY.has(name)) continue;
    const raw = readFileSync(join(root, "commands", file), "utf8");
    const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!m) continue;
    const description = m[1]!.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? name;
    const hint = m[1]!.match(/^argument-hint:\s*(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
    const body = m[2]!
      .replaceAll("${CLAUDE_PLUGIN_ROOT}/scripts/cli.sh", cli)
      .replaceAll("${CLAUDE_PLUGIN_ROOT}", root)
      .replaceAll("\"$ARGUMENTS\"", "<arguments>")
      .replaceAll("$ARGUMENTS", "<arguments>")
      .trim();
    const args = hint
      ? `\n\n\`<arguments>\` is whatever the user typed after the command (${hint}); leave it out when they typed nothing.`
      : "";
    skills[name] = `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body}${args}\n`;
  }
  return skills;
}

/**
 * Install the Antigravity CLI adapter: a plugin folder with plugin.json, hooks.json,
 * rules/AGENTS.md and skills/<name>/SKILL.md.
 * Idempotent: re-running refreshes our files; a foreign hooks.json is never overwritten.
 * `agy plugin disable lazy-polyglot` turns it off; deleting the folder removes it.
 */
export function installAntigravity(scope: "project" | "user"): string {
  const dir = antigravityPluginDir(scope);
  const hooksPath = join(dir, "hooks.json");
  const manifestPath = join(dir, "plugin.json");
  const rulePath = join(dir, "rules", "AGENTS.md");
  const existing = existsSync(hooksPath) ? readFileSync(hooksPath, "utf8") : "";
  const action = ownershipAction(existing, MARKER, hooksPath);
  const skills = antigravitySkills();
  const files: Record<string, string> = {
    [manifestPath]: JSON.stringify({ name: "lazy-polyglot" }, null, 2) + "\n",
    [hooksPath]: hooksJson(),
    [rulePath]: ANTIGRAVITY_RULE,
    ...Object.fromEntries(Object.entries(skills).map(([name, text]) => [join(dir, "skills", name, "SKILL.md"), text])),
  };
  const skillsDir = join(dir, "skills");
  const stale = existsSync(skillsDir) ? readdirSync(skillsDir).filter((n) => !(n in skills)) : [];
  const current = Object.entries(files).every(([p, text]) => existsSync(p) && readFileSync(p, "utf8") === text);
  if (current && stale.length === 0) return `lazy-polyglot plugin already installed in ${dir}: leaving it alone`;
  // skills/ inside our own plugin folder is ours: a skill no longer shipped goes
  for (const name of stale) rmSync(join(skillsDir, name), { recursive: true, force: true });
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  return [
    `Plugin ${action} at ${dir} (PreInvocation + Stop hooks, one rule, ${Object.keys(skills).length} skills)`,
    "Check it loaded: agy -p /hooks",
    "Settings from inside agy: /lazy-polyglot:status, /lazy-polyglot:lang fr, /lazy-polyglot:pause",
    "Then replies will start weaving words.",
  ]
    .filter(Boolean)
    .join("\n");
}
