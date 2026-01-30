#!/usr/bin/env node
// Generate KIMI CLI stats from gateway state for ai.lucheestiy.com dashboard
import fs from "node:fs";
import path from "node:path";

const KIMI_STATE_DIR = "/root/kimi-cli-gateway/.kimi-gateway-state/cli-bridge-kimi";
const STATS_DATA_DIR = "/home/mlweb/stats.lucheestiy.com/public/data";
const AI_DATA_DIR = "/home/mlweb/ai.lucheestiy.com/public/data";
const OUTPUT_FILE = path.join(STATS_DATA_DIR, "kimi-stats.json");
const OUTPUT_FILE_AI = path.join(AI_DATA_DIR, "kimi-stats.json");
const RECENT_RUNS_LIMIT = 10;

function getRunRecords() {
  const runsDir = path.join(KIMI_STATE_DIR, "runs");
  if (!fs.existsSync(runsDir)) return [];

  const runs = [];
  const entries = fs.readdirSync(runsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("run-")) {
      const recordPath = path.join(runsDir, entry.name, "record.json");
      if (fs.existsSync(recordPath)) {
        try {
          const record = JSON.parse(fs.readFileSync(recordPath, "utf-8"));
          runs.push(record);
        } catch (e) {
          // Skip invalid records
        }
      }
    }
  }

  return runs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function generateStats() {
  const runs = getRunRecords();

  const stats = {
    lastUpdated: new Date().toISOString(),
    totalRuns: runs.length,
    status: "ready",
    summary: {
      success: runs.filter(r => r.status === "success").length,
      failed: runs.filter(r => r.status === "failed").length,
      running: runs.filter(r => r.status === "running").length,
      queued: runs.filter(r => r.status === "queued").length,
    },
    recentRuns: runs.slice(0, RECENT_RUNS_LIMIT).map(run => ({
      id: run.runId,
      createdAt: run.createdAt,
      status: run.status,
      command: run.requestedCommand.substring(0, 100),
      workspace: run.workspaceId,
      duration: run.startedAt && run.finishedAt
        ? Math.round((new Date(run.finishedAt) - new Date(run.startedAt)) / 1000)
        : null,
      exitCode: run.exitCode
    }))
  };

  // Write to both directories (stats for nginx container, ai for backup)
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stats, null, 2));
  fs.writeFileSync(OUTPUT_FILE_AI, JSON.stringify(stats, null, 2));
  console.log(`Generated stats: ${stats.totalRuns} total runs, ${stats.recentRuns.length} recent`);
}

generateStats();
