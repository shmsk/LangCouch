/**
 * brew-style progress view: a header, then one row per lane with a spinner or ✔,
 * a # bar, and a right-aligned count. Redraws in place on a TTY.
 */
export interface Lane { name: string; done: number; total: number; errors: number }

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

export function renderLanes(title: string, lanes: Lane[], tick: number, width = process.stdout.columns || 100): string[] {
  const nameW = Math.max(...lanes.map((l) => l.name.length), 10) + 2;
  const countW = 22;
  const barW = Math.max(10, width - nameW - countW - 4);
  const rows = lanes.map((l) => {
    const finished = l.done >= l.total;
    const mark = finished ? green("✔") : blue(SPIN[tick % SPIN.length]!);
    const bar = "#".repeat(Math.round((barW * Math.min(l.done, l.total)) / l.total)).padEnd(barW);
    const state = finished ? "Done" : l.done === 0 ? "Waiting" : "Running";
    const count = `${state.padEnd(8)} ${String(l.done).padStart(3)}/${l.total}${l.errors ? red(` ✗${l.errors}`) : ""}`;
    return `${mark} ${l.name.padEnd(nameW)}${finished ? " ".repeat(barW) : bar}  ${count}`;
  });
  return [`${blue("==>")} ${bold(title)}`, ...rows];
}

/** Draws lanes in place every 120 ms; call stop() to leave the final frame on screen. */
export function liveView(title: string, lanes: () => Lane[]) {
  let tick = 0, drawn = 0;
  const draw = () => {
    const out = renderLanes(title, lanes(), tick++);
    if (drawn) process.stderr.write(`\x1b[${drawn}A\x1b[J`);
    process.stderr.write(out.join("\n") + "\n");
    drawn = out.length;
  };
  draw();
  const timer = setInterval(draw, 120);
  return { stop: () => { clearInterval(timer); draw(); } };
}
