import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lib/blocks.ts reads data/blocks.json from disk at start-up; make sure it ships with the functions.
  outputFileTracingIncludes: {
    "/api/predict": ["./data/blocks.json"],
    "/api/blocks": ["./data/blocks.json"],
  },
};

export default nextConfig;
