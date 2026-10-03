import { readFile } from "node:fs/promises";
import path from "node:path";

/*
 * MapLibre GL 6 runs its tiling in a module worker loaded from a file next
 * to its own module, and the worker imports the shared module next to
 * itself. A bundle breaks that relative path, so both files are served
 * here, straight from the installed package, and the map points
 * setWorkerUrl at this path. Nothing is copied into the repository.
 */
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return FILES.map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: RouteContext<"/vendor/maplibre/[file]">) {
  const { file } = await params;
  if (!FILES.includes(file)) return new Response("Not found", { status: 404 });
  const body = await readFile(path.join(process.cwd(), "node_modules", "maplibre-gl", "dist", file), "utf8");
  return new Response(body, {
    headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
