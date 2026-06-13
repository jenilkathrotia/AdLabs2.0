/** Structured outreach plan produced by the synthesis step. */
export interface OutreachPlan {
  /** Full research dossier in markdown (goes to Notion). */
  dossierMarkdown: string;
  /** Personalized cold-outreach email. */
  emailSubject: string;
  emailBody: string;
  /** One-paragraph summary for Slack. */
  slackSummary: string;
  /** Title for the Notion page. */
  notionTitle: string;
}
