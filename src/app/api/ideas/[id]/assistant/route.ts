import { developIdea } from "@/server/ideas/assistant";

export const dynamic = "force-dynamic";

/**
 * POST /api/ideas/{id}/assistant: the "Rozwiń pomysł" suggestions of an
 * idea card (module III), computed and stored on the first call and
 * returned as stored on every later one. A model failure falls back to the
 * template inside, so the answer is always 200 for a known card.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { id } = await params;
  const idea = await developIdea(id);
  if (!idea) return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json({ develop: idea.assistant?.develop ?? null }, { headers });
}
