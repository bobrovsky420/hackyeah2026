import type { FeedbackValue } from "@/lib/contracts/records";
import { getRoute } from "@/lib/server/routes";
import { countEvent, nowIso } from "@/lib/server/store";
import { invalid, optionalText, readJson } from "@/lib/server/validate";
import { repository } from "@/server/db";

const values: FeedbackValue[] = ["tak", "czesciowo", "nie"];

/** POST /api/routes/{id}/feedback (9.2, FR-10.1): "Czy ta droga pomaga?", stored with the route id and counted. */
export async function POST(request: Request, { params }: RouteContext<"/api/routes/[id]/feedback">) {
  const { id } = await params;
  if (!(await getRoute(id))) return Response.json({ error: "not_found" }, { status: 404 });
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const value = values.find((item) => item === body.value);
  if (!value) return invalid("value");
  const comment = optionalText(body.comment, 1000);
  if (comment === undefined) return invalid("comment");

  await repository().addFeedback({ route_id: id, value, comment, created_at: nowIso() });
  await countEvent(`feedback_given:${value}`);
  return new Response(null, { status: 204 });
}
