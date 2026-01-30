#!/usr/bin/env node
// Collect KIMI CLI usage stats and integrate with the main stats system
import fs from "node:fs";
import path from "node:path";

const KIMI_STATE_DIR = "/root/kimi-cli-gateway/.kimi-gateway-state/cli-bridge-kimi";
const STATS_DATA_DIR = "/home/mlweb/stats.lucheestiy.com/public/data";
const OUTPUT_LATEST = path.join(STATS_DATA_DIR, "kimi-usage.json");
const OUTPUT_HISTORY = path.join(STATS_DATA_DIR, "kimi-history.json");
const AI_DATA_DIR = "/home/mlweb/ai.lucheestiy.com/public/data";
const OUTPUT_LATEST_AI = path.join(AI_DATA_DIR, "kimi-usage.json");
const OUTPUT_HISTORY_AI = path.join(AI_DATA_DIR, "kimi-history.json");
const HISTORY_LIMIT = 500;

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

function calculateUsageFromRuns(runs) {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const oneWeekMs = 7 * oneDayMs;
  const fiveMinutesMs = 5 * 60 * 1000;
  const oneHourMs = 60 * 60 * 1000;

  // Calculate runs in different time windows
  const runsToday = runs.filter(r => {
    const created = new Date(r.createdAt).getTime();
    return now - created < oneDayMs;
  });

  const runsThisWeek = runs.filter(r => {
    const created = new Date(r.createdAt).getTime();
    return now - created < oneWeekMs;
  });

  // Calculate RPM for different windows
  const runsLast5Min = runs.filter(r => {
    const created = new Date(r.createdAt).getTime();
    return now - created < fiveMinutesMs;
  });
  
  const runsLastHour = runs.filter(r => {
    const created = new Date(r.createdAt).getTime();
    return now - created < oneHourMs;
  });

  // Calculate RPM (runs per minute)
  const rpm5Min = runsLast5Min.length / 5;
  const rpmHour = runsLastHour.length / 60;

  // Calculate success rate
  const successful = runs.filter(r => r.status === "success").length;
  const failed = runs.filter(r => r.status === "failed").length;
  const total = runs.length;
  const successRate = total > 0 ? (successful / total) * 100 : 0;

  // Calculate average duration for successful runs
  const successfulRuns = runs.filter(r => r.status === "success" && r.duration);
  const avgDuration = successfulRuns.length > 0
    ? successfulRuns.reduce((sum, r) => sum + r.duration, 0) / successfulRuns.length
    : 0;

  // For Kimi, show RPM-based usage
  // Tier 0: 3 RPM limit, Tier 1+: up to 10000 RPM
  // We'll use 10 RPM as a reasonable "high usage" threshold
  const rpmLimit = 10;
  const rpmUsage = Math.min(100, (rpm5Min / rpmLimit) * 100);

  return {
    runsToday: runsToday.length,
    runsThisWeek: runsThisWeek.length,
    runsLast5Min: runsLast5Min.length,
    runsLastHour: runsLastHour.length,
    rpm5Min: Math.round(rpm5Min * 10) / 10,
    rpmHour: Math.round(rpmHour * 10) / 10,
    avgDuration: Math.round(avgDuration),
    totalRuns: total,
    successful,
    failed,
    successRate,
    primaryUsed: Math.round(rpmUsage),
    secondaryUsed: Math.round(Math.min(100, (runsThisWeek.length / 500) * 100))
  };
}

function generateUsageEntry() {
  const runs = getRunRecords();
  const usage = calculateUsageFromRuns(runs);
  const now = new Date();

  return {
    provider: "kimi",
    source: "kimi-cli-gateway",
    version: "1.0.0",
    codexAuthAccount: "default",
    usage: {
      identity: {
        providerID: "kimi",
        loginMethod: "Kimi Pro"
      },
      loginMethod: "Kimi Pro",
      updatedAt: now.toISOString(),
      primary: {
        usedPercent: usage.primaryUsed,
        resetsAt: now.toISOString(),
        resetDescription: `${usage.rpm5Min} RPM (5min)`,
        windowMinutes: 5
      },
      secondary: {
        usedPercent: usage.secondaryUsed,
        resetsAt: now.toISOString(),
        resetDescription: `${usage.rpmHour} RPM (1h)`,
        windowMinutes: 60
      },
      tertiary: null
    },
    credits: {
      remaining: null,
      updatedAt: now.toISOString(),
      events: []
    },
    // Kimi-specific metrics
    kimiStats: {
      totalRuns: usage.totalRuns,
      runsToday: usage.runsToday,
      runsThisWeek: usage.runsThisWeek,
      runsLast5Min: usage.runsLast5Min,
      runsLastHour: usage.runsLastHour,
      rpm5Min: usage.rpm5Min,
      rpmHour: usage.rpmHour,
      avgDuration: usage.avgDuration,
      successRate: usage.successRate.toFixed(1),
      successful: usage.successful,
      failed: usage.failed
    }
  };
}

function generateHistoryEntries() {
  const runs = getRunRecords();
  
  return runs.map(run => ({
    ts: run.createdAt,
    provider: "kimi",
    account: "default",
    activity: run.status === "success" ? 10 : run.status === "failed" ? 5 : 1,
    sessionPct: run.status === "success" ? 10 : run.status === "failed" ? 5 : 1,
    runId: run.runId,
    command: run.requestedCommand.substring(0, 50),
    status: run.status,
    duration: run.duration || null,
    workspace: run.workspaceId
  }));
}

function writeToBothDirs(data, filepath) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  // Also write to ai.lucheestiy.com data dir
  const aiPath = filepath.replace(STATS_DATA_DIR, AI_DATA_DIR);
  const aiDir = path.dirname(aiPath);
  if (!fs.existsSync(aiDir)) {
    fs.mkdirSync(aiDir, { recursive: true });
  }
  fs.writeFileSync(aiPath, JSON.stringify(data, null, 2));
}

function main() {
  // Generate usage entry
  const usageEntry = generateUsageEntry();
  writeToBothDirs(usageEntry, OUTPUT_LATEST);
  console.log(`Generated usage: ${usageEntry.kimiStats.totalRuns} total runs`);

  // Generate/update history
  let history = [];
  const historyPath = OUTPUT_HISTORY;
  if (fs.existsSync(historyPath)) {
    try {
      history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
    } catch {
      history = [];
    }
  }

  // Add new entries from recent runs that aren't in history
  const newEntries = generateHistoryEntries();
  const existingIds = new Set(history.map(h => h.runId));
  const uniqueNewEntries = newEntries.filter(e => !existingIds.has(e.runId));
  
  // Merge and limit
  history = [...uniqueNewEntries, ...history].slice(0, HISTORY_LIMIT);
  writeToBothDirs(history, OUTPUT_HISTORY);
  console.log(`Generated history: ${history.length} entries`);
}

main();
