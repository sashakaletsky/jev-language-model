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
  text: string;
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

const TASK =
  "A person is typing English text, one keystroke at a time. `text` is everything they have typed so far. " +
  "`partial_word` is the beginning of the word they are typing right now; it is empty when they have just finished a word. " +
  "Predict the next word they intend to type. If `partial_word` is not empty, the intended word must start with exactly those letters.";

const LEVEL1_INSTRUCTIONS = {
  task: TASK,
  question:
    "Which block of the dictionary contains the word they intend to type next? " +
    "Each option is a block of 255 words sharing a theme, described by the theme and some example words from the block. " +
    "Choose the block most likely to contain that word.",
};

const LEVEL2_INSTRUCTIONS = {
  task: TASK,
  question:
    "Which of these words is the one they intend to type next? " +
    "Choose the word that best continues `text`, and that starts with `partial_word` when it is not empty.",
};

export const level1Question = () => choice(LEVEL1_INSTRUCTIONS, level1Criteria);
export const level2Question = (blockId: string) => choice(LEVEL2_INSTRUCTIONS, level2Criteria(blockId));

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
  const state: JevState = { text: tailContext(context), partial_word: fragment.toLowerCase() };

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
  const q2: Questions = Object.fromEntries(blockPicks.map((b) => [b.id, level2Question(b.id)]));
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
