#!/usr/bin/env node
/**
 * Accuracy harness. Jev is the only model involved: it replays the site's own
 * two-question prediction over real text and counts exact matches.
 *
 * For each sampled word in the corpus it hides the word, shows Jev the text
 * before it, and records whether Jev's top suggestion (or one of its top 5)
 * is the hidden word, and whether the word's block was among the blocks
 * opened at level 2.
 *
 * Usage (with the site running, e.g. `npm run dev`):
 *   node scripts/harness.mjs --corpus path/to/text.txt [--url http://localhost:3000]
 *        [--samples 100] [--fanout 30] [--seed 1] [--out results.json]
 *
 * Any plain-text file works. See README for where to get public-domain text.
 */
import fs from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? "true" : arr[i + 1]]);
    return acc;
  }, []),
);
const corpusPath = args.corpus;
if (!corpusPath) {
  console.error("--corpus <file> is required");
  process.exit(1);
}
const url = (args.url ?? "http://localhost:3000").replace(/\/$/, "");
const samples = Number(args.samples ?? 100);
const fanout = Number(args.fanout ?? 30);
const seed = Number(args.seed ?? 1);
const outPath = args.out;

// Deterministic sampling.
let s = seed >>> 0 || 1;
const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const blocks = JSON.parse(fs.readFileSync(path.join(root, "data", "blocks.json"), "utf8")).blocks;
const blockOf = new Map();
for (const b of blocks) for (const w of b.words) blockOf.set(w, b.id);

// Candidate positions: an alphabetic word with at least three words before it in the same paragraph.
const text = fs.readFileSync(corpusPath, "utf8").replace(/\r/g, "");
const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 40);
const positions = [];
for (const p of paragraphs) {
  const re = /[A-Za-z][A-Za-z']*/g;
  let m;
  let count = 0;
  while ((m = re.exec(p))) {
    count += 1;
    if (count > 3 && m[0].length >= 2) positions.push({ before: p.slice(0, m.index), target: m[0] });
  }
}
if (positions.length === 0) {
  console.error("no usable positions found in corpus");
  process.exit(1);
}
const picked = [];
while (picked.length < Math.min(samples, positions.length)) {
  const pos = positions[Math.floor(rand() * positions.length)];
  if (!picked.includes(pos)) picked.push(pos);
}

async function ask(input) {
  const res = await fetch(`${url}/api/predict`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: input, fanout, temperature: 0, trace: "summary" }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

const st = { n: 0, top1: 0, top5: 0, block: 0, tokens: 0, ms: 0 };
const records = [];
let inDictionary = 0;
console.log(`corpus: ${corpusPath} (${positions.length} candidate positions), samples: ${picked.length}, fanout: ${fanout}`);

for (const [i, pos] of picked.entries()) {
  const target = pos.target.toLowerCase();
  const known = blockOf.has(target);
  if (known) inDictionary += 1;
  let r;
  try {
    r = await ask(pos.before);
  } catch (err) {
    console.error(`sample ${i}: ${err.message}`);
    continue;
  }
  const words = r.candidates.map((c) => c.word);
  st.n += 1;
  st.top1 += words[0] === target ? 1 : 0;
  st.top5 += words.slice(0, 5).includes(target) ? 1 : 0;
  st.block += r.blocks.some((b) => b.opened && b.id === blockOf.get(target)) ? 1 : 0;
  st.tokens += r.usage.input_tokens;
  st.ms += r.timing.total_ms;
  records.push({ i, target, known, top: words.slice(0, 5), blocks: r.blocks.filter((b) => b.opened).map((b) => b.id), tokens: r.usage.input_tokens, ms: r.timing.total_ms });
  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${picked.length} samples done`);
}

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : "-");
console.log(`\nhidden word in dictionary: ${pct(inDictionary, picked.length)} of samples (Jev cannot be right otherwise)\n`);
console.log("n   | top-1  | top-5  | block hit | tokens/pred | ms/pred");
console.log(
  `${String(st.n).padEnd(3)} | ${pct(st.top1, st.n).padEnd(6)} | ${pct(st.top5, st.n).padEnd(6)} | ${pct(st.block, st.n).padEnd(9)} | ${String(st.n ? Math.round(st.tokens / st.n) : "-").padEnd(11)} | ${st.n ? Math.round(st.ms / st.n) : "-"}`,
);
if (outPath) {
  fs.writeFileSync(outPath, JSON.stringify({ corpus: corpusPath, samples: picked.length, fanout, seed, inDictionary, stats: st, records }, null, 1));
  console.log(`\nwrote ${outPath}`);
}
