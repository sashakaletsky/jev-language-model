/**
 * Next-word prediction, done entirely by Jev in three Choice questions.
 *
 *   Level 1: given the text, which of the 255 themed blocks holds the next word?
 *            The top K blocks are opened (default 10).
 *   Level 2: for each opened block, which of its 255 words is it? One request, K questions.
 *            Each block then contributes a shortlist sized by its level-1 probability;
 *            the shortlists together make exactly 255 candidates.
 *   Level 3: which of those 255 candidates is it? Each is shown in place at the end
 *            of the text, so Jev compares phrases rather than bare words.
 *
 * Code contributes nothing linguistic: it splits the text (see tokenize.ts), sizes the
 * shortlists from Jev's own probabilities, and at temperature above zero samples the
 * suggestion from Jev's final distribution. No prefix matching, no frequency data,
 * no other model.
 */
import { choice } from "@typesafe-ai/sdk";
import type { ChoiceResponse, SystemOneResult, Questions } from "@typesafe-ai/sdk";
import { blockById, level1Criteria, level2Criteria } from "./blocks";
import { defaultFanout, defaultTemperature, getJevClient } from "./jev";
import { splitInput, tailContext } from "./tokenize";

/** What Jev is shown. A type literal rather than an interface so it satisfies the SDK's JSON state type. */
export type JevState = {
  /** The text typed so far, with a blank (____) where the cursor is. */
  text: string;
  /** Letters of the current word typed so far; empty when the last word is complete. */
  partial_word: string;
};

export interface Candidate {
  word: string;
  block: string;
  /** Jev's level-3 probability for this word, the final ranking. */
  p: number;
  /** Level-1 probability of the word's block. */
  pBlock: number;
  /** Level-2 probability of the word within its block. */
  pWord: number;
}

export interface BlockPick {
  id: string;
  title: string;
  p: number;
  /** True for the blocks whose 255 words were put to Jev at level 2. */
  opened: boolean;
}

export interface ShortlistEntry {
  block: string;
  title: string;
  pBlock: number;
  /** How many of the block's words went through to level 3. */
  quota: number;
}

export interface CallTrace {
  level: 1 | 2 | 3;
  ms: number;
  request: { state: JevState; questions: Record<string, unknown> };
  response: unknown;
}

export interface PredictResult {
  context: string;
  fragment: string;
  model: string;
  /** Blocks opened at level 2. */
  fanout: number;
  /** Top blocks from level 1 (at least the opened ones), highest probability first. */
  blocks: BlockPick[];
  /** How the 255 level-3 candidates were drawn from the opened blocks. */
  shortlist: ShortlistEntry[];
  /** Top candidates from level 3, highest probability first. */
  candidates: Candidate[];
  /** The suggestion: the top candidate at temperature 0, otherwise sampled from `candidates`. */
  chosen: Candidate;
  temperature: number;
  usage: { input_tokens: number; output_tokens: number };
  timing: { level1_ms: number; level2_ms: number; level3_ms: number; total_ms: number };
  /** Exact requests and responses, for anyone who wants to check what Jev was asked. */
  trace: CallTrace[];
}

export interface PredictOptions {
  /** Blocks to open at level 2. */
  fanout?: number;
  /** Return at most this many candidates; the suggestion is sampled from among them. */
  limit?: number;
  /** 0 always suggests the top candidate; higher values sample from Jev's distribution more freely. */
  temperature?: number;
}

const PUNCTUATION = new Set([".", ",", "?", "!"]);
/** Punctuation is offered to Jev alongside words (see scripts/build_blocks.py). */
export const isPunctuation = (word: string): boolean => PUNCTUATION.has(word);

const BLANK = "____";
const SHORTLIST_SIZE = 255;
const SHORTLIST_MIN = 8;
const SHORTLIST_MAX = 128;
/** Sampling only ever draws from the smallest set of candidates covering this much probability. */
const TOP_P = 0.9;

/**
 * Every question is framed as filling in a blank at the cursor. Decision models
 * tend to favour options that already appear in the input, which makes a plain
 * "what comes next?" question echo the last word typed; a blank with worked
 * examples keeps the model looking past the text rather than into it.
 */
