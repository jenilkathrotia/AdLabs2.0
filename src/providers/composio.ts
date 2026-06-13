import { Composio } from "@composio/core";
import { OpenAIProvider } from "@composio/openai";
import { config } from "../config.js";
import { defineTool, type Tool } from "../harness/tools.js";

/**
 * Composio — real actions across apps. This is the "Composio for tools" leg of
 * the stack. Scout uses three verified action slugs:
 *   - GMAIL_SEND_EMAIL          (recipient_email, subject, body)
 *   - SLACK_SEND_MESSAGE        (channel, text)
 *   - NOTION_CREATE_NOTION_PAGE (parent_id, title, content)
 *
 * We expose them two ways: deterministic helpers (used by the default pipeline)
 * and harness Tools (used by --autonomous mode). Both route through the same
 * helpers so `--dry-run` is honored everywhere: in dry-run we draft + echo the
 * action instead of executing it — safe to run live on stage.
 */
const userId = config.composio.userId;

// Lazily constructed so --dry-run (and research-only demos) work with just
// Nebius + Tavily keys — the Composio key is only required when we actually act.
let _composio: Composio | undefined;
export function composioClient(): Composio {
  if (!_composio) {
    _composio = new Composio({
      apiKey: config.composio.apiKey,
      provider: new OpenAIProvider(),
    });
  }
  return _composio;
}

export interface ActionResult {
  action: string;
  executed: boolean;
  detail: string;
}

async function execute(slug: string, args: Record<string, unknown>): Promise<unknown> {
  return composioClient().tools.execute(slug, { userId, arguments: args });
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<ActionResult> {
  if (config.dryRun || !input.to) {
    return {
      action: "GMAIL_SEND_EMAIL",
      executed: false,
      detail: `[dry-run] would email ${input.to || "<no SCOUT_TO_EMAIL set>"} — "${input.subject}"`,
    };
  }
  await execute("GMAIL_SEND_EMAIL", {
    recipient_email: input.to,
    subject: input.subject,
    body: input.body,
  });
  return { action: "GMAIL_SEND_EMAIL", executed: true, detail: `Emailed ${input.to}` };
}

export async function postSlack(input: { channel: string; text: string }): Promise<ActionResult> {
  if (config.dryRun || !input.channel) {
    return {
      action: "SLACK_SEND_MESSAGE",
      executed: false,
      detail: `[dry-run] would post to ${input.channel || "<no SCOUT_SLACK_CHANNEL set>"}`,
    };
  }
  await execute("SLACK_SEND_MESSAGE", { channel: input.channel, text: input.text });
  return { action: "SLACK_SEND_MESSAGE", executed: true, detail: `Posted to ${input.channel}` };
}

export async function createNotionPage(input: {
  parentId: string;
  title: string;
  content: string;
}): Promise<ActionResult> {
  if (config.dryRun || !input.parentId) {
    return {
      action: "NOTION_CREATE_NOTION_PAGE",
      executed: false,
      detail: `[dry-run] would create Notion page "${input.title}"`,
    };
  }
  await execute("NOTION_CREATE_NOTION_PAGE", {
    parent_id: input.parentId,
    title: input.title,
    // Composio's NOTION_CREATE_NOTION_PAGE names the body 'markdown' (not
    // 'content'); an unknown 'content' key is silently dropped → empty page.
    markdown: input.content,
  });
  return { action: "NOTION_CREATE_NOTION_PAGE", executed: true, detail: `Created Notion page "${input.title}"` };
}

/** Composio actions as harness tools, for --autonomous mode. */
export function composioActionTools(): Tool[] {
  return [
    defineTool(
      "gmail_send_email",
      "Send an outreach email via the connected Gmail account. Call this once you have drafted a personalized email.",
      {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address." },
          subject: { type: "string" },
          body: { type: "string", description: "Full email body, personalized." },
        },
        required: ["to", "subject", "body"],
        additionalProperties: false,
      },
      async (args) =>
        sendEmail({
          to: String(args.to ?? config.delivery.toEmail),
          subject: String(args.subject ?? ""),
          body: String(args.body ?? ""),
        }),
    ),
    defineTool(
      "slack_post_summary",
      "Post a short summary of the research + outreach to the team Slack channel.",
      {
        type: "object",
        properties: {
          text: { type: "string", description: "Concise summary to post." },
        },
        required: ["text"],
        additionalProperties: false,
      },
      async (args) =>
        postSlack({ channel: config.delivery.slackChannel, text: String(args.text ?? "") }),
    ),
    defineTool(
      "notion_create_dossier",
      "Save the full research dossier as a Notion page under the team's workspace.",
      {
        type: "object",
        properties: {
          title: { type: "string" },
          content: { type: "string", description: "Markdown dossier content." },
        },
        required: ["title", "content"],
        additionalProperties: false,
      },
      async (args) =>
        createNotionPage({
          parentId: config.delivery.notionParentId,
          title: String(args.title ?? "Scout dossier"),
          content: String(args.content ?? ""),
        }),
    ),
  ];
}

/**
 * One-time onboarding helper: initiate an OAuth connection for a toolkit so the
 * configured userId has a connected Gmail/Slack/Notion account. Used by
 * `npm run connect`. authConfigId comes from the Composio dashboard.
 */
export async function connectAccount(authConfigId: string): Promise<void> {
  const req = await composioClient().connectedAccounts.initiate(userId, authConfigId);
  console.log(`\n  Authorize here:\n  ${req.redirectUrl}\n`);
  const account = await req.waitForConnection();
  console.log(`  ✓ Connected account: ${account.id}`);
}
