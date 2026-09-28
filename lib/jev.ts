/**
 * Server-side TypeSafe client. The API key never reaches the browser.
 */
import { TypeSafeClient } from "@typesafe-ai/sdk";

let client: TypeSafeClient | null = null;

export function getJevClient(): TypeSafeClient {
  if (!client) {
    if (!process.env.TYPESAFE_API_KEY) {
      throw new Error(
        "TYPESAFE_API_KEY is not set. Add it to .env.local (see .env.example) or to your Vercel project settings.",
      );
    }
    client = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY,
      // One attempt may carry a 255-option question; give it room.
      timeout: 20_000,
      retry: { maxRetries: 1 },
    });
  }
  return client;
}

/**
 * How many top-ranked blocks to open at level 2. Default 3: opening more than one block lets a
 * strong word from the runner-up block (often a linking word) beat a weak word from the leading
 * block once P(block) and P(word | block) are multiplied. Each extra block is one more question.
 */
export function defaultFanout(): number {
  const n = Number(process.env.JEV_FANOUT ?? "3");
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 8) : 1;
}

/** Sampling temperature for the suggestion. 0 always takes the top candidate. Default 0.8. */
export function defaultTemperature(): number {
  const t = Number(process.env.JEV_TEMPERATURE ?? "0.8");
  return Number.isFinite(t) && t >= 0 ? Math.min(t, 2) : 0.8;
}
