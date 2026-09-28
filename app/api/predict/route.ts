/**
 * POST /api/predict  { text: string, fanout?: number, trace?: "full" | "summary" }
 * GET  /api/predict?text=...&fanout=1&trace=full
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

/** Identical text + settings returns the cached Jev answers instead of paying for them again. */
const cache = new Map<string, Promise<PredictResult>>();

function cached(text: string, fanout: number | undefined): Promise<PredictResult> {
  const key = `${fanout ?? "default"}\u0000${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = predict(text, { fanout, limit: 10 }).catch((err) => {
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

async function handle(text: unknown, fanoutRaw: unknown, traceRaw: unknown) {
  if (typeof text !== "string") {
    return NextResponse.json({ error: "`text` must be a string" }, { status: 400 });
  }
  const trimmed = text.length > MAX_TEXT_CHARS ? text.slice(-MAX_TEXT_CHARS) : text;
  const fanoutNum = fanoutRaw === undefined || fanoutRaw === null || fanoutRaw === "" ? undefined : Number(fanoutRaw);
  if (fanoutNum !== undefined && !(Number.isInteger(fanoutNum) && fanoutNum >= 1 && fanoutNum <= 8)) {
    return NextResponse.json({ error: "`fanout` must be an integer from 1 to 8" }, { status: 400 });
  }
  try {
    const result = await cached(trimmed, fanoutNum);
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
  return handle(sp.get("text") ?? "", sp.get("fanout") ?? undefined, sp.get("trace") ?? undefined);
}

export async function POST(req: NextRequest) {
  let body: { text?: unknown; fanout?: unknown; trace?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  return handle(body.text, body.fanout, body.trace);
}
