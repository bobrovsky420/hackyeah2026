import { getDataset } from "@/lib/data/load";
import { describeLlm, getLlmHealth, probeLlm } from "@/lib/llm";

export const dynamic = "force-dynamic";

/**
 * GET /api/health (9.2, 12.4): liveness for the deploy check, with the data
 * version, the provider that answers first and whether it does (`llm`,
 * decision A.14). A failing model keeps `ok` true, since the app answers
 * with its fallbacks; `llm.status` says "degraded". A note older than five
 * minutes starts one tiny probe call; `?probe=1` waits for it. When data/
 * does not load, ok is false with the error class only, never the message
 * or a stack.
 */
export async function GET(request: Request) {
  const { provider, model } = describeLlm();
  const headers = { "Cache-Control": "no-store" };
  const probing = probeLlm();
  if (new URL(request.url).searchParams.get("probe") === "1") await probing;
  const health = getLlmHealth();
  const llm = {
    status: health.status,
    provider: health.provider,
    model: health.model,
    since: health.since,
    kind: health.kind,
    http_status: health.httpStatus,
    checked_at: health.checkedAt,
  };
  try {
    const dataVersion = getDataset().version;
    return Response.json({ ok: true, data_version: dataVersion, provider, model, llm }, { headers });
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : "Error";
    return Response.json({ ok: false, data_version: null, provider, model, llm, error: errorClass }, { status: 503, headers });
  }
}
