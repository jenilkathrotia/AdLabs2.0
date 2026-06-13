import { nebius, NEBIUS_MODEL } from "../providers/nebius.js";
import { tavilyTools } from "../providers/tavily.js";
import {
  sendEmail,
  postSlack,
  createNotionPage,
  composioActionTools,
  type ActionResult,
} from "../providers/composio.js";
import { runAgent, type AgentStep } from "../harness/agent.js";
import { ToolRegistry } from "../harness/tools.js";
import { config } from "../config.js";
import type { OutreachPlan } from "../types.js";
import {
  RESEARCH_SYSTEM,
  researchUser,
  SYNTHESIS_SYSTEM,
  synthesisUser,
  AUTONOMOUS_SYSTEM,
} from "./prompts.js";

export interface ScoutOptions {
  target: string;
  /** Who is reaching out / what they sell — used to tailor the outreach. */
  context?: string;
  maxSteps?: number;
  onStep?: (s: AgentStep) => void;
}

export interface ScoutReport {
  target: string;
  brief: string;
  plan: OutreachPlan;
  actions: ActionResult[];
  stats: { researchSteps: number; researchToolCalls: number };
}

/**
 * Default pipeline: agentic research (Nebius + Tavily inside our harness) →
 * structured synthesis (Nebius) → deterministic actions (Composio). Reliable
 * for a live demo: the side effects always fire (or echo, in --dry-run).
 */
export async function runScout(opts: ScoutOptions): Promise<ScoutReport> {
  const { target, context, maxSteps = 12, onStep } = opts;

  // Stage 1 — agentic web research.
  const tools = new ToolRegistry().registerAll(tavilyTools());
  const research = await runAgent({
    client: nebius,
    model: NEBIUS_MODEL,
    system: RESEARCH_SYSTEM,
    user: researchUser(target, context),
    tools,
    maxSteps,
    onStep,
  });

  // Stage 2 — synthesize a structured outreach package.
  const plan = await synthesize(target, research.finalText, context);

  // Stage 3 — take real actions via Composio.
  const actions: ActionResult[] = [];
  actions.push(
    await createNotionPage({
      parentId: config.delivery.notionParentId,
      title: plan.notionTitle,
      content: plan.dossierMarkdown,
    }),
  );
  actions.push(
    await sendEmail({
      to: config.delivery.toEmail,
      subject: plan.emailSubject,
      body: plan.emailBody,
    }),
  );
  actions.push(await postSlack({ channel: config.delivery.slackChannel, text: plan.slackSummary }));

  return {
    target,
    brief: research.finalText,
    plan,
    actions,
    stats: { researchSteps: research.steps, researchToolCalls: research.toolCallCount },
  };
}

/**
 * Autonomous mode: one harness loop where the model has BOTH Tavily search tools
 * AND Composio action tools and drives the whole thing itself. Maximal "agent
 * does everything" story; the pipeline above is the reliable default.
 */
export async function runScoutAutonomous(opts: ScoutOptions): Promise<string> {
  const { target, context, maxSteps = 18, onStep } = opts;
  const tools = new ToolRegistry().registerAll(tavilyTools()).registerAll(composioActionTools());
  const result = await runAgent({
    client: nebius,
    model: NEBIUS_MODEL,
    system: AUTONOMOUS_SYSTEM,
    user: researchUser(target, context),
    tools,
    maxSteps,
    onStep,
  });
  return result.finalText;
}

async function synthesize(
  target: string,
  brief: string,
  context?: string,
): Promise<OutreachPlan> {
  const completion = await nebius.chat.completions.create({
    model: NEBIUS_MODEL,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYNTHESIS_SYSTEM },
      { role: "user", content: synthesisUser(target, brief, context) },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = extractJson(raw);
  return {
    notionTitle: str(parsed.notionTitle, `Scout dossier — ${target}`),
    dossierMarkdown: str(parsed.dossierMarkdown, brief),
    emailSubject: str(parsed.emailSubject, `Quick idea for ${target}`),
    emailBody: str(parsed.emailBody, ""),
    slackSummary: str(parsed.slackSummary, `Scouted ${target}.`),
  };
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim().length > 0 ? v : fallback;
}

/** Parse a JSON object from a model response, tolerating stray prose/fences. */
function extractJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    return {};
  }
}
