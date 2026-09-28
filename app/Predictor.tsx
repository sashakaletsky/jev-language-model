"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PredictResult } from "@/lib/predict";

const DEBOUNCE_MS = 250;
const PRICE_PER_M = Number(process.env.NEXT_PUBLIC_JEV_PRICE_PER_M_INPUT_TOKENS ?? "");

type Level1Response = { answers: { block: { probabilities: Record<string, number> } } };

interface Suggestion {
  word: string;
  /** "extend": the word continues what was typed. "replace": Jev's pick does not start with the typed letters. */
  mode: "extend" | "replace";
  display: string;
}

/** Presentation only: capitalise at sentence starts, for "I", and when the typist used a capital. */
function capitalise(word: string, context: string, fragment: string): string {
  const atSentenceStart = context.trim() === "" || /[.!?]\s*$/.test(context);
  const typedCapital = fragment.length > 0 && fragment[0] === fragment[0].toUpperCase() && fragment[0] !== fragment[0].toLowerCase();
  const isI = word === "i" || word.startsWith("i'");
  if (atSentenceStart || typedCapital || isI) return word[0].toUpperCase() + word.slice(1);
  return word;
}

function suggestionFor(result: PredictResult): Suggestion | null {
  const top = result.candidates[0];
  if (!top) return null;
  const word = capitalise(top.word, result.context, result.fragment);
  const frag = result.fragment;
  if (frag.length === 0) return { word, mode: "extend", display: word };
  if (word.toLowerCase().startsWith(frag.toLowerCase())) {
    return { word, mode: "extend", display: word.slice(frag.length) };
  }
  return { word, mode: "replace", display: `⇥ ${word}` };
}

function pct(p: number): string {
  return `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;
}

export default function Predictor() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<PredictResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fanout, setFanout] = useState(1);
  const [showRaw, setShowRaw] = useState(false);
  const [rawTrace, setRawTrace] = useState<PredictResult | null>(null);
  const [totals, setTotals] = useState({ calls: 0, tokens: 0 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef(new Map<string, PredictResult>());

  const suggestion = useMemo(() => (result && result.context + result.fragment === text ? suggestionFor(result) : null), [result, text]);

  const request = useCallback(
    async (value: string, wantRaw: boolean) => {
      const key = `${fanout}\u0000${value}`;
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
          body: JSON.stringify({ text: value, fanout, trace: wantRaw ? "full" : "summary" }),
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
    [fanout],
  );

  // Debounced prediction on every change. Nothing is asked until the visitor has typed something.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (text.trim() === "") return;
    timerRef.current = setTimeout(() => void request(text, false), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text, request]);

  useEffect(() => {
    if (showRaw && result && (!rawTrace || rawTrace.context + rawTrace.fragment !== text)) void request(text, true);
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
    const base = suggestion.mode === "extend" ? text : result.context;
    const next = `${base}${suggestion.display.replace(/^⇥ /, "")} `;
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

  const cost = (tokens: number) => (PRICE_PER_M > 0 ? `$${((tokens / 1e6) * PRICE_PER_M).toFixed(4)}` : null);

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
            placeholder="Start typing… Jev will suggest the next word. Press Tab to accept."
            spellCheck={false}
            autoFocus
            rows={3}
          />
        </div>
        <div className="editor-bar">
          <span className={`status ${loading ? "busy" : ""}`}>
            {loading ? "asking Jev…" : suggestion ? (suggestion.mode === "extend" ? "Tab to accept" : "Tab to replace with Jev's pick") : " "}
          </span>
          <button type="button" className="accept" onClick={accept} disabled={!suggestion}>
            Accept (Tab)
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      <aside className="panel">
        <h2>What Jev decided</h2>
        {!result && <p className="muted">Type something to see the two decisions Jev makes for every keystroke.</p>}
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
            <section>
              <h3>
                Level 2 · which word? <span className="muted">255 options per opened block</span>
              </h3>
              <ol className="bars">
                {result.candidates.slice(0, 8).map((c) => (
                  <li key={`${c.block}/${c.word}`}>
                    <span className="bar" style={{ width: `${Math.max(2, c.pWord * 100)}%` }} />
                    <span className="label">
                      {c.word}
                      {result.fanout > 1 && <span className="muted"> · {c.block}</span>}
                    </span>
                    <span className="p" title={`P(block) ${pct(c.pBlock)} × P(word | block) ${pct(c.pWord)} = ${pct(c.p)}`}>
                      {pct(c.pWord)}
                      {result.fanout > 1 && <span className="muted"> · {pct(c.p)}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section className="stats">
              <div>
                <span className="k">latency</span>
                <span className="v">
                  {result.timing.total_ms} ms <span className="muted">({result.timing.level1_ms} + {result.timing.level2_ms})</span>
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
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
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
            {rawTrace.trace.map((call) => (
              <details key={call.level} open={call.level === 1}>
                <summary>
                  Level {call.level} request → response · {call.ms} ms
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
