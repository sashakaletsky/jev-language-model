"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Candidate, PredictResult } from "@/lib/predict";

/**
 * The three decisions for one word, drawn as a tree: the text so far on the
 * left, the likeliest themed blocks in the middle (level 1, with how many
 * words each sent through at level 2), and the level-3 candidates on the
 * right. Edge thickness follows Jev's probability; the path to the
 * suggestion is highlighted.
 */

/** Leaves: the likeliest level-3 candidates, plus the suggestion when sampling reached past them. */
const MAX_LEAVES = 8;
const MAX_BLOCKS = 6;
const MIN_BLOCKS = 4;

const ROW = 28; // one word leaf
const BLOCK_MIN = 56; // a block node with nothing under it
const GAP = 12;
const PAD = 8;
const HEAD_H = 30; // column labels
const ROOT_H = 80;
const MORE_H = 44;

const ENDING_WORDS: Record<string, string> = {
  letter: "a letter",
  digit: "a digit",
  full_stop: "a full stop",
  comma: "a comma",
  question_mark: "a question mark",
  exclamation_mark: "an exclamation mark",
  other: "another symbol",
  nothing: "nothing",
};

interface BlockNode {
  id: string;
  title: string;
  p: number;
  quota: number;
  leaves: Candidate[];
  y: number;
  h: number;
}

