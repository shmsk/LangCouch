#!/bin/sh
# LangCouch CLI wrapper for plugin slash commands: same runtime detection as hook.sh,
# but errors are SHOWN (users need to see them), and arguments pass through.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/src/cli.ts"

if command -v bun >/dev/null 2>&1; then
  exec bun "$CLI" "$@"
fi

if command -v node >/dev/null 2>&1; then
  V="$(node -v 2>/dev/null)"
  V="${V#v}"
  MAJOR="${V%%.*}"
  REST="${V#*.}"
  MINOR="${REST%%.*}"
  if [ "${MAJOR:-0}" -ge 23 ]; then
    exec node "$CLI" "$@"
  fi
  if [ "${MAJOR:-0}" -eq 22 ] && [ "${MINOR:-0}" -ge 6 ]; then
    exec node --experimental-strip-types "$CLI" "$@"
  fi
fi

echo "langcouch: neither bun nor Node >=22.6 found — install bun (https://bun.sh) to use LangCouch" >&2
exit 1
