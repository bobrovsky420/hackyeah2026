import { t } from "@/lib/i18n";
import { repository } from "@/server/db";
import { apiError, json, withConsole } from "@/server/console/api";
import { isQueueName, loadQueue, loadQueues } from "@/server/console/queries";

/**
 * GET /api/rops/moderation (9.2, FR-12.8): one queue with
 * `?queue=needs|contacts|readiness|reports|declined` as `{queue, items,
 * count}`, or every queue without the parameter as `{queues: {...}}`. The
 * declined queue merges the declined routes and the kept texts of the
 * screening log (src/server/console/review.ts).
 */
export async function GET(request: Request) {
  return withConsole(request, async () => {
    const queue = new URL(request.url).searchParams.get("queue");
    if (queue === null) return json({ queues: await loadQueues(repository()) });
    if (!isQueueName(queue)) return apiError(422, "invalid", t("api.rops.unknownQueue"), { field: "queue" });
    const items = await loadQueue(repository(), queue);
    return json({ queue, items, count: items.length });
  });
}
