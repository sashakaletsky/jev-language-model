import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, lastWords, sampleIndex, type Candidate } from "../lib/predict.ts";

test("allocate hands out exactly 255 slots in proportion to block probability", () => {
  const quotas = allocate([0.6, 0.2, 0.1, 0.05, 0.05]);
  assert.equal(quotas.reduce((a, b) => a + b, 0), 255);
  assert.ok(quotas[0] > quotas[1] && quotas[1] > quotas[2]);
  assert.ok(quotas[0] <= 128, "no block dominates");
  assert.ok(quotas.every((q) => q >= 8), "every opened block is represented");
});

test("allocate gives a single block everything and copes with many blocks", () => {
  assert.deepEqual(allocate([1]), [255]);
  const fifty = allocate(Array.from({ length: 50 }, (_, i) => 1 / (i + 1)));
  assert.equal(fifty.reduce((a, b) => a + b, 0), 255);
  assert.ok(fifty.every((q) => q >= 2));
  assert.ok(fifty[0] > fifty[49]);
});

test("lastWords returns the last few words exactly as written", () => {
  assert.equal(lastWords("London is a city famous for royalty in kingdom england. "), "famous for royalty in kingdom england.".split(" ").slice(-4).join(" "));
  assert.equal(lastWords("Hello"), "Hello");
  assert.equal(lastWords("   "), "");
});

const cands = (ps: number[]): Candidate[] => ps.map((p, i) => ({ word: `w${i}`, block: "b", p, pBlock: 1, pWord: p }));

test("sampleIndex is greedy at temperature 0 and stays within the nucleus above it", () => {
  const c = cands([0.5, 0.2, 0.15, 0.1, 0.03, 0.02]);
  assert.equal(sampleIndex(c, 0), 0);
  const seen = new Set<number>();
  for (let i = 0; i < 2000; i++) seen.add(sampleIndex(c, 1.3));
  assert.ok(seen.has(0) && seen.has(1), "sampling reaches past the top candidate");
  assert.ok(!seen.has(5) && !seen.has(4), "the tail outside the 90% nucleus is never drawn");
});
