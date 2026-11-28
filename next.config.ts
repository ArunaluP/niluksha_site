import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal staff app: every page depends on the logged-in user, so pages are
  // rendered per request (classic dynamic rendering). Cache Components is off.
  cacheComponents: false,
  // Lets the dev server (npm run dev) be opened through an ngrok link.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev", "*.ngrok.io"],
  // Invoice / booking links sent on WhatsApp: never indexed, cached or leaked to other sites.
  async headers() {
    return [
      ...["/i/:path*", "/b/:path*"].map((source) => ({
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      })),
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
