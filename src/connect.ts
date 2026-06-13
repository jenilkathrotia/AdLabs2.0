import "dotenv/config";
import { connectAccount } from "./providers/composio.js";

/**
 * One-time onboarding: connect a Gmail/Slack/Notion account to the configured
 * Composio user. Get the auth-config id (ac_...) from the Composio dashboard
 * after creating an auth config for the app.
 *
 *   npm run connect -- ac_xxxxxxxx
 */
async function main() {
  const authConfigId = process.argv[2];
  if (!authConfigId) {
    console.error("Usage: npm run connect -- <authConfigId>   (e.g. ac_abc123)");
    process.exit(1);
  }
  await connectAccount(authConfigId);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
