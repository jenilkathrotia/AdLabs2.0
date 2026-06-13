import "dotenv/config";
import type { AgentStep } from "./harness/agent.js";

// ANSI helpers (no deps).
const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

interface Args {
  target: string;
  context?: string;
  autonomous: boolean;
  dryRun: boolean;
  to?: string;
  slack?: string;
  notion?: string;
  model?: string;
  maxSteps?: number;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { target: "", autonomous: false, dryRun: false, help: false };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case "-h":
      case "--help":
        a.help = true;
        break;
      case "--autonomous":
        a.autonomous = true;
        break;
      case "--dry-run":
        a.dryRun = true;
        break;
      case "-c":
      case "--context":
        a.context = next();
        break;
      case "--to":
        a.to = next();
        break;
      case "--slack":
        a.slack = next();
        break;
      case "--notion":
        a.notion = next();
        break;
      case "--model":
        a.model = next();
        break;
      case "--max-steps":
        a.maxSteps = Number(next());
        break;
      default:
        if (arg.startsWith("-")) throw new Error(`Unknown flag: ${arg}`);
        positionals.push(arg);
    }
  }
  a.target = positionals.join(" ").trim();
  return a;
}

const HELP = `
${c.bold("Scout")} — autonomous GTM agent. ${c.dim("Tavily searches · Nebius reasons · Composio acts.")}

${c.bold("Usage")}
  scout "<company or person>" [options]

${c.bold("Options")}
  -c, --context <text>   Who you are / what you sell (tailors the outreach)
      --to <email>       Recipient for the outreach email
      --slack <channel>  Slack channel id for the run summary
      --notion <pageId>  Notion parent page id for the dossier
      --model <id>       Nebius model id (default: env NEBIUS_MODEL)
      --max-steps <n>    Max agent steps (default 12)
      --autonomous       One agent loop drives search + actions itself
      --dry-run          Research + draft everything, but don't fire actions
  -h, --help

${c.bold("Examples")}
  scout "Anthropic" --dry-run
  scout "Ramp" -c "We sell an AI QA tool for fintech" --to founder@ramp.com
`;

function stepLine(s: AgentStep): string {
  const tag =
    s.type === "tool_call"
      ? c.cyan("→ tool")
      : s.type === "tool_result"
        ? c.dim("← result")
        : s.type === "model"
          ? c.magenta("• model")
          : s.type === "warn"
            ? c.yellow("! warn")
            : c.green("✓ final");
  const detail = s.type === "final" ? c.dim("(brief ready)") : s.detail;
  return `  ${c.dim(`[${s.step}]`)} ${tag}  ${detail}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.target) {
    console.log(HELP);
    process.exit(args.target ? 0 : 1);
  }

  // Apply CLI overrides to env BEFORE importing config-dependent modules.
  if (args.dryRun) process.env.SCOUT_DRY_RUN = "1";
  if (args.to) process.env.SCOUT_TO_EMAIL = args.to;
  if (args.slack) process.env.SCOUT_SLACK_CHANNEL = args.slack;
  if (args.notion) process.env.SCOUT_NOTION_PARENT_ID = args.notion;
  if (args.model) process.env.NEBIUS_MODEL = args.model;

  const { runScout, runScoutAutonomous } = await import("./agent/scout.js");
  const { config } = await import("./config.js");

  console.log(c.bold(`\n  🛰  Scout → ${c.cyan(args.target)}`));
  console.log(
    c.dim(
      `  model: ${config.nebius.model}  ·  mode: ${args.autonomous ? "autonomous" : "pipeline"}  ·  ${
        config.dryRun ? c.yellow("DRY RUN") : "LIVE"
      }\n`,
    ),
  );

  const onStep = (s: AgentStep) => console.log(stepLine(s));
  const t0 = Date.now();

  if (args.autonomous) {
    const out = await runScoutAutonomous({
      target: args.target,
      context: args.context,
      maxSteps: args.maxSteps,
      onStep,
    });
    console.log(`\n${c.bold("  Report")}\n`);
    console.log(indent(out));
    console.log(c.dim(`\n  done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`));
    return;
  }

  const report = await runScout({
    target: args.target,
    context: args.context,
    maxSteps: args.maxSteps,
    onStep,
  });

  console.log(`\n${c.bold("  ✉️  Drafted email")}`);
  console.log(c.dim("  ────────────────"));
  console.log(`  ${c.bold("Subject:")} ${report.plan.emailSubject}\n`);
  console.log(indent(report.plan.emailBody));

  console.log(`\n${c.bold("  💬 Slack summary")}`);
  console.log(c.dim("  ───────────────"));
  console.log(indent(report.plan.slackSummary));

  console.log(`\n${c.bold("  ⚡ Actions")}`);
  console.log(c.dim("  ────────"));
  for (const a of report.actions) {
    const mark = a.executed ? c.green("✓") : c.yellow("○");
    console.log(`  ${mark} ${a.action.padEnd(26)} ${c.dim(a.detail)}`);
  }

  console.log(
    c.dim(
      `\n  research: ${report.stats.researchToolCalls} searches in ${report.stats.researchSteps} steps  ·  ${(
        (Date.now() - t0) /
        1000
      ).toFixed(1)}s\n`,
    ),
  );
}

function indent(s: string): string {
  return s
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}

main().catch((err) => {
  console.error(`\n  ${c.yellow("✗")} ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
