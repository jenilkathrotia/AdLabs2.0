import { tavily } from "@tavily/core";
import { config } from "../config.js";
import { defineTool, type Tool } from "../harness/tools.js";

/**
 * Tavily — web search + content extraction built for agents. This is the
 * "Tavily for search" leg of the stack. We expose two things:
 *   - thin async wrappers (tavilySearch / tavilyExtract) for deterministic use,
 *   - harness Tools so the agent can decide when to search/extract on its own.
 */
const tvly = tavily({ apiKey: config.tavily.apiKey });

export interface SearchHit {
  title: string;
  url: string;
  score: number;
  content: string;
}

export async function tavilySearch(
  query: string,
  opts: { maxResults?: number; topic?: "general" | "news"; days?: number } = {},
): Promise<{ answer?: string; results: SearchHit[] }> {
  const res = await tvly.search(query, {
    searchDepth: "advanced",
    maxResults: opts.maxResults ?? 6,
    topic: opts.topic ?? "general",
    days: opts.days,
    includeAnswer: "advanced",
  });
  return {
    answer: res.answer,
    results: (res.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      score: r.score,
      content: r.content,
    })),
  };
}

export async function tavilyExtract(urls: string[]): Promise<{ url: string; content: string }[]> {
  if (urls.length === 0) return [];
  const res = await tvly.extract(urls.slice(0, 20), {
    extractDepth: "advanced",
    format: "markdown",
  });
  return (res.results ?? []).map((p) => ({ url: p.url, content: p.rawContent ?? "" }));
}

/** Tavily search + extract as harness tools the agent can call autonomously. */
export function tavilyTools(): Tool[] {
  return [
    defineTool(
      "tavily_search",
      "Search the live web for information about a company, person, product, market, or recent news. Returns ranked results with a synthesized answer and snippets. Use this first and repeatedly to gather facts.",
      {
        type: "object",
        properties: {
          query: { type: "string", description: "Focused search query." },
          topic: {
            type: "string",
            enum: ["general", "news"],
            description: "Use 'news' for recent events/funding/launches.",
          },
          max_results: { type: "number", description: "1-20, default 6." },
        },
        required: ["query"],
        additionalProperties: false,
      },
      async (args) => {
        const query = String(args.query ?? "");
        const topic = (args.topic as "general" | "news") ?? "general";
        const maxResults = typeof args.max_results === "number" ? args.max_results : 6;
        const { answer, results } = await tavilySearch(query, { topic, maxResults });
        return {
          answer,
          results: results.map((r) => ({ title: r.title, url: r.url, snippet: r.content })),
        };
      },
    ),
    defineTool(
      "tavily_extract",
      "Extract the full text content of one or more specific URLs (e.g. a company's About/pricing page, a news article) to read details that snippets don't cover.",
      {
        type: "object",
        properties: {
          urls: {
            type: "array",
            items: { type: "string" },
            description: "Up to 20 URLs to fetch full content for.",
          },
        },
        required: ["urls"],
        additionalProperties: false,
      },
      async (args) => {
        const urls = Array.isArray(args.urls) ? (args.urls as string[]) : [];
        const pages = await tavilyExtract(urls);
        // Trim each page so we don't blow the context window.
        return pages.map((p) => ({ url: p.url, content: p.content.slice(0, 4000) }));
      },
    ),
  ];
}
