/**
 * End-to-end check of the three-level pipeline against the mock API: no key, no network.
 * The mock prefers the core block and punctuation, so the punctuation gate can be exercised.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startMockTypeSafe } from "../scripts/mock-typesafe.mjs";

let server: { close(): void; address(): { port: number } | string | null };

before(async () => {
  server = (await startMockTypeSafe(0)) as typeof server;
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  process.env.TYPESAFE_API_KEY = "mock";
  process.env.TYPESAFE_BASE_URL = `http://127.0.0.1:${port}`;
});

after(() => server.close());

test("predict asks three levels and shortlists exactly 255 candidates", async () => {
  const { predict } = await import("../lib/predict.ts");
  const r = await predict("London is famous for ", { fanout: 10, temperature: 0 });
  assert.deepEqual(r.trace.map((t) => t.level), [1, 2, 3]);
  assert.equal(r.shortlist.reduce((n, s) => n + s.quota, 0), 255);
  assert.equal(r.blocks.filter((b) => b.opened).length, 10);
  assert.equal(r.chosen.word, r.candidates[0].word, "temperature 0 suggests the top candidate");
  assert.equal(r.trace[0].request.state.text, "London is famous for ____");
  assert.equal(r.trace[0].request.state.tail, "London is famous for");
});

test("level 2 is sent in parallel batches of ten", async () => {
  const { predict } = await import("../lib/predict.ts");
  const r = await predict("Hello there ", { fanout: 25, temperature: 0 });
  const batches = r.trace.filter((t) => t.level === 2);
  assert.deepEqual(batches.map((b) => Object.keys(b.request.questions).length), [10, 10, 5]);
  assert.equal(batches[0].part, "batch 1 of 3");
});

test("punctuation is offered after a word and withheld after a mark", async () => {
  const { predict } = await import("../lib/predict.ts");
  const options = async (text: string) => {
    const r = await predict(text, { fanout: 5, temperature: 0 });
    const criteria = (r.trace.at(-1)!.request.questions as { word: { criteria: Record<string, unknown> } }).word.criteria;
    return { marks: Object.keys(criteria).filter((w) => ".,?!".includes(w)), ending: r.marks };
  };
  const afterWord = await options("London is in England ");
  assert.equal(afterWord.ending.allowed, true);
  assert.ok(afterWord.marks.length > 0, "marks are shortlisted after a word");
  const afterStop = await options("London is in England. ");
  assert.equal(afterStop.ending.ending, "full_stop");
  assert.deepEqual(afterStop.marks, [], "no marks after a full stop");
  const afterComma = await options("Well, ");
  assert.deepEqual(afterComma.marks, []);
});

test("level-3 candidates are shown in place, capitalised after a sentence ends", async () => {
  const { predict } = await import("../lib/predict.ts");
  const r = await predict("We had a wonderful time. ", { fanout: 3, temperature: 0 });
  const criteria = (r.trace.at(-1)!.request.questions as { word: { criteria: Record<string, string> } }).word.criteria;
  const [word, phrase] = Object.entries(criteria).find(([w]) => !".,?!".includes(w))!;
  assert.equal(phrase, `had a wonderful time. ${word[0].toUpperCase()}${word.slice(1)}`);
});

test("summariseTrace collapses large option sets and keeps small ones", async () => {
  const { predict, summariseTrace } = await import("../lib/predict.ts");
  const r = summariseTrace(await predict("Hello there ", { fanout: 3, temperature: 0 }));
  const q1 = r.trace[0].request.questions as Record<string, { criteria: unknown }>;
  assert.equal(q1.block.criteria, "<255 options omitted>");
  assert.equal(typeof q1.ending.criteria, "object");
});
