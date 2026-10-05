import { getGmina, getInnovation } from "@/lib/catalogue";
import { getLlm } from "@/lib/llm";
import { CONSTRAINT_CODES, isInstitution, isScale, NOTE_MAX, type AdaptInput } from "@/lib/middleman";
import { countEvent } from "@/server/ephemeral";
import { allowSubmission, honeypotFilled, limitKeys, limitReached, screenedResponse, screenText } from "@/server/gate";
import { planMarkdown, servicePlan } from "@/server/middleman";
import { clientAddress } from "@/server/rate-limit";
import { invalid, optionalText, readJson, stringList } from "@/server/validate";

export const dynamic = "force-dynamic";

/**
 * POST /api/innovations/{id}/service, the Middleman of module VII: a
 * service plan of the innovation for the institution that asks (its kind,
 * gmina, constraints and scale, and a note screened by the gate first).
 * Nothing is stored; the answer carries the plan and its Markdown file. At
 * most ABUSE_LIMIT_SERVICE_PLANS_PER_DAY plans per client address a day,
 * since each costs a model call; a model failure answers with the template.
 */
export async function POST(request: Request, { params }: RouteContext<"/api/innovations/[id]/service">) {
  const headers = { "Cache-Control": "no-store" };
  const { id } = await params;
  const item = getInnovation(id);
  if (!item) return Response.json({ error: "not_found" }, { status: 404, headers });
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400, headers });
  if (honeypotFilled(body)) return Response.json({ error: "invalid" }, { status: 422, headers });

  if (!isInstitution(body.institution)) return invalid("institution");
  if (!isScale(body.scale)) return invalid("scale");
  const note = optionalText(body.note, NOTE_MAX);
  if (note === undefined) return invalid("note");
  const placeTerc = typeof body.place_terc === "string" && getGmina(body.place_terc) ? body.place_terc : null;
  // Only one of the innovation's own groups counts; with one group there is nothing to choose.
  const targetGroup = typeof body.target_group === "string" && item.targetGroups.includes(body.target_group) ? body.target_group : null;

  const client = clientAddress(request.headers);
  if (!allowSubmission("service", limitKeys("service", { client }))) return limitReached();

  // The note is screened like a message: a crisis gets human help, harm is declined, personal data goes.
  let cleanNote: string | null = null;
  if (note) {
    const gate = await screenText({ text: note, kind: "message", placeName: getGmina(placeTerc)?.name ?? null, client }, { llm: getLlm() });
    if (gate.screening.outcome !== "need") return screenedResponse(gate.screening.outcome);
    cleanNote = gate.redactedText;
  }

  const input: AdaptInput = {
    institution: body.institution,
    place_terc: placeTerc,
    constraints: stringList(body.constraints, CONSTRAINT_CODES) as AdaptInput["constraints"],
    scale: body.scale,
    target_group: targetGroup,
    note: cleanNote,
  };
  const plan = await servicePlan(id, input);
  if (!plan) return Response.json({ error: "not_found" }, { status: 404, headers });
  await countEvent(`service_plan:${input.institution}`);
  return Response.json({ plan, markdown: planMarkdown(plan) }, { headers });
}