const TASK = {
  task:
    "A person is writing English one keystroke at a time. `text` is what they have written so far, and " +
    `${BLANK} marks their cursor: the next word goes there. ` +
    "Predict the word that an articulate person, speaking clearly and eloquently, would most naturally say next.",
  rules: [
    `The answer fills ${BLANK} and comes after everything in \`text\`. The words already in the text have been said; ` +
      "they are not the answer, and the answer is not a repeat of the word just before the blank.",
    "Good speech moves forward. After a description comes the thing described, a linking word, or the next part of " +
      "the sentence, never another synonym. After a subject comes a verb; after a verb comes what it acts on.",
    "Prefer the plain, natural word a clear speaker would use over a rare or flowery one, unless the text itself is formal.",
    "Punctuation marks are options too: choose '.' when the sentence is complete, ',' where a clear speaker would " +
      "pause before continuing, '?' after a question. A sentence that has said its piece should end.",
    "If `partial_word` is not empty, the writer has already typed those letters of the next word, so the answer " +
      "starts with exactly those letters and is the complete word.",
  ],
  examples: [
    { text: `See you ${BLANK}`, partial_word: "", answer: "tomorrow", kind: "time word" },
    { text: `The view from up here is stunning ${BLANK}`, partial_word: "", answer: "at", kind: "function word (preposition)" },
    { text: `I can't believe how m${BLANK}`, partial_word: "m", answer: "much", kind: "adverb of degree" },
    { text: `It was a very very ${BLANK}`, partial_word: "", answer: "long", kind: "adjective" },
    { text: `Honestly, I think we should ${BLANK}`, partial_word: "", answer: "wait", kind: "verb" },
    { text: `That is everything I wanted to say ${BLANK}`, partial_word: "", answer: ".", kind: "punctuation" },
    { text: `If you ask me ${BLANK}`, partial_word: "", answer: ",", kind: "punctuation" },
  ],
};

const LEVEL1_INSTRUCTIONS = {
  ...TASK,
  question:
    `Which block of the dictionary contains the word that fills ${BLANK}? ` +
    "Think first about what kind of word the sentence needs next (a noun, a verb, a linking word, a name, ...), " +
    "then choose the block whose theme fits. Each option is a block of 255 words sharing a theme, described by " +
    "the theme and some example words from the block.",
};

const LEVEL2_INSTRUCTIONS = {
  ...TASK,
  question:
    `Which of these words fills ${BLANK}? Each option is one candidate word from a single themed block of the ` +
    "dictionary. Rank them by how naturally each would continue the text.",
};

const LEVEL3_INSTRUCTIONS = {
  ...TASK,
  question:
    `Which of these words fills ${BLANK}? ` +
    "Each option is one candidate word. Its description shows the end of the text with that word in the blank; " +
    "choose the candidate a clear, articulate speaker would most naturally say next.",
};

/** The last few words before the cursor, used to show each level-3 candidate in place. */
function lastWords(context: string, n = 4): string {
  return context.trim().split(/\s+/).filter(Boolean).slice(-n).join(" ");
}

export const level1Question = () => choice(LEVEL1_INSTRUCTIONS, level1Criteria);

/** Level-2 options are a block's 255 words, undescribed: this round only shortlists within the block. */
export const level2Question = (blockId: string) => choice(LEVEL2_INSTRUCTIONS, level2Criteria(blockId));

/**
 * Level-3 options are the shortlisted words. When there is text before the cursor, each is
 * described as the end of that text with the word filled in ("Hello how are"), so Jev judges
 * phrases rather than bare words. With no text yet, descriptions are omitted.
 */
export const level3Question = (words: string[], context: string) => {
  const tail = lastWords(context);
  const criteria = Object.create(null) as Record<string, string | null>;
  for (const word of words) {
    criteria[word] = tail ? (isPunctuation(word) ? `${tail}${word}` : `${tail} ${word}`) : null;
  }
  return choice(LEVEL3_INSTRUCTIONS, criteria);
};

/**
 * Splits `total` shortlist slots among the opened blocks in proportion to their level-1
 * probabilities, with a floor so every opened block is represented and a cap so no block
 * dominates. The floor and cap are relaxed when they cannot be met.
 */
export function allocate(probs: number[], total = SHORTLIST_SIZE, min = SHORTLIST_MIN, max = SHORTLIST_MAX): number[] {
  const n = probs.length;
  if (n === 0) return [];
  min = Math.min(min, Math.floor(total / n));
  max = Math.max(max, Math.ceil(total / n));
  const sum = probs.reduce((a, b) => a + b, 0) || 1;
  const quotas = probs.map((p) => Math.min(max, Math.max(min, Math.floor((p / sum) * total))));
  let diff = total - quotas.reduce((a, b) => a + b, 0);
  const order = probs.map((_, i) => i).sort((a, b) => probs[b] - probs[a]);
  for (let guard = 0; diff !== 0 && guard < 10 * total; guard++) {
    for (const i of order) {
      if (diff > 0 && quotas[i] < max) {
        quotas[i]++;
        diff--;
      } else if (diff < 0 && quotas[i] > min) {
        quotas[i]--;
        diff++;
      }
      if (diff === 0) break;
    }
  }
  return quotas;
}

/**
 * Index of a candidate drawn with probability proportional to p^(1/temperature), from the
 * nucleus of candidates covering TOP_P of the mass; 0 means the top one.
 */
