import { LlmError } from "@/lib/llm/types";
import { similarForIdea } from "@/server/ideas";

export const dynamic = "force-dynamic";

/**
 * POST /api/ideas/{id}/similar: the similar innovations of an idea card,
 * computed and stored on the first call and returned as stored on every
 * later one; a new run costs model calls. 503 when the model failed.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { id } = await params;
  try {
    const idea = await similarForIdea(id);
    if (!idea) return Response.json({ error: "not_found" }, { status: 404, headers });
    return Response.json({ similar: idea.similar }, { headers });
  } catch (error) {
    if (!(error instanceof LlmError)) throw error;
    return Response.json({ error: "model_unavailable" }, { status: 503, headers });
  }
}
