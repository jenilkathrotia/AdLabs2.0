import type OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ToolRegistry } from "./tools.js";

/**
 * The runtime / harness.
 *
 * A minimal but real tool-calling agent loop on top of any OpenAI-compatible
 * chat.completions endpoint (we point it at Nebius). It:
 *   1. sends system + user + running transcript to the model with a tools array,
 *   2. if the model returns tool_calls, runs them via the registry (in parallel),
 *      appends each result as a role:"tool" message,
 *   3. loops until the model answers with no tool calls,
 *   4. guards with maxSteps and forces a final synthesis if exhausted.
 *
 * Sponsors map cleanly onto this: Nebius = the model behind `client`,
 * Tavily + Composio = tools in the registry, this file = the harness.
 */

export type StepType = "model" | "tool_call" | "tool_result" | "final" | "warn";

export interface AgentStep {
  step: number;
  type: StepType;
  detail: string;
}

export interface RunAgentOptions {
  client: OpenAI;
  model: string;
  system: string;
  user: string;
  tools: ToolRegistry;
  maxSteps?: number;
  temperature?: number;
  onStep?: (step: AgentStep) => void;
}

export interface AgentResult {
  finalText: string;
  steps: number;
  toolCallCount: number;
  messages: ChatCompletionMessageParam[];
}

export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const {
    client,
    model,
    system,
    user,
    tools,
    maxSteps = 14,
    temperature = 0.3,
    onStep,
  } = opts;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  const toolDefs = tools.definitions();
  let toolCallCount = 0;

  for (let step = 1; step <= maxSteps; step++) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature,
      tools: toolDefs.length ? toolDefs : undefined,
      tool_choice: toolDefs.length ? "auto" : undefined,
    });

    const msg = completion.choices[0]?.message;
    if (!msg) {
      onStep?.({ step, type: "warn", detail: "Empty completion from model" });
      break;
    }
    messages.push(msg);

    const toolCalls = (msg.tool_calls ?? []).filter(
      (c): c is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall =>
        (c as { type?: string }).type === "function",
    );

    if (toolCalls.length === 0) {
      const finalText = msg.content ?? "";
      onStep?.({ step, type: "final", detail: finalText });
      return { finalText, steps: step, toolCallCount, messages };
    }

    onStep?.({
      step,
      type: "model",
      detail: `requested ${toolCalls.length} tool call(s): ${toolCalls
        .map((c) => c.function.name)
        .join(", ")}`,
    });

    const results = await Promise.all(
      toolCalls.map(async (call) => {
        toolCallCount++;
        const { name, arguments: rawArgs } = call.function;
        onStep?.({ step, type: "tool_call", detail: `${name}(${truncate(rawArgs, 300)})` });

        let content: string;
        const tool = tools.get(name);
        if (!tool) {
          content = JSON.stringify({ error: `Unknown tool: ${name}` });
        } else {
          try {
            const args = rawArgs ? JSON.parse(rawArgs) : {};
            const out = await tool.handler(args);
            content = typeof out === "string" ? out : JSON.stringify(out);
          } catch (err) {
            content = JSON.stringify({ error: errMessage(err) });
          }
        }
        onStep?.({ step, type: "tool_result", detail: `${name} -> ${truncate(content, 300)}` });
        return { tool_call_id: call.id, content };
      }),
    );

    for (const r of results) {
      messages.push({ role: "tool", tool_call_id: r.tool_call_id, content: r.content });
    }
  }

  // maxSteps exhausted — force a final answer with tools disabled.
  onStep?.({ step: maxSteps, type: "warn", detail: "maxSteps reached; forcing final synthesis" });
  const finalCompletion = await client.chat.completions.create({
    model,
    temperature,
    messages: [
      ...messages,
      { role: "user", content: "Stop calling tools. Produce your final answer now using what you have." },
    ],
  });
  const finalText = finalCompletion.choices[0]?.message?.content ?? "";
  onStep?.({ step: maxSteps, type: "final", detail: finalText });
  return { finalText, steps: maxSteps, toolCallCount, messages };
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
