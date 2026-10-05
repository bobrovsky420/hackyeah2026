import { repository } from "@/server/db";
import { readJson } from "@/server/validate";

export const dynamic = "force-dynamic";

const MAX = 50;

/**
 * POST /api/ideas/status with `{ids}`, the cards of "Moje zgłoszenia": for
 * each known card its status and when ROPS last replied, which its own page
 * already shows to anyone with the link. Unknown ids are left out.
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const body = await readJson(request);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string").slice(0, MAX) : [];
  const repo = repository();
  const ideas = [];
  for (const id of ids) {
    const idea = await repo.getIdea(id);
    if (idea) ideas.push({ id: idea.id, status: idea.status, reply_at: idea.reply?.at ?? null });
  }
  return Response.json({ ideas }, { headers });
}
