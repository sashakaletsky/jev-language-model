/**
 * The only text processing in the inference path, and it is purely mechanical.
 *
 * The word is the unit of prediction: Jev is asked what comes after the text once
 * a word has been finished with a space or a punctuation mark, never mid-word.
 * No filtering, ranking or matching of dictionary words happens here or anywhere
 * else in code.
 */

const CURLY_APOSTROPHES = /[‘’]/g;

/** Straightens curly apostrophes so "don’t" and "don't" read the same. */
export function normalise(raw: string): string {
  return raw.replace(CURLY_APOSTROPHES, "'");
}

/** True while a word is still being typed, i.e. the text ends in a letter, digit or apostrophe. */
export function endsMidWord(text: string): boolean {
  return /[A-Za-z0-9']$/.test(text);
}

/** Keeps the request bounded: only the last `maxChars` characters of context are sent. */
export function tailContext(context: string, maxChars = 600): string {
  if (context.length <= maxChars) return context;
  return context.slice(context.length - maxChars);
}
