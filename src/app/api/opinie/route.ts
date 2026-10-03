import type { FeedbackValue } from "@/lib/contracts/records";
import { getRoute } from "@/lib/server/routes";
import { countEvent, nowIso, store } from "@/lib/server/store";
import { invalid, optionalText, readJson } from "@/lib/server/validate";

const values: FeedbackValue[] = ["tak", "czesciowo", "nie"];

/** FR-10.1: "Czy ta droga pomaga?", stored with the route id and counted. */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  if (typeof body.route_id !== "string" || !getRoute(body.route_id)) return invalid("route_id");
  const value = values.find((item) => item === body.value);
  if (!value) return invalid("value");
  const comment = optionalText(body.comment, 1000);
  if (comment === undefined) return invalid("comment");

  store.feedback.unshift({ route_id: body.route_id, value, comment, created_at: nowIso() });
  countEvent(`feedback_given:${value}`);
  return Response.json({ ok: true }, { status: 201 });
}
