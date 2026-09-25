#!/bin/sh
# LangCouch plugin hook wrapper: bun preferred, Node >=22.6 fallback, otherwise silent no-op.
# Hook contract: NEVER break the host session — any failure means empty stdout, exit 0.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/src/cli.ts"

if command -v bun >/dev/null 2>&1; then
  exec bun "$CLI" hook
fi

if command -v node >/dev/null 2>&1; then
  V="$(node -v 2>/dev/null)"
  V="${V#v}"
  MAJOR="${V%%.*}"
  REST="${V#*.}"
  MINOR="${REST%%.*}"
  # Node >=23 strips TS types natively; 22.6+ needs the flag (its warning goes to stderr).
  if [ "${MAJOR:-0}" -ge 23 ]; then
    exec node "$CLI" hook 2>/dev/null
  fi
  if [ "${MAJOR:-0}" -eq 22 ] && [ "${MINOR:-0}" -ge 6 ]; then
    exec node --experimental-strip-types "$CLI" hook 2>/dev/null
  fi
fi

# No usable runtime: stay silent on prompts, but on SessionStart tell the model once
# (plain stdout there lands in context) so it can ask the user to install one.
INPUT="$(cat 2>/dev/null)"
case "$INPUT" in
  *'"hook_event_name":"SessionStart"'* | *'"hook_event_name": "SessionStart"'*)
    echo "<langcouch>The LangCouch plugin is installed but inactive: it needs bun (https://bun.sh) or Node.js >= 22.6, and neither was found. Tell the user this once, briefly, and that they should restart the session after installing one.</langcouch>"
    ;;
esac
exit 0
