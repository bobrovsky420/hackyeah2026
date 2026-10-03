import { pickScenario } from "@/lib/mock/scenarios";

/* The time the real pipeline takes (12.3: route complete within 15 s); shortened for the prototype. */
const SIMULATED_WORK_MS = 3500;

/**
 * Mock of POST /api/droga (9.2): validates the intake like FR-2.1 and returns
 * the id of a canned route. The real handler runs the screening gate, the
 * matching engine and the route composer here.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const problem =
    typeof body === "object" && body !== null && "problem" in body && typeof body.problem === "string"
      ? body.problem.trim()
      : "";
  if (problem.length < 20 || problem.length > 2000) {
    return Response.json({ error: "problem_length" }, { status: 422 });
  }
  await new Promise((resolve) => setTimeout(resolve, SIMULATED_WORK_MS));
  return Response.json({ id: pickScenario(problem) });
}
