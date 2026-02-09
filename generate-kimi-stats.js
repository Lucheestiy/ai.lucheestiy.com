#!/usr/bin/env node
// Backward-compatible wrapper. The collector now writes:
// - kimi-usage.json
// - kimi-history.json
// - kimi-stats.json

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const collectorPath = path.join(here, "collect-kimi-usage.js");

const res = spawnSync(process.execPath, [collectorPath], {
  stdio: "inherit",
});

process.exitCode = Number.isInteger(res.status) ? res.status : 1;
