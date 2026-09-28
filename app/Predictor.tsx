"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PredictResult } from "@/lib/predict";
import { endsMidWord } from "@/lib/tokenize";
import DecisionTree from "./DecisionTree";

const DEBOUNCE_MS = 250;
/** Dollars per million input tokens. Jev's published rate is $0.042, with output tokens free; override it with the env var. */
const PRICE_PER_M = Number(process.env.NEXT_PUBLIC_JEV_PRICE_PER_M_INPUT_TOKENS ?? "") || 0.042;
const PUNCTUATION = new Set([".", ",", "?", "!"]);
const DEFAULT_FANOUT = 30;
const DEFAULT_TEMPERATURE = 0.8;
const FANOUTS = [5, 10, 20, 30, 50];
const TEMPERATURES = [0, 0.5, 0.8, 1, 1.3];

interface Suggestion {
  word: string;
  /** "word": a whole word to append. "punctuation": a mark that attaches to the previous word. */
  mode: "word" | "punctuation";
  /** What the ghost shows: the word, with a leading space when the text does not end in one. */
  display: string;
}

/** Presentation only: capitalise at sentence starts and for "I". */
function capitalise(word: string, context: string): string {
  const atSentenceStart = context.trim() === "" || /[.!?]\s*$/.test(context);
  const isI = word === "i" || word.startsWith("i'");
  if (atSentenceStart || isI) return word[0].toUpperCase() + word.slice(1);
  return word;
}

function suggestionFor(result: PredictResult): Suggestion | null {
  const pick = result.chosen ?? result.candidates[0];
  if (!pick) return null;
  if (PUNCTUATION.has(pick.word)) return { word: pick.word, mode: "punctuation", display: pick.word };
  const word = capitalise(pick.word, result.context);
  const needsSpace = result.context.length > 0 && !/\s$/.test(result.context);
  return { word, mode: "word", display: needsSpace ? ` ${word}` : word };
}

/**
 * The editor, the tree of what Jev decided, and, at the very bottom, the settings.
 * Whatever is passed as children (the explanation of the rules) sits between the tree and the settings.
 */
