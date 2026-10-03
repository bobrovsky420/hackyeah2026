import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AGENTS.md belongs to the team: stop `next dev` from inserting its generic
  // agent-rules block whenever an AI assistant starts the dev server.
  agentRules: false,
};

export default nextConfig;
