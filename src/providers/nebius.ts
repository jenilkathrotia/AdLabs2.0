import OpenAI from "openai";
import { config } from "../config.js";

/**
 * Nebius (Token Factory) inference.
 *
 * Nebius exposes an OpenAI-compatible API, so we reuse the official `openai`
 * SDK and just override baseURL + apiKey. Every chat completion / tool call in
 * Scout — research reasoning, dossier synthesis, the agent loop — runs through
 * this client. This is the "Nebius for inference" leg of the sponsor stack.
 */
export const nebius = new OpenAI({
  baseURL: config.nebius.baseUrl,
  apiKey: config.nebius.apiKey,
});

export const NEBIUS_MODEL = config.nebius.model;
