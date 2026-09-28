#!/usr/bin/env node
/**
 * Runs the site against the local mock API: no key, no network, made-up predictions.
 * Handy for working on the UI or the pipeline plumbing. `npm run dev:mock`.
 */
import { spawn } from "node:child_process";
import { startMockTypeSafe } from "./mock-typesafe.mjs";

const server = await startMockTypeSafe(0);
const { port } = server.address();
console.log(`mock TypeSafe API on http://127.0.0.1:${port}; starting next dev`);
const dev = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY ?? "mock", TYPESAFE_BASE_URL: `http://127.0.0.1:${port}` },
});
dev.on("exit", (code) => {
  server.close();
  process.exit(code ?? 0);
});
