import type OpenAI from "openai";

/**
 * A tool exposed to the model. `definition` is the OpenAI-format function spec
 * the model sees; `handler` runs when the model calls it.
 *
 * This is the contract every provider (Tavily, Composio, ...) plugs into so the
 * harness stays provider-agnostic.
 */
export type ToolDefinition = OpenAI.Chat.Completions.ChatCompletionFunctionTool;

export interface Tool {
  definition: ToolDefinition;
  /** Receives parsed JSON args, returns a JSON-serializable result (or string). */
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/** Convenience builder for a function tool. */
export function defineTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
  handler: Tool["handler"],
): Tool {
  return {
    definition: {
      type: "function",
      function: { name, description, parameters: parameters as never },
    },
    handler,
  };
}

/** Holds the tools available to a single agent run and emits OpenAI tool specs. */
export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): this {
    this.tools.set(tool.definition.function.name, tool);
    return this;
  }

  registerAll(tools: Tool[]): this {
    for (const t of tools) this.register(t);
    return this;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  get size(): number {
    return this.tools.size;
  }
}
