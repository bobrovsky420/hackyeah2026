import { isOneOf, reportReasons } from "@/lib/console";
import type { ContentReport } from "@/lib/contracts/records";
import { getInnovation } from "@/lib/catalogue";
import { redact } from "@/lib/server/redact";
import { getRoute } from "@/lib/server/routes";
import { countEvent, newId, nowIso } from "@/lib/server/store";
import { invalid, optionalText, readJson, requiredText } from "@/lib/server/validate";
import { repository } from "@/server/db";
import { honeypotFilled, publicWritesClosed } from "@/server/gate";

const targetTypes = ["route", "brief", "innovation", "need"] as const;

async function targetExists(type: ContentReport["target"]["type"], id: string): Promise<boolean> {
  if (type === "route") return (await getRoute(id)) !== undefined;
  if (type === "innovation") return getInnovation(id) !== undefined;
  return (await repository().getNeed(id)) !== undefined;
}

/**
 * POST /api/reports (9.2, FR-12.9): a content report for the moderation
 * queue (8.11). No identity of the reporter is stored; the comment loses
 * any personal data like every stored text.
 */
export async function POST(request: Request) {
  const closed = publicWritesClosed();
  if (closed) return closed;
  const body = await readJson(request);
  if (!body) return Response.json({ error: "invalid_json" }, { status: 400 });
  if (honeypotFilled(body)) return Response.json({ id: newId("zg") }, { status: 201 });

  const target = body.target as { type?: unknown; id?: unknown } | undefined;
  const type = targetTypes.find((item) => item === target?.type);
  const id = requiredText(target?.id, 200);
  if (!type || !id || !(await targetExists(type, id))) return invalid("target");
  const reason = typeof body.reason === "string" && isOneOf(reportReasons, body.reason) ? body.reason : null;
  if (!reason) return invalid("reason");
  const comment = optionalText(body.comment, 1000);
  if (comment === undefined) return invalid("comment");

  const report: ContentReport = {
    id: newId("zg"),
    created_at: nowIso(),
    target: { type, id },
    reason,
    comment: comment ? redact(comment).text : null,
    moderation: { status: "do-weryfikacji", reviewer: null, decided_at: null, reason_pl: null },
  };
  await repository().addReport(report);
  await countEvent("content_reported");
  return Response.json({ id: report.id }, { status: 201 });
}
