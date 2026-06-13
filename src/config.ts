import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

/**
 * Central config. Keys that must exist are read lazily via getters so that
 * commands which don't need a given provider don't blow up on its missing key.
 */
export const config = {
  nebius: {
    get apiKey() {
      return required("NEBIUS_API_KEY");
    },
    // Nebius AI Studio was rebranded "Token Factory"; this is the current
    // OpenAI-compatible endpoint. (Legacy api.studio.nebius.ai/v1 still resolves.)
    baseUrl: optional("NEBIUS_BASE_URL", "https://api.tokenfactory.nebius.com/v1/"),
    // Strong open-weight tool-callers on Nebius: meta-llama/Llama-3.3-70B-Instruct,
    // Qwen/Qwen3-30B-A3B-Instruct-2507, deepseek-ai/DeepSeek-V3-0324.
    model: optional("NEBIUS_MODEL", "meta-llama/Llama-3.3-70B-Instruct"),
  },
  tavily: {
    get apiKey() {
      return required("TAVILY_API_KEY");
    },
  },
  composio: {
    get apiKey() {
      return required("COMPOSIO_API_KEY");
    },
    /** Composio "user id" / entity the connected accounts (Gmail, Slack, Notion) belong to. */
    userId: optional("COMPOSIO_USER_ID", "default"),
  },
  delivery: {
    /** Recipient for the outreach email Scout drafts. */
    toEmail: process.env.SCOUT_TO_EMAIL ?? "",
    /** Slack channel id/name for the run summary. */
    slackChannel: process.env.SCOUT_SLACK_CHANNEL ?? "",
    /** Notion parent page id under which the dossier page is created. */
    notionParentId: process.env.SCOUT_NOTION_PARENT_ID ?? "",
  },
  /**
   * Dry run: the agent still researches + reasons + DRAFTS everything, but
   * Composio side-effects (send email, post Slack, create Notion) are skipped
   * and echoed instead. Safe to demo on stage. Toggle with SCOUT_DRY_RUN=1.
   */
  dryRun: process.env.SCOUT_DRY_RUN === "1",
} as const;
