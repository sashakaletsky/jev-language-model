"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PredictResult } from "@/lib/predict";
import { endsMidWord } from "@/lib/tokenize";

const DEBOUNCE_MS = 250;
const PRICE_PER_M = Number(process.env.NEXT_PUBLIC_JEV_PRICE_PER_M_INPUT_TOKENS ?? "");
const PUNCTUATION = new Set([".", ",", "?", "!"]);
const TEMPERATURES = [0, 0.5, 0.8, 1, 1.3];

type Level1Response = { answers: { block: { probabilities: Record<string, number> } } };

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

function pct(p: number): string {
  return `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;
}

export default function Predictor() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<PredictResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fanout, setFanout] = useState(30);
  const [temperature, setTemperature] = useState(0.8);
  const [showRaw, setShowRaw] = useState(false);
  const [rawTrace, setRawTrace] = useState<PredictResult | null>(null);
  const [totals, setTotals] = useState({ calls: 0, tokens: 0 });

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
          setTotals((t) => ({ calls: t.calls + 1, tokens: t.tokens + data.usage.input_tokens }));
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

  const level1Top = useMemo(() => {
    const call = result?.trace[0];
    if (!call) return [];
    const probs = (call.response as Level1Response).answers.block.probabilities;
    return Object.entries(probs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, p]) => ({ id, p, title: result?.blocks.find((b) => b.id === id)?.title ?? id, opened: result?.blocks.some((b) => b.id === id && b.opened) ?? false }));
  }, [result]);

  // The top eight candidates, plus the suggested one if sampling reached past them.
  const rows = useMemo(() => {
    if (!result) return [];
    const top = result.candidates.slice(0, 8);
    const chosen = result.chosen;
    if (chosen && !top.some((c) => c.word === chosen.word && c.block === chosen.block)) top.push(chosen);
    return top;
  }, [result]);

  const cost = (tokens: number) => (PRICE_PER_M > 0 ? `$${((tokens / 1e6) * PRICE_PER_M).toFixed(4)}` : null);
  const statusText = loading ? "asking Jev…" : suggestion ? "Tab to accept" : endsMidWord(text) ? "finish the word to get a suggestion" : " ";

  return (
    <div className="predictor">
      <div className="editor-wrap">
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
            placeholder="Start typing… after each word Jev suggests the next one. Press Tab to accept."
            spellCheck={false}
            autoFocus
            rows={3}
          />
        </div>
        <div className="editor-bar">
          <span className={`status ${loading ? "busy" : ""}`}>{statusText}</span>
          <button type="button" className="accept" onClick={accept} disabled={!suggestion}>
            Accept (Tab)
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <aside className="panel">
        <h2>What Jev decided</h2>
        {!result && <p className="muted">Type a word and a space to see the three decisions Jev makes for every word.</p>}
        {result && (
          <>
            <section>
              <h3>
                Level 1 · which themed block? <span className="muted">255 options</span>
              </h3>
              <ol className="bars">
                {level1Top.map((b) => (
                  <li key={b.id} className={b.opened ? "opened" : ""}>
                    <span className="bar" style={{ width: `${Math.max(2, b.p * 100)}%` }} />
                    <span className="label">{b.title}</span>
                    <span className="p">{pct(b.p)}</span>
                  </li>
                ))}
              </ol>
            </section>
            <p className="muted small">
              May a punctuation mark come next? Jev says {result.marks.allowed ? "yes" : "no"} ({pct(result.marks.p)}
              {result.marks.allowed ? "" : " yes"}), so the four marks are {result.marks.allowed ? "in" : "out of"} the shortlist.
            </p>
            <section>
              <h3>
                Level 2 · shortlist within each <span className="muted">255 options per opened block</span>
              </h3>
              <ol className="bars">
                {result.shortlist.slice(0, 5).map((s) => (
                  <li key={s.block}>
                    <span className="bar" style={{ width: `${Math.max(2, s.pBlock * 100)}%` }} />
                    <span className="label">{s.title}</span>
                    <span className="p">{s.quota} words</span>
                  </li>
                ))}
              </ol>
              {result.shortlist.length > 5 && (
                <p className="muted small">
                  and {result.shortlist.length - 5} more blocks contributing{" "}
                  {result.shortlist.slice(5).reduce((n, s) => n + s.quota, 0)} words, for 255 candidates in all
                </p>
              )}
            </section>
            <section>
              <h3>
                Level 3 · which word? <span className="muted">255 shortlisted options</span>
              </h3>
              <ol className="bars">
                {rows.map((c) => {
                  const isChosen = result.chosen && c.word === result.chosen.word && c.block === result.chosen.block;
                  return (
                    <li key={`${c.block}/${c.word}`} className={isChosen ? "chosen" : ""}>
                      <span className="bar" style={{ width: `${Math.max(2, c.p * 100)}%` }} />
                      <span className="label">
                        {c.word}
                        {isChosen && <span className="muted"> · suggested</span>}
                      </span>
                      <span className="p" title={`from ${c.block}: P(block) ${pct(c.pBlock)}, P(word | block) ${pct(c.pWord)}`}>
                        {pct(c.p)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
            <section className="stats">
              <div>
                <span className="k">latency</span>
                <span className="v">
                  {result.timing.total_ms} ms{" "}
                  <span className="muted">
                    ({result.timing.level1_ms} + {result.timing.level2_ms} + {result.timing.level3_ms})
                  </span>
                </span>
              </div>
              <div>
                <span className="k">tokens</span>
                <span className="v">
                  {result.usage.input_tokens.toLocaleString()} in · {result.usage.output_tokens} out
                  {cost(result.usage.input_tokens) && <span className="muted"> · ≈{cost(result.usage.input_tokens)}</span>}
                </span>
              </div>
              <div>
                <span className="k">session</span>
                <span className="v">
                  {totals.calls} predictions · {totals.tokens.toLocaleString()} input tokens
                  {cost(totals.tokens) && <span className="muted"> · ≈{cost(totals.tokens)}</span>}
                </span>
              </div>
              <div>
                <span className="k">model</span>
                <span className="v">{result.model}</span>
              </div>
            </section>
          </>
        )}
        <section className="controls">
          <label>
            Blocks opened at level 2
            <select value={fanout} onChange={(e) => setFanout(Number(e.target.value))}>
              {[5, 10, 20, 30, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Temperature
            <select value={temperature} onChange={(e) => setTemperature(Number(e.target.value))}>
              {TEMPERATURES.map((t) => (
                <option key={t} value={t}>
                  {t === 0 ? "0 · always the top word" : t.toFixed(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} /> Show the raw Jev calls
          </label>
        </section>
        {showRaw && rawTrace && (
          <section className="raw">
            {rawTrace.trace.map((call, i) => (
              <details key={`${call.level}-${i}`} open={call.level === 1}>
                <summary>
                  Level {call.level}
                  {call.part ? ` (${call.part})` : ""} request → response · {call.ms} ms
                </summary>
                <pre>{JSON.stringify(call.request, null, 1)}</pre>
                <pre>{JSON.stringify(call.response, null, 1)}</pre>
              </details>
            ))}
          </section>
        )}
      </aside>
    </div>
  );
}
