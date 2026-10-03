import { isRoleCode } from "@/lib/labels";
import { getGmina } from "@/lib/mock/data";
import { createRoute } from "@/lib/server/routes";
import { invalid, readJson, requiredText } from "@/lib/server/validate";

/* The time the real pipeline takes (12.3: a route within 15 s), shortened for the prototype. */
const SIMULATED_WORK_MS = 3500;

/**
 * Mock of POST /api/droga (9.2): validates the intake like FR-2.1, stores
 * a route in the shape of 8.4 and returns its id.
 */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  const problemText = requiredText(body.problem_text, 2000, 20);
  if (!problemText) return invalid("problem_text");
  const placeTerc = typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null;
  const role = isRoleCode(body.role) ? body.role : null;

  await new Promise((resolve) => setTimeout(resolve, SIMULATED_WORK_MS));
  const route = createRoute({ problemText, placeTerc, role });
  return Response.json({ id: route.id, mode: route.mode });
}
