import { adminSession } from "@/server/admin/auth";
import { exportRows, isExportKind, toCsv } from "@/server/admin/data";

export const dynamic = "force-dynamic";

/** GET /api/admin/export/{kind} (FR-9.2): one queue as CSV for Polish Excel, behind the panel's door. */
export async function GET(_request: Request, { params }: RouteContext<"/api/admin/export/[kind]">) {
  if (!(await adminSession())) return Response.json({ error: "unauthorised" }, { status: 401 });
  const { kind } = await params;
  if (!isExportKind(kind)) return Response.json({ error: "not_found" }, { status: 404 });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(await exportRows(kind)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hubmi-${kind}-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
