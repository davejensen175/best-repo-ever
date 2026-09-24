import type { NextConfig } from "next";
import { assertEnv } from "./src/lib/env";

// Next.js loads .env files before this config, so a missing variable stops
// `next dev`, `next build` and `next start` here with a clear message.
assertEnv();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
