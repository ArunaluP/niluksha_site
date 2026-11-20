import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Internal staff app: every page depends on the logged-in user, so pages are
  // rendered per request (classic dynamic rendering). Cache Components is off.
  cacheComponents: false,
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
