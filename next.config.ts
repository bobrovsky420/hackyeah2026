import type { NextConfig } from "next";
import { PAGE_ROUTES } from "./src/lib/page-routes";

const nextConfig: NextConfig = {
  // AGENTS.md belongs to the team: stop `next dev` from inserting its generic
  // agent-rules block whenever an AI assistant starts the dev server.
  agentRules: false,
  // English folders, Polish URLs (src/lib/page-routes.ts). Redirects match
  // only the incoming request, so the rewritten path is not sent back.
  async rewrites() {
    return PAGE_ROUTES.map(({ folder, url }) => ({ source: url, destination: folder }));
  },
  async redirects() {
    return PAGE_ROUTES.map(({ folder, url }) => ({ source: folder, destination: url, permanent: false }));
  },
};

export default nextConfig;
