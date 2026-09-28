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
import { choice, noul } from "@typesafe-ai/sdk";
import type { ChoiceResponse, SystemOneResult, Questions } from "@typesafe-ai/sdk";
import { blockById, level1Criteria, level2Criteria } from "./blocks";
import { defaultFanout, defaultTemperature, getJevClient } from "./jev";
import { normalise, tailContext } from "./tokenize";

/** What Jev is shown. A type literal rather than an interface so it satisfies the SDK's JSON state type. */
export type JevState = {
  /** The text typed so far, with a blank (____) where the next word goes. */
  text: string;
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
  /** Set when a level was sent as several requests, e.g. "batch 2 of 3". */
  part?: string;
  ms: number;
  request: { state: JevState; questions: Record<string, unknown> };
  response: unknown;
}

export interface PredictResult {
  /** The text the prediction was made for, exactly as received. */
  context: string;
  model: string;
  /** Jev's answer to "could a punctuation mark legitimately come next?", asked alongside level 1. */
  marks: { allowed: boolean; p: number };
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
const SHORTLIST_MAX = 128;
/** Level-2 questions per request; more opened blocks are asked in parallel batches. */
const LEVEL2_BATCH = 10;

/** Floor on words per opened block: generous with few blocks, minimal with many, so the likeliest keep depth. */
function shortlistFloor(opened: number): number {
  return opened > 20 ? 2 : opened > 10 ? 4 : 8;
}
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
    "A person is writing English one word at a time. `text` is what they have written so far, and " +
    `${BLANK} marks where their next word goes. ` +
    "Predict the word that an articulate person, speaking clearly and eloquently, would most naturally say next.",
  rules: [
    `The answer fills ${BLANK} and comes after everything in \`text\`. The words already in the text have been said; ` +
      "they are not the answer, and the answer is not a repeat of the word just before the blank.",
    "Good speech moves forward. After a description comes the thing described, a linking word, or the next part of " +
      "the sentence, never another synonym. After a subject comes a verb; after a verb comes what it acts on.",
    "Prefer the plain, natural word a clear speaker would use over a rare or flowery one, unless the text itself is formal.",
    "Punctuation marks are options too: choose '.' when the sentence is complete, ',' where a clear speaker would " +
      "pause before continuing, '?' after a question. A sentence that has said its piece should end.",
    "If `text` already ends with '.', '?' or '!', that sentence is finished: the answer is the first word of a new " +
      "sentence, never another punctuation mark. If it ends with ',', the same sentence continues with a word.",
    "A new sentence begins a new thought. It should move on from the previous sentence and add something new, in " +
      "the same voice, rather than restate it, list more of the same, or repeat its words.",
  ],
  examples: [
    { text: `See you ${BLANK}`, answer: "tomorrow", kind: "time word" },
    { text: `The view from up here is stunning ${BLANK}`, answer: "at", kind: "function word (preposition)" },
    { text: `I can't believe how ${BLANK}`, answer: "much", kind: "adverb of degree" },
    { text: `It was a very very ${BLANK}`, answer: "long", kind: "adjective" },
    { text: `Honestly, I think we should ${BLANK}`, answer: "wait", kind: "verb" },
    { text: `That is everything I wanted to say ${BLANK}`, answer: ".", kind: "punctuation" },
    { text: `If you ask me ${BLANK}`, answer: ",", kind: "punctuation" },
    { text: `We had a wonderful time. ${BLANK}`, answer: "thank", kind: "first word of a new sentence" },
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

/** Sent once per opened block, so kept short; the full task description travels with levels 1 and 3. */
const LEVEL2_INSTRUCTIONS = {
  task:
    `A person is writing English. \`text\` is what they have written so far and ${BLANK} marks where the next word goes. ` +
    "Which of these words would an articulate, clear speaker most naturally say next, in the blank?",
  rules: [
    "The answer comes after the text; it is not a word the text already ends with.",
    `If \`text\` ends with '.', '?' or '!', the answer starts a new sentence.`,
  ],
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
  // After a sentence ends, show each candidate as a sentence opener: "the world. Offers".
  const opener = /[.?!]$/.test(tail);
  const criteria = Object.create(null) as Record<string, string | null>;
  for (const word of words) {
    if (!tail) criteria[word] = null;
    else if (isPunctuation(word)) criteria[word] = `${tail}${word}`;
    else criteria[word] = `${tail} ${opener ? word[0].toUpperCase() + word.slice(1) : word}`;
  }
  return choice(LEVEL3_INSTRUCTIONS, criteria);
};

/**
 * Asked alongside level 1: may a punctuation mark come next? When Jev says no, because the text
 * is empty or already ends with a mark, the four marks are left out of the shortlist. Without this
 * a stray "." can echo into ".." and then "...", whatever the other instructions say.
 */
export const marksQuestion = () =>
  noul(
    {
      task:
        `\`text\` is what a person has written so far, with ${BLANK} marking where the next word goes. ` +
        "Could the next thing they write legitimately be a punctuation mark such as . , ? or !",
      rules: [
        "Yes only if the text right before the blank ends with a word (letters or digits) or a closing quote or bracket.",
        "No if the text is empty, or if it already ends with a punctuation mark: English never puts one mark straight after another.",
      ],
    },
    {
      true: "The text ends with a word, so a punctuation mark could follow.",
      false: "The text is empty or already ends with a punctuation mark, so another mark cannot follow.",
    },
  );

/**
 * Splits `total` shortlist slots among the opened blocks in proportion to their level-1
 * probabilities, with a floor so every opened block is represented and a cap so no block
 * dominates. The floor and cap are relaxed when they cannot be met.
 */
export function allocate(probs: number[], total = SHORTLIST_SIZE, min = shortlistFloor(probs.length), max = SHORTLIST_MAX): number[] {
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
          const question = q as { type: string; instructions: unknown; criteria?: Record<string, unknown> | null };
          const n = question.criteria ? Object.keys(question.criteria).length : 0;
          return [name, n > 10 ? { ...question, criteria: `<${n} options omitted>` } : question];
        }),
      ),
    },
  }));
  return { ...result, trace };
}

