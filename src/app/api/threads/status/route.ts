import { repository } from "@/server/db";
import { roleFor } from "@/server/threads";
import { readJson } from "@/server/validate";

export const dynamic = "force-dynamic";

const MAX = 50;

/**
 * POST /api/threads/status with `{threads: [{id, key}]}`, the private links
 * of "Moje rozmowy": for each conversation the author's key opens, when ROPS
 * or a mentor last answered and its status, never a text. A wrong key and
 * an unknown id are left out alike, as the conversation page answers 404.
 */
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const body = await readJson(request);
  const asked = Array.isArray(body?.threads) ? body.threads.slice(0, MAX) : [];
  const repo = repository();
  const threads = [];
  for (const item of asked as { id?: unknown; key?: unknown }[]) {
    if (typeof item?.id !== "string" || typeof item.key !== "string") continue;
    const thread = await repo.getThread(item.id);
    if (!thread || roleFor(thread, item.key) !== "uzytkownik") continue;
    const answers = thread.messages.filter((message) => message.author !== "uzytkownik");
    threads.push({ id: thread.id, status: thread.status, last_answer_at: answers.at(-1)?.at ?? null });
  }
  return Response.json({ threads }, { headers });
}
