import { ASSISTANT_TASKS, runAssistant, type AssistantTask } from "@/server/ideas/assistant";
import { readJson } from "@/server/validate";

export const dynamic = "force-dynamic";

/**
 * POST /api/ideas/{id}/assistant with `{task}` ("develop", the default, or
 * "show"): the idea assistant's run of that task on a card (module III),
 * computed and stored on the first call and returned as stored on every
 * later one. A model failure falls back to the template inside, so the
 * answer is always 200 for a known card.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const { id } = await params;
  const body = (await readJson(request)) ?? {};
  const task: AssistantTask = ASSISTANT_TASKS.find((item) => item === body.task) ?? "develop";
  const idea = await runAssistant(id, task);
  if (!idea) return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json({ [task]: idea.assistant?.[task] ?? null }, { headers });
}