export async function predict(rawText: string, options: PredictOptions = {}): Promise<PredictResult> {
  const fanout = Math.max(1, Math.min(options.fanout ?? defaultFanout(), 50));
  const limit = options.limit ?? 10;
  const temperature = Math.max(0, Math.min(options.temperature ?? defaultTemperature(), 2));
  const client = getJevClient();

  const context = normalise(rawText);
  const shown = tailContext(context);
  // "Hello how ____"; the blank always stands for a whole word.
  const separator = shown && !/\s$/.test(shown) ? " " : "";
  const state: JevState = { text: `${shown}${separator}${BLANK}` };

  // Level 1: which themed blocks? Plus, in the same request, may a punctuation mark come next?
  const t0 = performance.now();
  const q1 = { block: level1Question(), marks_allowed: marksQuestion() };
  const r1 = await client.systemOne({ state, questions: q1 });
  const t1 = performance.now();
  const marks = { allowed: r1.answers.marks_allowed.noul >= 0.5, p: r1.answers.marks_allowed.noul };
  const ranked = sortedEntries(r1.answers.block.probabilities).map(([id, p], i) => ({
    id,
    title: blockById(id).title,
    p,
    opened: i < fanout,
  }));
  const opened = ranked.filter((b) => b.opened);

  // Level 2: shortlist within each opened block, in parallel batches of LEVEL2_BATCH questions.
  const batches: BlockPick[][] = [];
  for (let i = 0; i < opened.length; i += LEVEL2_BATCH) batches.push(opened.slice(i, i + LEVEL2_BATCH));
  const level2 = await Promise.all(
    batches.map(async (batch) => {
      const questions: Questions = Object.fromEntries(batch.map((b) => [b.id, level2Question(b.id)]));
      const started = performance.now();
      const response = (await client.systemOne({ state, questions })) as SystemOneResult<Questions>;
      return { questions, response, ms: Math.round(performance.now() - started) };
    }),
  );
  const t2 = performance.now();
  const answers2: Record<string, ChoiceResponse> = {};
  for (const { response } of level2) {
    for (const [id, answer] of Object.entries(response.answers)) answers2[id] = answer as ChoiceResponse;
  }
  const quotas = allocate(opened.map((b) => b.p));
  const allowMarks = marks.allowed;
  const shortlist: ShortlistEntry[] = [];
  const shortlisted: { word: string; block: string; pBlock: number; pWord: number }[] = [];
  opened.forEach((b, i) => {
    const answer = answers2[b.id];
    const top = sortedEntries(answer.probabilities)
      .filter(([word]) => allowMarks || !isPunctuation(word))
      .slice(0, quotas[i]);
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
    context: rawText,
    model: r3.model,
    marks,
    fanout,
    blocks: ranked.slice(0, Math.max(fanout, 5)),
    shortlist,
    candidates: top,
    chosen,
    temperature,
    usage: {
      input_tokens: r1.usage.input_tokens + level2.reduce((n, l) => n + l.response.usage.input_tokens, 0) + r3.usage.input_tokens,
      output_tokens: r1.usage.output_tokens + level2.reduce((n, l) => n + l.response.usage.output_tokens, 0) + r3.usage.output_tokens,
    },
    timing: {
      level1_ms: Math.round(t1 - t0),
      level2_ms: Math.round(t2 - t1),
      level3_ms: Math.round(t3 - t2),
      total_ms: Math.round(t3 - t0),
    },
    trace: [
      { level: 1, ms: Math.round(t1 - t0), request: { state, questions: q1 }, response: r1 },
      ...level2.map((l, i) => ({
        level: 2 as const,
        part: level2.length > 1 ? `batch ${i + 1} of ${level2.length}` : undefined,
        ms: l.ms,
        request: { state, questions: l.questions },
        response: l.response,
      })),
      { level: 3, ms: Math.round(t3 - t2), request: { state, questions: q3 }, response: r3 },
    ],
  };
}
