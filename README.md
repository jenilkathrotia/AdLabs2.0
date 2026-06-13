# 🛰 Scout — an autonomous GTM agent

> Give it a name. Scout searches the live web, reasons over what it finds, drafts
> personalized outreach, and takes real action — Notion dossier, Gmail send, Slack
> ping — in one command.

```bash
scout "Anthropic" --context "We sell an AI QA tool for AI labs"
```

Scout is a single agent built on the **full sponsor stack** — every leg is load-bearing, not decoration.

| Leg | Sponsor | How Scout uses it | Code |
|----|---------|-------------------|------|
| 🔍 **Search** | **Tavily** | `tavily_search` + `tavily_extract` as agent tools — live web research | [`src/providers/tavily.ts`](src/providers/tavily.ts) |
| 🧠 **Inference** | **Nebius** (Token Factory) | OpenAI-compatible inference — reasoning, tool-calling, synthesis (Llama 3.3 70B / Qwen3) | [`src/providers/nebius.ts`](src/providers/nebius.ts) |
| ⚡ **Actions** | **Composio** | `GMAIL_SEND_EMAIL`, `SLACK_SEND_MESSAGE`, `NOTION_CREATE_NOTION_PAGE` | [`src/providers/composio.ts`](src/providers/composio.ts) |
| 🔁 **Runtime** | **harness** (OpenClaw-compatible) | our own minimal tool-calling agent loop | [`src/harness/agent.ts`](src/harness/agent.ts) |

---

## What it does

```
            ┌──────────────────────────────────────────────────────────┐
            │                        SCOUT                               │
            │                                                            │
  target ──▶│  1. RESEARCH  (agentic loop)                               │
            │     Nebius reasons ──▶ calls Tavily search/extract ──▶     │
            │     loops until it has a grounded brief                    │
            │                          │                                 │
            │                          ▼                                 │
            │  2. SYNTHESIZE (Nebius, structured JSON)                   │
            │     dossier · email · slack summary                        │
            │                          │                                 │
            │                          ▼                                 │
            │  3. ACT (Composio)                                         │
            │     📝 Notion page   ✉️ Gmail send   💬 Slack post          │
            └──────────────────────────────────────────────────────────┘
```

1. **Research** — an agent loop (our harness) where **Nebius** decides what to look
   up and calls **Tavily** to search/extract the live web until it has a grounded,
   cited brief.
2. **Synthesize** — **Nebius** turns the brief into a structured outreach package:
   a dossier, a personalized cold email, and a Slack summary.
3. **Act** — **Composio** files the dossier to Notion, sends the email via Gmail,
   and posts the summary to Slack.

---

## Quickstart

```bash
npm install
cp .env.example .env     # add NEBIUS_API_KEY, TAVILY_API_KEY, COMPOSIO_API_KEY

# Connect the apps Scout acts through (one-time, per app).
# Create an auth config in the Composio dashboard, then:
npm run connect -- ac_your_gmail_authconfig
npm run connect -- ac_your_slack_authconfig
npm run connect -- ac_your_notion_authconfig

# Research + draft everything, fire nothing (safe to demo on stage):
npm run scout -- "Anthropic" --dry-run

# Live: research → draft → actually send.
npm run scout -- "Ramp" \
  --context "We sell an AI QA tool for fintech" \
  --to founder@ramp.com \
  --slack C0123456789 \
  --notion <notion-parent-page-id>
```

`--dry-run` (or leaving a delivery target blank) drafts everything but echoes the
action instead of executing it — nothing leaves the building until you say so.

---

## Two modes

- **Pipeline (default)** — research → synthesize → act, with the actions executed
  deterministically. Demo-proof: the side effects always fire.
- **`--autonomous`** — one agent loop where the model holds *both* Tavily search
  tools and Composio action tools and drives the entire sequence itself. The
  purest "the agent did all of it" story:

  ```bash
  npm run scout -- "Vercel" --autonomous --dry-run
  ```

Both run on the same harness ([`src/harness/agent.ts`](src/harness/agent.ts)) and
the same provider tools — the only difference is who decides when to act.

---

## Configuration

| Env var | Purpose |
|---------|---------|
| `NEBIUS_API_KEY` | Nebius (Token Factory) inference key |
| `TAVILY_API_KEY` | Tavily search key (`tvly-…`) |
| `COMPOSIO_API_KEY` | Composio key (only needed for live actions) |
| `NEBIUS_MODEL` | override model (default `meta-llama/Llama-3.3-70B-Instruct`) |
| `COMPOSIO_USER_ID` | which Composio user's connected accounts to use |
| `SCOUT_TO_EMAIL` / `SCOUT_SLACK_CHANNEL` / `SCOUT_NOTION_PARENT_ID` | delivery targets (CLI flags override) |
| `SCOUT_DRY_RUN=1` | global dry-run |

## Project structure

```
src/
  index.ts            CLI — one command, live step log
  config.ts           env loading + validation
  harness/
    agent.ts          the runtime: async tool-calling loop (maxSteps, parallel tools)
    tools.ts          Tool contract + registry
  providers/
    nebius.ts         OpenAI-compatible inference client  (Nebius)
    tavily.ts         search/extract wrappers + agent tools (Tavily)
    composio.ts       Gmail/Slack/Notion actions + agent tools (Composio)
  agent/
    scout.ts          orchestration: pipeline + autonomous
    prompts.ts        system prompts
```

Built for the Composio · Nebius · Tavily builder hackathon. Solo/team agent, one
command, four sponsors, real actions.
