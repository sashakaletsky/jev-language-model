#!/usr/bin/env node
/**
 * A local stand-in for api.typesafe.ai, so the site and the tests run without a key.
 *
 * It answers every question with made-up probabilities. Two deliberate habits keep it
 * useful: it prefers the core block (function words and punctuation) at level 1 and the
 * punctuation marks within any block, so the punctuation gate can be exercised, and it
 * answers the "what does the text end with?" question truthfully from the tail field.
 * Everything else is random but seeded, so a given input always gets the same answer.
 *
 * Usage:
 *   node scripts/mock-typesafe.mjs            # listens on http://127.0.0.1:8787
 *   PORT=9000 node scripts/mock-typesafe.mjs
 * Then run the site against it:
 *   TYPESAFE_API_KEY=mock TYPESAFE_BASE_URL=http://127.0.0.1:8787 npm run dev
 * or simply `npm run dev:mock`, which does both.
 */
import http from "node:http";

const PUNCTUATION = new Set([".", ",", "?", "!"]);

/** Small seeded PRNG so answers are stable for a given input. */
function rng(seedText) {
  let s = 2166136261;
  for (const ch of seedText) s = Math.imul(s ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function choiceAnswer(labels, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(labels.map((l, i) => [l, weights[i] / sum]));
  const choice = labels[weights.indexOf(Math.max(...weights))];
  return { type: "choice", choice, confidence: probabilities[choice], probabilities };
}

/** The mock's answer to one question about `state`. */
export function answer(state, question, rand) {
  if (question.type === "noul") return { type: "noul", noul: rand() };
  if (question.type === "score") {
    const n = question.criteria.length;
    const weights = Array.from({ length: n }, () => rand());
    const sum = weights.reduce((a, b) => a + b, 0);
    const probabilities = Object.fromEntries(weights.map((w, i) => [i, w / sum]));
    const score = weights.reduce((acc, w, i) => acc + (i * w) / sum, 0);
    return { type: "score", score, confidence: Math.max(...weights) / sum, probabilities, legend: Object.fromEntries(question.criteria.map((c, i) => [i, c])) };
  }
  const labels = Object.keys(question.criteria);
  // The "what does the text end with?" question is answered truthfully from the tail.
  if (labels.includes("full_stop") && labels.includes("letter")) {
    const tail = String(state?.tail ?? "");
    const last = tail.slice(-1);
    const truth = tail === "" ? "nothing" : /[A-Za-z]/.test(last) ? "letter" : /[0-9]/.test(last) ? "digit"
      : last === "." ? "full_stop" : last === "," ? "comma" : last === "?" ? "question_mark" : last === "!" ? "exclamation_mark" : "other";
    return choiceAnswer(labels, labels.map((l) => (l === truth ? 0.9 : 0.1 / (labels.length - 1))));
  }
  // Otherwise random, with the core block and punctuation favoured so the gate is testable.
  const weights = labels.map((l) => (l.startsWith("core-") || PUNCTUATION.has(l) ? 40 + rand() : rand()));
  return choiceAnswer(labels, weights);
}

export function handleRequest(body) {
  const { state, questions } = body;
  const rand = rng(JSON.stringify(state ?? null));
  const answers = {};
  let tokens = Math.round(JSON.stringify(state ?? null).length / 4);
  for (const [name, question] of Object.entries(questions ?? {})) {
    tokens += Math.round(JSON.stringify(question).length / 4);
    answers[name] = answer(state, question, rand);
  }
  return { model: "mock-jev", answers, usage: { input_tokens: tokens, output_tokens: 8 * Object.keys(answers).length } };
}

/** Starts the mock on `port` (0 for an ephemeral port). Resolves to the server; read its address for the URL. */
export function startMockTypeSafe(port = 8787, host = "127.0.0.1") {
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (req.method === "GET" && req.url?.endsWith("/v1/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify([{ name: "mock-jev", description: "local stand-in", release_date: "2026-01-01" }]));
      }
      if (req.method !== "POST" || !req.url?.endsWith("/v1/systemone")) {
        res.writeHead(404, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "not found" }));
      }
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: "invalid JSON" }));
      }
      const result = handleRequest(body);
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json", "x-typesafe-request-id": "mock" });
        res.end(JSON.stringify(result));
      }, 20);
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  startMockTypeSafe(port).then((server) => {
    const { address, port: p } = server.address();
    console.log(`mock TypeSafe API listening on http://${address}:${p} (no real Jev behind this)`);
  });
}
