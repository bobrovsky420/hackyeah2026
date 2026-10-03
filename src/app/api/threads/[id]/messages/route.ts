import { clientAddress } from "@/server/rate-limit";
import { countEvent } from "@/server/ephemeral";
import { invalid, readJson, requiredText } from "@/server/validate";
import { repository } from "@/server/db";
import { allowSubmission, honeypotFilled, limitKeys, limitReached, publicWritesClosed, screenedResponse } from "@/server/gate";
import { message, nextRetention, roleFor, screenMessage } from "@/server/threads";

/**
 * POST /api/threads/{id}/messages, module V: a message of the author or of
 * the mentor, who prove themselves with the key of their private link. An
 * unknown conversation and a wrong key get the same 404, so the API never
 * tells whether a conversation exists.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/threads/[id]/messages">) {
  const closed = publicWritesClosed();
  if (closed) return closed;
  const { id } = await params;
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  if (honeypotFilled(body)) return new Response(null, { status: 204 });

  const repo = repository();
  const thread = await repo.getThread(id);
  const role = thread ? roleFor(thread, typeof body.key === "string" ? body.key : null) : null;
  if (!thread || !role) return Response.json({ error: "not_found" }, { status: 404 });
  const text = requiredText(body.text, 3000, 2);
  if (!text) return invalid("text");

  const client = clientAddress(request.headers);
  if (!allowSubmission("message", limitKeys("message", { client }).map((key) => `${key}:${thread.id}`))) return limitReached();
  const screened = await screenMessage(text, thread.place_terc, client, "message");
  if (!screened.ok) return screenedResponse(screened.outcome);

  const name = role === "mentor" ? (thread.mentor?.name ?? null) : null;
  await repo.appendMessage(thread.id, message(role, name, screened.text), nextRetention());
  await countEvent(`thread_message:${role}`);
  return Response.json({ redactions: screened.redactions }, { status: 201 });
}
