/**
 * POST /api/predict  { text: string, fanout?: number, temperature?: number, trace?: "full" | "summary" }
 * GET  /api/predict?text=...&fanout=3&temperature=0.8&trace=full
 *
 * Returns Jev's prediction for the next word. See lib/predict.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { APIError } from "@typesafe-ai/sdk";
import { predict, summariseTrace, type PredictResult } from "@/lib/predict";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_CHARS = 5000;
const CACHE_MAX = 500;
const MAX_FANOUT = Number(process.env.JEV_MAX_FANOUT ?? "5");

/**
 * Per-instance rate limit: a visitor gets RATE_LIMIT requests per RATE_WINDOW_MS.
 * Serverless instances each keep their own counters, so treat this as a speed bump;
 * for a public deployment also turn on your host's firewall rate limiting.
 */
const RATE_LIMIT = Number(process.env.JEV_RATE_LIMIT ?? "40");
const RATE_WINDOW_MS = 10_000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 10_000) hits.clear();
  return recent.length > RATE_LIMIT;
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Identical text + settings returns the cached Jev answers instead of paying for them again. */
const cache = new Map<string, Promise<PredictResult>>();

function cached(text: string, fanout: number | undefined, temperature: number | undefined): Promise<PredictResult> {
  const key = `${fanout ?? "default"}\u0000${temperature ?? "default"}\u0000${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = predict(text, { fanout, temperature, limit: 10 }).catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, pending);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return pending;
}

function optionalNumber(raw: unknown): number | undefined {
  return raw === undefined || raw === null || raw === "" ? undefined : Number(raw);
}

async function handle(req: NextRequest, text: unknown, fanoutRaw: unknown, temperatureRaw: unknown, traceRaw: unknown) {
  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ error: "Too many requests; slow down a little." }, { status: 429 });
  }
  if (typeof text !== "string") {
    return NextResponse.json({ error: "`text` must be a string" }, { status: 400 });
  }
  const trimmed = text.length > MAX_TEXT_CHARS ? text.slice(-MAX_TEXT_CHARS) : text;
  const fanoutNum = optionalNumber(fanoutRaw);
  if (fanoutNum !== undefined && !(Number.isInteger(fanoutNum) && fanoutNum >= 1 && fanoutNum <= MAX_FANOUT)) {
    return NextResponse.json({ error: `\`fanout\` must be an integer from 1 to ${MAX_FANOUT}` }, { status: 400 });
  }
  const temperatureNum = optionalNumber(temperatureRaw);
  if (temperatureNum !== undefined && !(Number.isFinite(temperatureNum) && temperatureNum >= 0 && temperatureNum <= 2)) {
    return NextResponse.json({ error: "`temperature` must be a number from 0 to 2" }, { status: 400 });
  }
  try {
    const result = await cached(trimmed, fanoutNum, temperatureNum);
    return NextResponse.json(traceRaw === "full" ? result : summariseTrace(result));
  } catch (err) {
    if (err instanceof APIError) {
      const status = err.status === 429 ? 429 : err.status >= 500 ? 502 : err.status;
      return NextResponse.json({ error: `TypeSafe API error ${err.status}: ${err.message}` }, { status });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return handle(req, sp.get("text") ?? "", sp.get("fanout") ?? undefined, sp.get("temperature") ?? undefined, sp.get("trace") ?? undefined);
}

export async function POST(req: NextRequest) {
  let body: { text?: unknown; fanout?: unknown; temperature?: unknown; trace?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  return handle(req, body.text, body.fanout, body.temperature, body.trace);
}
