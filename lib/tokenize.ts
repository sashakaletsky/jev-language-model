/**
 * Splits the raw editor text into what Jev is shown as state.
 *
 * This is the only text processing in the inference path, and it is purely
 * mechanical: the trailing run of letters/apostrophes is the word being typed
 * (`fragment`), everything before it is `context`. No filtering, ranking or
 * matching of dictionary words happens here or anywhere else in code.
 */
export interface SplitInput {
  /** Text before the word currently being typed. */
  context: string;
  /** The letters typed so far of the current word; empty right after a space or punctuation. */
  fragment: string;
}

const CURLY_APOSTROPHES = /[‘’]/g;
const TRAILING_WORD = /[A-Za-z][A-Za-z']*$/;

export function splitInput(raw: string): SplitInput {
  const text = raw.replace(CURLY_APOSTROPHES, "'");
  const match = TRAILING_WORD.exec(text);
  if (!match) return { context: text, fragment: "" };
  return { context: text.slice(0, match.index), fragment: match[0] };
}

/** Keeps the request bounded: only the last `maxChars` characters of context are sent. */
export function tailContext(context: string, maxChars = 600): string {
  if (context.length <= maxChars) return context;
  return context.slice(context.length - maxChars);
}
