import { getDataset } from "@/lib/data/load";
import { describeLlm } from "@/lib/llm";

export const dynamic = "force-dynamic";

/**
 * GET /api/health (9.2, 12.4): liveness for the deploy check, with the data
 * version and the provider that answers first. When data/ does not load,
 * ok is false with the error class only, never the message or a stack.
 */
export function GET() {
  const { provider, model } = describeLlm();
  const headers = { "Cache-Control": "no-store" };
  try {
    const dataVersion = getDataset().version;
    return Response.json({ ok: true, data_version: dataVersion, provider, model }, { headers });
  } catch (error) {
    const errorClass = error instanceof Error ? error.name : "Error";
    return Response.json({ ok: false, data_version: null, provider, model, error: errorClass }, { status: 503, headers });
  }
}
