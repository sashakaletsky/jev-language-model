import { test } from "node:test";
import assert from "node:assert/strict";
import { endsMidWord, normalise, tailContext } from "../lib/tokenize.ts";

test("endsMidWord is true only while a word is being typed", () => {
  assert.equal(endsMidWord("I want to"), true);
  assert.equal(endsMidWord("don'"), true);
  assert.equal(endsMidWord("2024"), true);
  assert.equal(endsMidWord("I want to "), false);
  assert.equal(endsMidWord("Hello."), false);
  assert.equal(endsMidWord(""), false);
});

test("normalise straightens curly apostrophes", () => {
  assert.equal(normalise("don’t ‘quote’"), "don't 'quote'");
});

test("tailContext keeps only the end of a long context", () => {
  const long = "x".repeat(1000);
  assert.equal(tailContext(long, 600).length, 600);
  assert.equal(tailContext("short", 600), "short");
});
