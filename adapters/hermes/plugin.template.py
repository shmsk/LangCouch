# langcouch
"""LangCouch adapter for Hermes Agent.

Installed by `langcouch install hermes` into $HERMES_HOME/plugins/langcouch/.
All logic lives in the TypeScript CLI; this file only shells out to it.

- pre_llm_call: Hermes fires it once per user turn, before the tool loop.
  We pipe the turn into `langcouch hook` and return the <langcouch> block as
  {"context": ...}, which Hermes appends to the user message. Same contract as
  the Claude Code UserPromptSubmit hook.
- post_llm_call: fires once the turn's final answer is done. We hand the
  answer to `langcouch hook` as a Stop event, so only the words it really
  used count as shown (weave algorithm 3).
- /langcouch <args>: routes to the CLI (lang, level, pause, resume, status)
  and returns its output. Works in the CLI and on gateway platforms.

Sacred hook contract (matches src/cli.ts): never break the host session.
Every failure path returns None. Runtime detection mirrors scripts/hook.sh:
bun preferred, Node >= 23 native, Node 22.6+ with --experimental-strip-types.
Standard library only; Python 3.8+.
"""

import json
import re
import shlex
import subprocess

CLI_PATH = "__LANGCOUCH_CLI_PATH__"  # replaced at install time
TIMEOUT = 5

# Subcommands safe to run from a chat. quiz is interactive and init/install
# touch the host config, so they stay terminal-only.
COMMANDS = ("lang", "level", "mode", "pause", "resume", "status", "validate", "instruction")


def _runtimes():
    yield ["bun", CLI_PATH]
    try:
        v = subprocess.run(["node", "-v"], capture_output=True, text=True, timeout=TIMEOUT).stdout.strip()
    except Exception:
        return
    m = re.match(r"^v(\d+)\.(\d+)", v)
    if not m:
        return
    major, minor = int(m.group(1)), int(m.group(2))
    if major >= 23:
        yield ["node", CLI_PATH]
    elif major == 22 and minor >= 6:
        yield ["node", "--experimental-strip-types", CLI_PATH]


def _run(args, stdin=""):
    """Run the CLI with the first runtime that exists. None if none ran."""
    for base in _runtimes():
        try:
            return subprocess.run(
                base + args,
                input=stdin,
                capture_output=True,
                text=True,
                timeout=TIMEOUT,
            )
        except FileNotFoundError:
            continue  # runtime not installed, try the next one
        except Exception:
            return None
    return None


def pre_llm_call(session_id="", user_message="", **kwargs):
    try:
        payload = json.dumps({
            "prompt": user_message or "",
            "session_id": session_id or "",
            "hook_event_name": "UserPromptSubmit",
        })
        r = _run(["hook"], payload)
        block = r.stdout.strip() if r is not None and r.returncode == 0 else ""
        return {"context": block} if block else None
    except Exception:
        return None


def post_llm_call(session_id="", assistant_response="", **kwargs):
    try:
        if not assistant_response:
            return None
        payload = json.dumps({
            "session_id": session_id or "",
            "hook_event_name": "Stop",
            "last_assistant_message": assistant_response,
        })
        _run(["hook"], payload)
    except Exception:
        pass
    return None


def langcouch_command(raw_args=""):
    try:
        args = shlex.split(raw_args or "")
    except ValueError:
        args = (raw_args or "").split()
    if not args or args[0] not in COMMANDS:
        return "Usage: /langcouch <" + "|".join(COMMANDS) + "> [args]"
    r = _run(args)
    if r is None:
        return "LangCouch: the CLI did not run. It needs bun or Node.js >= 22.6."
    # errors (bad language code, wrong level) come back on stderr
    return (r.stdout.strip() or r.stderr.strip()) or "ok"


def register(ctx):
    ctx.register_hook("pre_llm_call", pre_llm_call)
    ctx.register_hook("post_llm_call", post_llm_call)
    ctx.register_command(
        "langcouch",
        handler=langcouch_command,
        description="LangCouch: lang, level, pause, resume, status",
        args_hint="<lang|level|pause|resume|status> [args]",
    )
