import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal staff app: every page depends on the logged-in user, so pages are
  // rendered per request (classic dynamic rendering). Cache Components is off.
  cacheComponents: false,
  // Lets the dev server (npm run dev) be opened through an ngrok link.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.dev", "*.ngrok.io"],
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