export default function Predictor({ children }: { children?: React.ReactNode }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<PredictResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fanout, setFanout] = useState(DEFAULT_FANOUT);
  const [temperature, setTemperature] = useState(DEFAULT_TEMPERATURE);
  const [showRaw, setShowRaw] = useState(false);
  const [rawTrace, setRawTrace] = useState<PredictResult | null>(null);
  // Everything this visitor has asked Jev in this session: predictions, API requests, input tokens.
  const [totals, setTotals] = useState({ predictions: 0, calls: 0, tokens: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef(new Map<string, PredictResult>());

  const suggestion = useMemo(() => (result && result.context === text ? suggestionFor(result) : null), [result, text]);

  const request = useCallback(
    async (value: string, wantRaw: boolean) => {
      const key = `${fanout}\u0000${temperature}\u0000${value}`;
      const hit = cacheRef.current.get(key);
      if (hit && !wantRaw) {
        setResult(hit);
        setError(null);
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const res = await fetch("/api/predict", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: value, fanout, temperature, trace: wantRaw ? "full" : "summary" }),
          signal: controller.signal,
        });
        const data = (await res.json()) as PredictResult & { error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (!hit) {
          cacheRef.current.set(key, data);
          setTotals((t) => ({ predictions: t.predictions + 1, calls: t.calls + data.trace.length, tokens: t.tokens + data.usage.input_tokens }));
        }
        setResult(data);
        if (wantRaw) setRawTrace(data);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [fanout, temperature],
  );

  // Debounced prediction whenever a word has been finished. Nothing is asked mid-word or on an empty editor.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (text.trim() === "" || endsMidWord(text)) return;
    timerRef.current = setTimeout(() => void request(text, false), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text, request]);

  useEffect(() => {
    if (showRaw && result && (!rawTrace || rawTrace.context !== text)) void request(text, true);
  }, [showRaw, result, rawTrace, text, request]);

  // Keep the textarea sized to its content so the ghost-text overlay lines up.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const accept = () => {
    if (!suggestion || !result) return;
    const next = suggestion.mode === "punctuation" ? `${text.replace(/\s+$/, "")}${suggestion.word} ` : `${text}${suggestion.display} `;
    setText(next);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) el.setSelectionRange(next.length, next.length);
    });
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    if (value.trim() === "") {
      abortRef.current?.abort();
      setResult(null);
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab" && suggestion) {
      e.preventDefault();
      accept();
    } else if (e.key === "Escape") {
      setResult(null);
    }
  };

  const dollars = (tokens: number) => (tokens / 1e6) * PRICE_PER_M;
  const money = (d: number) => `$${d.toFixed(d < 0.1 ? 4 : 3)}`;
  const spent = dollars(totals.tokens);
  const statusText = loading ? "asking Jev…" : suggestion ? "Tab to accept" : endsMidWord(text) ? "finish the word to get a suggestion" : " ";
  const customised = fanout !== DEFAULT_FANOUT || temperature !== DEFAULT_TEMPERATURE;

  return (
    <div className="predictor">
      <section className="editor-wrap" aria-label="Editor">
        <div className="editor">
          <div className="mirror" aria-hidden="true">
            <span className="typed">{text}</span>
            {suggestion && <span className={`ghost ${suggestion.mode}`}>{suggestion.display}</span>}
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder="Start typing. After each word, Jev suggests the next one. Tab accepts."
            spellCheck={false}
            autoFocus
            rows={3}
          />
        </div>
        <div className="editor-bar">
          <span className={`status ${loading ? "busy" : ""}`}>{statusText}</span>
          <span
            className="spend"
            title={`${totals.predictions} ${totals.predictions === 1 ? "prediction" : "predictions"} · ${totals.tokens.toLocaleString()} input tokens at $${PRICE_PER_M} per million; output tokens are free. Repeats answered from the cache cost nothing.`}
          >
            You have spent ≈ {money(spent)} <span className="muted">· {totals.calls} Jev {totals.calls === 1 ? "call" : "calls"}</span>
          </span>
          <button type="button" className="accept" onClick={accept} disabled={!suggestion}>
            Accept · Tab
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="decisions" aria-label="What Jev decided">
        <div className="section-head">
          <p className="eyebrow">What Jev decided</p>
          {result && (
            <p className="muted small">
              Edge thickness follows Jev&rsquo;s probability. Yellow is the path to the suggestion.
              {customised && ` ${fanout} blocks opened, temperature ${temperature}.`}
            </p>
          )}
        </div>
        {!result && <p className="muted placeholder">Type a word and a space. The three decisions Jev makes for every word are drawn here.</p>}
        {result && <DecisionTree result={result} />}
        {result && (
          <p className="stats-line muted">
            {result.timing.total_ms} ms ({result.timing.level1_ms} + {result.timing.level2_ms} + {result.timing.level3_ms}) ·{" "}
            {result.trace.length} Jev calls · {result.usage.input_tokens.toLocaleString()} tokens in, {result.usage.output_tokens} out · ≈{money(dollars(result.usage.input_tokens))} ·{" "}
            {result.model}
          </p>
        )}
      </section>

      {children}

      <details className="settings">
        <summary>Settings</summary>
        <div className="settings-body">
          <label>
            Blocks opened at level 2
            <select value={fanout} onChange={(e) => setFanout(Number(e.target.value))}>
              {FANOUTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                  {n === DEFAULT_FANOUT ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Temperature
            <select value={temperature} onChange={(e) => setTemperature(Number(e.target.value))}>
              {TEMPERATURES.map((t) => (
                <option key={t} value={t}>
                  {t === 0 ? "0 (always the top word)" : t.toFixed(1)}
                  {t === DEFAULT_TEMPERATURE ? " (default)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} /> Show the raw Jev calls
          </label>
        </div>
        {showRaw && rawTrace && (
          <section className="raw">
            {rawTrace.trace.map((call, i) => (
              <details key={`${call.level}-${i}`} open={call.level === 1}>
                <summary>
                  Level {call.level}
                  {call.part ? ` (${call.part})` : ""} request and response · {call.ms} ms
                </summary>
                <pre>{JSON.stringify(call.request, null, 1)}</pre>
                <pre>{JSON.stringify(call.response, null, 1)}</pre>
              </details>
            ))}
          </section>
        )}
      </details>
    </div>
  );
}
