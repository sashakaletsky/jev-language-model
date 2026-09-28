/**
 * The dictionary as Jev sees it: 255 themed blocks of 255 words each.
 *
 * `data/blocks.json` is generated once by `scripts/build_blocks.py` from the
 * word list and the theme labels (see README, "How the blocks were built").
 * Nothing here is computed at request time beyond reading that file.
 */
import blocksJson from "@/data/blocks.json";

export interface Block {
  /** Short unique id, used as the option label Jev picks. */
  id: string;
  /** Human-readable theme title. */
  title: string;
  /** What Jev reads for this option: the theme plus example words. */
  description: string;
  /** Theme ids contributing to this block and how many words each contributes. */
  categories: { id: string; count: number }[];
  /** Exactly 255 lowercase words. */
  words: string[];
}

export interface BlocksFile {
  generated: string;
  block_size: number;
  block_count: number;
  blocks: Block[];
}

export const blocksFile = blocksJson as BlocksFile;
export const blocks: Block[] = blocksFile.blocks;

const byId = new Map<string, Block>(blocks.map((b) => [b.id, b]));

export function blockById(id: string): Block {
  const block = byId.get(id);
  if (!block) throw new Error(`unknown block id: ${id}`);
  return block;
}

/**
 * Level-1 criteria: every block id mapped to its description. Built once.
 * Object key order is preserved by JSON serialisation, so Jev sees the blocks
 * in the order they appear in blocks.json.
 */
export const level1Criteria: Record<string, string> = Object.fromEntries(
  blocks.map((b) => [b.id, b.description]),
);

const level2Cache = new Map<string, Record<string, null>>();

/** Level-2 criteria for one block: its 255 words as undescribed options. */
export function level2Criteria(blockId: string): Record<string, null> {
  let criteria = level2Cache.get(blockId);
  if (!criteria) {
    // Object.create(null) so words like "constructor" are plain keys.
    criteria = Object.create(null) as Record<string, null>;
    for (const word of blockById(blockId).words) criteria[word] = null;
    level2Cache.set(blockId, criteria);
  }
  return criteria;
}
