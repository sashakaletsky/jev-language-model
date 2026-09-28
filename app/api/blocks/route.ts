/**
 * GET /api/blocks           -> the 255 block ids, titles and descriptions (what Jev reads at level 1)
 * GET /api/blocks?id=<id>   -> one block including its 255 words (what Jev reads at level 2)
 */
import { NextRequest, NextResponse } from "next/server";
import { blocks, blocksFile } from "@/lib/blocks";

export const runtime = "nodejs";

export function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const block = blocks.find((b) => b.id === id);
    if (!block) return NextResponse.json({ error: "unknown block" }, { status: 404 });
    return NextResponse.json(block);
  }
  return NextResponse.json({
    generated: blocksFile.generated,
    block_size: blocksFile.block_size,
    block_count: blocksFile.block_count,
    blocks: blocks.map(({ id, title, description, categories }) => ({ id, title, description, categories })),
  });
}
