/**
 * Next-word prediction, done entirely by Jev in two Choice questions.
 *
 *   Level 1: given the text, which of the 255 themed blocks holds the next word?
 *   Level 2: given the text, which of that block's 255 words is it?
 *
 * Code contributes nothing linguistic: it splits the text into context and the
 * partial word (see tokenize.ts), sends both questions, multiplies the two
 * probabilities Jev returns, and sorts. No prefix matching, no frequency data,
 * no other model.
 */
import { choice } from "@typesafe-ai/sdk";
import type { ChoiceResponse, SystemOneResult, Questions } from "@typesafe-ai/sdk";
import { blockById, level1Criteria, level2Criteria } from "./blocks";
import { defaultFanout, getJevClient } from "./jev";
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
  /** P(block) * P(word | block) */
  p: number;
  pBlock: number;
  pWord: number;
}

export interface BlockPick {
  id: string;
  title: string;
  p: number;
  /** True for the blocks whose 255 words were put to Jev at level 2. */
  opened: boolean;
}

export interface CallTrace {
  level: 1 | 2;
  ms: number;
  request: { state: JevState; questions: Record<string, unknown> };
  response: unknown;
}

export interface PredictResult {
  context: string;
  fragment: string;
  model: string;
  fanout: number;
  /** Top blocks from level 1 (at least the opened ones, plus a few runners-up), highest probability first. */
  blocks: BlockPick[];
  /** Top candidate words across the opened blocks, highest combined probability first. */
  candidates: Candidate[];
  usage: { input_tokens: number; output_tokens: number };
  timing: { level1_ms: number; level2_ms: number; total_ms: number };
  /** Exact requests and responses, for anyone who wants to check what Jev was asked. */
  trace: CallTrace[];
}

export interface PredictOptions {
  fanout?: number;
  /** Return at most this many candidates. */
  limit?: number;
}

const BLANK = "____";

/**
 * Both questions are framed as filling in a blank at the cursor. Decision models
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
    "If `partial_word` is not empty, the writer has already typed those letters of the next word, so the answer " +
      "starts with exactly those letters and is the complete word.",
  ],
  examples: [
    { text: `See you ${BLANK}`, partial_word: "", answer: "tomorrow", kind: "time word" },
    { text: `The view from up here is stunning ${BLANK}`, partial_word: "", answer: "at", kind: "function word (preposition)" },
    { text: `I can't believe how m${BLANK}`, partial_word: "m", answer: "much", kind: "adverb of degree" },
    { text: `It was a very very ${BLANK}`, partial_word: "", answer: "long", kind: "adjective" },
    { text: `Honestly, I think we should ${BLANK}`, partial_word: "", answer: "wait", kind: "verb" },
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
    `Which of these words fills ${BLANK}? ` +
    "Each option is one candidate word. Its description shows the end of the text with that word in the blank; " +
    "choose the candidate a clear, articulate speaker would most naturally say next.",
};

/** The last few words before the cursor, used to show each level-2 candidate in place. */
function lastWords(context: string, n = 4): string {
  return context.trim().split(/\s+/).filter(Boolean).slice(-n).join(" ");
}

export const level1Question = () => choice(LEVEL1_INSTRUCTIONS, level1Criteria);

/**
 * Level-2 options are the block's 255 words. When there is text before the cursor, each
 * option is described as the end of that text with the word filled in ("Hello how are"),
 * so Jev judges phrases rather than bare words. With no text yet, descriptions are omitted.
 */
export const level2Question = (blockId: string, context: string) => {
  const tail = lastWords(context);
  if (!tail) return choice(LEVEL2_INSTRUCTIONS, level2Criteria(blockId));
  const criteria = Object.create(null) as Record<string, string>;
  for (const word of blockById(blockId).words) criteria[word] = `${tail} ${word}`;
  return choice(LEVEL2_INSTRUCTIONS, criteria);
};

function sortedEntries(probabilities: Readonly<Record<string, number>>): [string, number][] {
  return Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
}

/** Replaces each 255-option criteria object in the trace with a count, to keep API responses small. */
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
  const fanout = Math.max(1, Math.min(options.fanout ?? defaultFanout(), 8));
  const limit = options.limit ?? 10;
  const client = getJevClient();

  const { context, fragment } = splitInput(rawText);
  const shown = tailContext(context);
  const partial = fragment.toLowerCase();
  // "Hello how ____", or "Hello how a____" while a word is being typed.
  const separator = shown && !/\s$/.test(shown) && !partial ? " " : "";
  const state: JevState = { text: `${shown}${separator}${partial}${BLANK}`, partial_word: partial };

  // Level 1: which themed block?
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
  const blockPicks = ranked.filter((b) => b.opened);

  // Level 2: which word, asked for each opened block in one request.
  const q2: Questions = Object.fromEntries(blockPicks.map((b) => [b.id, level2Question(b.id, shown)]));
  const r2 = (await client.systemOne({ state, questions: q2 })) as SystemOneResult<Questions>;
  const t2 = performance.now();

  const candidates: Candidate[] = [];
  for (const pick of blockPicks) {
    const answer = r2.answers[pick.id] as ChoiceResponse;
    for (const [word, pWord] of Object.entries(answer.probabilities)) {
      candidates.push({ word, block: pick.id, pBlock: pick.p, pWord, p: pick.p * pWord });
    }
  }
  candidates.sort((a, b) => b.p - a.p);

  return {
    context,
    fragment,
    model: r2.model,
    fanout,
    blocks: ranked.slice(0, Math.max(fanout, 5)),
    candidates: candidates.slice(0, limit),
    usage: {
      input_tokens: r1.usage.input_tokens + r2.usage.input_tokens,
      output_tokens: r1.usage.output_tokens + r2.usage.output_tokens,
    },
    timing: {
      level1_ms: Math.round(t1 - t0),
      level2_ms: Math.round(t2 - t1),
      total_ms: Math.round(t2 - t0),
    },
    trace: [
      { level: 1, ms: Math.round(t1 - t0), request: { state, questions: q1 }, response: r1 },
      { level: 2, ms: Math.round(t2 - t1), request: { state, questions: q2 }, response: r2 },
    ],
  };
}
