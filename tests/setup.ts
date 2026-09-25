// Preloaded before every test file (bunfig.toml): one throwaway LANGCOUCH_DIR for the
// whole run. The store resolves DATA_DIR once at module load and the module is shared
// across files, so per-file sandboxes would depend on file order.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.LANGCOUCH_DIR = mkdtempSync(join(tmpdir(), "langcouch-test-"));
// Spinner tests must never touch the real ~/.claude/settings.json.
process.env.LANGCOUCH_CLAUDE_SETTINGS = join(process.env.LANGCOUCH_DIR, "claude-settings.json");
