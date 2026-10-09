import type { NextConfig } from "next";

/**
 * Content-Security-Policy for the production site. The point is `connect-src`:
 * the page may only fetch from itself, the two AI providers a visitor can
 * bring a key for, and the OpenFreeMap tile host, so a visitor's key cannot be
 * sent anywhere else even by mistake. Scripts and styles stay 'self' plus
 * inline (Next.js and next-themes inline small bootstrap scripts, and the page
 * is prerendered, so there is no per-request nonce); nothing may use eval.
 * `next dev` needs eval and a websocket for hot reload, so the policy is only
 * sent by production builds.
 */
const TILES = "https://tiles.openfreemap.org";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${TILES}`,
  "font-src 'self'",
  `connect-src 'self' https://api.anthropic.com https://api.openai.com ${TILES}`,
  // MapLibre runs its worker from /vendor and decodes images in blob: workers
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