function sampleIndex(candidates: Candidate[], temperature: number): number {
  if (temperature <= 0 || candidates.length <= 1) return 0;
  const total = candidates.reduce((a, c) => a + c.p, 0) || 1;
  let acc = 0;
  let n = 0;
  for (const c of candidates) {
    acc += c.p;
    n++;
    if (acc / total >= TOP_P) break;
  }
  const weights = candidates.slice(0, n).map((c) => Math.pow(Math.max(c.p, 1e-12), 1 / temperature));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function sortedEntries(probabilities: Readonly<Record<string, number>>): [string, number][] {
  return Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
}

/** Replaces each many-option criteria object in the trace with a count, to keep API responses small. */
export function summariseTrace(result: PredictResult): PredictResult {
  const trace = result.trace.map((call) => ({
    ...call,
    request: {
      ...call.request,
      questions: Object.fromEntries(
        Object.entries(call.request.questions).map(([name, q]) => {
          const question = q as { type: string; instructions: unknown; criteria: Record<string, unknown> };
          return [name, { ...question, criteria: `<${Object.keys(question.criteria).length} options omitted>` }];
        }),
      ),
    },
  }));
  return { ...result, trace };
}

export async function predict(rawText: string, options: PredictOptions = {}): Promise<PredictResult> {
  const fanout = Math.max(1, Math.min(options.fanout ?? defaultFanout(), 12));
  const limit = options.limit ?? 10;
  const temperature = Math.max(0, Math.min(options.temperature ?? defaultTemperature(), 2));
  const client = getJevClient();

  const { context, fragment } = splitInput(rawText);
  const shown = tailContext(context);
  const partial = fragment.toLowerCase();
  // "Hello how ____", or "Hello how a____" while a word is being typed.
  const separator = shown && !/\s$/.test(shown) && !partial ? " " : "";
  const state: JevState = { text: `${shown}${separator}${partial}${BLANK}`, partial_word: partial };

  // Level 1: which themed blocks?
  const t0 = performance.now();
  const q1 = { block: level1Question() };
  const r1 = await client.systemOne({ state, questions: q1 });
  const t1 = performance.now();
  const ranked = sortedEntries(r1.answers.block.probabilities).map(([id, p], i) => ({
    id,
    title: blockById(id).title,
    p,
    opened: i < fanout,
  }));
  const opened = ranked.filter((b) => b.opened);

  // Level 2: shortlist within each opened block, all in one request.
  const q2: Questions = Object.fromEntries(opened.map((b) => [b.id, level2Question(b.id)]));
  const r2 = (await client.systemOne({ state, questions: q2 })) as SystemOneResult<Questions>;
  const t2 = performance.now();
  const quotas = allocate(opened.map((b) => b.p));
  const shortlist: ShortlistEntry[] = [];
  const shortlisted: { word: string; block: string; pBlock: number; pWord: number }[] = [];
  opened.forEach((b, i) => {
    const answer = r2.answers[b.id] as ChoiceResponse;
    const top = sortedEntries(answer.probabilities).slice(0, quotas[i]);
    shortlist.push({ block: b.id, title: b.title, pBlock: b.p, quota: top.length });
    for (const [word, pWord] of top) shortlisted.push({ word, block: b.id, pBlock: b.p, pWord });
  });

  // Level 3: which of the shortlisted words?
  const q3 = { word: level3Question(shortlisted.map((s) => s.word), shown) };
  const r3 = await client.systemOne({ state, questions: q3 });
  const t3 = performance.now();
  const byWord = new Map(shortlisted.map((s) => [s.word, s]));
  const candidates: Candidate[] = sortedEntries(r3.answers.word.probabilities).map(([word, p]) => {
    const s = byWord.get(word)!;
    return { word, block: s.block, p, pBlock: s.pBlock, pWord: s.pWord };
  });
  const top = candidates.slice(0, limit);
  const chosen = top[sampleIndex(top, temperature)];

  return {
    context,
    fragment,
    model: r3.model,
    fanout,
    blocks: ranked.slice(0, Math.max(fanout, 5)),
    shortlist,
    candidates: top,
    chosen,
    temperature,
    usage: {
      input_tokens: r1.usage.input_tokens + r2.usage.input_tokens + r3.usage.input_tokens,
      output_tokens: r1.usage.output_tokens + r2.usage.output_tokens + r3.usage.output_tokens,
    },
    timing: {
      level1_ms: Math.round(t1 - t0),
      level2_ms: Math.round(t2 - t1),
      level3_ms: Math.round(t3 - t2),
      total_ms: Math.round(t3 - t0),
    },
    trace: [
      { level: 1, ms: Math.round(t1 - t0), request: { state, questions: q1 }, response: r1 },
      { level: 2, ms: Math.round(t2 - t1), request: { state, questions: q2 }, response: r2 },
      { level: 3, ms: Math.round(t3 - t2), request: { state, questions: q3 }, response: r3 },
    ],
  };
}
