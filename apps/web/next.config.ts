import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next transpiles them directly.
  transpilePackages: ["@repo/core", "@repo/ui", "@repo/seed", "@repo/sdk"],
  eslint: {
    // Linting is a separate gate (`bun run lint`) so builds stay fast and
    // a lint warning can never silently fail a production build.
    ignoreDuringBuilds: true
  },
  typescript: {
    // Typechecking is `bun run typecheck` (turbo, every workspace, and green).
    // Next's in-build type worker OOMs on this repo's union-heavy engine code,
    // so the build skips the duplicate pass. The type gate stays independently
    // observable — and enforced — in CI.
    ignoreBuildErrors: true
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "arxiv.org" },
      { protocol: "https", hostname: "transformer-circuits.pub" },
      { protocol: "https", hostname: "distill.pub" },
      { protocol: "https", hostname: "www.anthropic.com" },
      { protocol: "https", hostname: "www.neuronpedia.org" }
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }
        ]
      },
      {
        source: "/api/v1/stream",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-transform" },
          { key: "Connection", value: "keep-alive" }
        ]
      }
    ];
  }
};

export default nextConfig;
