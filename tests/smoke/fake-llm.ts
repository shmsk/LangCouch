/**
 * Fake OpenAI-compatible model server for the host smoke tests in CI.
 * Records every request body to $FAKE_LLM_LOG (JSONL) and answers "ok" with no
 * tool calls, so a host finishes one turn. Speaks both Chat Completions and
 * Responses, streaming and not, because hosts differ in which they use.
 *
 *   FAKE_LLM_PORT=4010 FAKE_LLM_LOG=requests.jsonl bun tests/smoke/fake-llm.ts
 *
 * The smoke test then asserts the recorded request contains "<lazy-polyglot>":
 * proof that the plugin loaded, the hook fired, and the block reached the model.
 */
import { appendFileSync } from "node:fs";

const port = Number(process.env.FAKE_LLM_PORT ?? 4010);
const log = process.env.FAKE_LLM_LOG ?? "fake-llm-requests.jsonl";
const REPLY = "ok";
const MODEL = "fake-model";

// Responses-API events carry an `event:` line (Codex reads it); Chat Completions
// streams end with [DONE].
const sse = (events: Array<Record<string, unknown> & { type?: string }>, done: boolean) =>
  new Response(
    events.map((e) => `${e.type ? `event: ${e.type}\n` : ""}data: ${JSON.stringify(e)}\n\n`).join("") + (done ? "data: [DONE]\n\n" : ""),
    { headers: { "content-type": "text/event-stream" } },
  );

function chatCompletion(stream: boolean) {
  const base = { id: "chatcmpl-fake", object: "chat.completion", created: Math.floor(Date.now() / 1000), model: MODEL };
  const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
  if (!stream) {
    return Response.json({
      ...base,
      choices: [{ index: 0, message: { role: "assistant", content: REPLY }, finish_reason: "stop" }],
      usage,
    });
  }
  const chunk = { ...base, object: "chat.completion.chunk" };
  return sse([
    { ...chunk, choices: [{ index: 0, delta: { role: "assistant", content: REPLY }, finish_reason: null }] },
    { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage },
  ], true);
}

function responsesApi(stream: boolean) {
  const item = { id: "msg_fake", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: REPLY, annotations: [] }] };
  const response = {
    id: "resp_fake",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    model: MODEL,
    status: "completed",
    output: [item],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
  if (!stream) return Response.json(response);
  return sse([
    { type: "response.created", response: { ...response, status: "in_progress", output: [] } },
    { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
    { type: "response.output_text.delta", output_index: 0, content_index: 0, item_id: item.id, delta: REPLY },
    { type: "response.output_text.done", output_index: 0, content_index: 0, item_id: item.id, text: REPLY },
    { type: "response.output_item.done", output_index: 0, item },
    { type: "response.completed", response },
  ], false);
}

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.text() : "";
    appendFileSync(log, JSON.stringify({ method: req.method, path: url.pathname, body }) + "\n");

    let json: { stream?: boolean } = {};
    try {
      json = body ? JSON.parse(body) : {};
    } catch {}

    if (url.pathname.endsWith("/models")) {
      return Response.json({ object: "list", data: [{ id: MODEL, object: "model", created: 0, owned_by: "fake" }] });
    }
    if (url.pathname.endsWith("/chat/completions")) return chatCompletion(json.stream === true);
    if (url.pathname.endsWith("/responses")) return responsesApi(json.stream === true);
    return new Response("not found", { status: 404 });
  },
});

console.log(`fake-llm listening on http://127.0.0.1:${port} (log: ${log})`);