function pct(p: number): string {
  return `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;
}

function sameCandidate(a: Candidate, b: Candidate): boolean {
  return a.word === b.word && a.block === b.block;
}

/** Which nodes to draw and where, in tree-local pixels. Widths come later from the container. */
function plan(result: PredictResult) {
  const leaves = result.candidates.slice(0, MAX_LEAVES);
  const chosen = result.chosen;
  if (chosen && !leaves.some((c) => sameCandidate(c, chosen))) leaves.push(chosen);

  const byBlock = new Map<string, Candidate[]>();
  for (const c of leaves) byBlock.set(c.block, [...(byBlock.get(c.block) ?? []), c]);

  const opened = result.blocks.filter((b) => b.opened);
  let shown = opened.filter((b) => byBlock.has(b.id));
  for (const b of opened) {
    if (shown.length >= MIN_BLOCKS) break;
    if (!shown.includes(b)) shown.push(b);
  }
  shown.sort((a, b) => b.p - a.p);
  if (shown.length > MAX_BLOCKS) {
    const keep = shown.slice(0, MAX_BLOCKS);
    const chosenBlock = chosen && shown.find((b) => b.id === chosen.block);
    if (chosenBlock && !keep.includes(chosenBlock)) keep[MAX_BLOCKS - 1] = chosenBlock;
    shown = keep;
  }

  const quota = (id: string) => result.shortlist.find((s) => s.block === id)?.quota ?? 0;
  let y = HEAD_H;
  const blocks: BlockNode[] = shown.map((b) => {
    const ls = (byBlock.get(b.id) ?? []).slice().sort((a, c) => c.p - a.p);
    const h = Math.max(BLOCK_MIN, PAD * 2 + ls.length * ROW);
    const node = { id: b.id, title: b.title, p: b.p, quota: quota(b.id), leaves: ls, y, h };
    y += h + GAP;
    return node;
  });
  const rest = opened.filter((b) => !shown.some((s) => s.id === b.id));
  const more = rest.length ? { count: rest.length, words: rest.reduce((n, b) => n + quota(b.id), 0), y } : null;
  if (more) y += MORE_H + GAP;
  return { blocks, more, height: y - GAP };
}

function edge(x1: number, y1: number, x2: number, y2: number): string {
  const xm = (x1 + x2) / 2;
  return `M${x1} ${y1} C${xm} ${y1}, ${xm} ${y2}, ${x2} ${y2}`;
}

export default function DecisionTree({ result }: { result: PredictResult }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver reports once on observe, so this also sets the initial width.
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tree = useMemo(() => plan(result), [result]);
  const W = width || 720;
  const col = {
    root: { x: 0, w: 0.18 * W },
    block: { x: 0.25 * W, w: 0.4 * W },
    word: { x: 0.72 * W, w: 0.28 * W },
  };
  const stackTop = HEAD_H;
  const stackBottom = tree.height;
  const rootY = stackTop + (stackBottom - stackTop) / 2 - ROOT_H / 2;
  const rootCy = rootY + ROOT_H / 2;
  const chosen = result.chosen;
  const tail = `${result.context.trim().split(/\s+/).slice(-4).join(" ")} ____`;
  const leafTop = (b: BlockNode) => b.y + (b.h - b.leaves.length * ROW) / 2;

  return (
    <div className="tree-scroll">
      <div className="tree" ref={ref} style={{ height: tree.height }} role="img" aria-label="Jev's three decisions for the next word, drawn as a tree">
        <svg className="edges" width={W} height={tree.height} aria-hidden="true">
          {tree.blocks.map((b) => {
            const onPath = chosen?.block === b.id;
            return (
              <g key={b.id}>
                <path
                  d={edge(col.root.x + col.root.w, rootCy, col.block.x, b.y + b.h / 2)}
                  className={onPath ? "edge chosen" : "edge"}
                  strokeWidth={1 + 6 * b.p}
                />
                {b.leaves.map((c, j) => (
                  <path
                    key={`${c.block}/${c.word}`}
                    d={edge(col.block.x + col.block.w, b.y + b.h / 2, col.word.x, leafTop(b) + j * ROW + ROW / 2)}
                    className={chosen && sameCandidate(c, chosen) ? "edge chosen" : "edge"}
                    strokeWidth={1 + 8 * c.p}
                  />
                ))}
              </g>
            );
          })}
          {tree.more && (
            <path d={edge(col.root.x + col.root.w, rootCy, col.block.x, tree.more.y + MORE_H / 2)} className="edge faint" strokeWidth={1} />
          )}
        </svg>

        <span className="col-head" style={{ left: col.root.x }}>
          The text
        </span>
        <span className="col-head" style={{ left: col.block.x }}>
          Level 1 · which block? <span className="muted">then level 2 inside each</span>
        </span>
        <span className="col-head" style={{ left: col.word.x }}>
          Level 3 · which word?
        </span>

        <div className="node root" style={{ left: col.root.x, top: rootY, width: col.root.w, height: ROOT_H }}>
          <span className="tail" title={result.context}>
            {tail}
          </span>
          <span className="meta">
            ends with {ENDING_WORDS[result.marks.ending] ?? result.marks.ending} · {pct(result.marks.p)}
            <br />
            marks {result.marks.allowed ? "allowed" : "withheld"}
          </span>
        </div>

        {tree.blocks.map((b) => (
          <div
            key={b.id}
            className={`node block${chosen?.block === b.id ? " chosen" : ""}`}
            style={{ left: col.block.x, top: b.y, width: col.block.w, height: b.h }}
            title={b.title}
          >
            <span className="theme">{b.title.split(" | ")[0]}</span>
            <span className="meta">
              {pct(b.p)} · {b.quota} of 255 words shortlisted
            </span>
          </div>
        ))}

        {tree.more && (
          <div className="node more" style={{ left: col.block.x, top: tree.more.y, width: col.block.w, height: MORE_H }}>
            + {tree.more.count} more blocks opened · {tree.more.words} words shortlisted
          </div>
        )}

        {tree.blocks.map((b) =>
          b.leaves.map((c, j) => {
            const isChosen = chosen ? sameCandidate(c, chosen) : false;
            return (
              <div
                key={`${c.block}/${c.word}`}
                className={`node leaf${isChosen ? " chosen" : ""}`}
                style={{ left: col.word.x, top: leafTop(b) + j * ROW, width: col.word.w, height: ROW }}
                title={`P(block) ${pct(c.pBlock)} × P(word | block) ${pct(c.pWord)}`}
              >
                <span className="word">
                  {c.word}
                  {isChosen && <span className="tag">suggested</span>}
                </span>
                <span className="p">{pct(c.p)}</span>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
