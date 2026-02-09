#!/usr/bin/env node
// Collect Kimi usage + history in a format compatible with ai.lucheestiy.com.
// Source priority:
// 1) Official Kimi Code usage endpoint (/usages) via API key.
// 2) Fallback windows derived from local gateway run logs.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const KIMI_STATE_DIR =
  process.env.KIMI_STATE_DIR ||
  process.env.KIMI_GATEWAY_STATE_DIR ||
  "/root/kimi-cli-gateway/.kimi-gateway-state/cli-bridge-kimi";
const STATS_DATA_DIR =
  process.env.STATS_DATA_DIR || "/home/mlweb/stats.lucheestiy.com/public/data";
const AI_DATA_DIR =
  process.env.AI_DATA_DIR || "/home/mlweb/ai.lucheestiy.com/public/data";

const KIMI_BASE_URL = (
  process.env.KIMI_CODE_BASE_URL || "https://api.kimi.com/coding/v1"
).replace(/\/+$/, "");

const USAGE_TIMEOUT_MS = intFromEnv("KIMI_USAGE_TIMEOUT_MS", 15_000);
const HISTORY_LIMIT = intFromEnv("KIMI_HISTORY_LIMIT", 2000);
const HISTORY_DAYS = intFromEnv("KIMI_HISTORY_DAYS", 30);
const RECENT_RUNS_LIMIT = intFromEnv("KIMI_RECENT_RUNS_LIMIT", 20);
const ACTIVITY_TOKENS_PER_POINT = floatFromEnv(
  "KIMI_ACTIVITY_TOKENS_PER_POINT",
  5000,
);

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function floatFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPositiveNumber(value) {
  const n = toNumber(value);
  if (n === null) return null;
  return n >= 0 ? n : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nowIso() {
  return new Date().toISOString();
}

function parseMs(value) {
  if (!value && value !== 0) return null;
  const d = new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function nextWindowResetIso(nowMs, windowMinutes, offsetMinutes = 0) {
  const windowMs = Math.max(1, windowMinutes) * 60 * 1000;
  const offsetMs = Math.max(0, offsetMinutes) * 60 * 1000;
  const idx = Math.floor((nowMs - offsetMs) / windowMs);
  const next = (idx + 1) * windowMs + offsetMs;
  return new Date(next).toISOString();
}

function formatDurationShort(secondsInput) {
  const seconds = Math.max(0, Math.floor(Number(secondsInput) || 0));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function atomicWriteJson(filePath, data) {
  mkdirp(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

function readJsonSafe(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveKimiApiKey() {
  const envCandidates = ["KIMI_CODE_API_KEY", "KIMI_API_KEY"];
  for (const key of envCandidates) {
    const v = String(process.env[key] || "").trim();
    if (v) return v;
  }

  const configPath =
    process.env.KIMI_CONFIG_PATH || path.join(os.homedir(), ".kimi", "config.toml");
  if (!fs.existsSync(configPath)) return "";

  const raw = readTextSafe(configPath);
  if (!raw) return "";

  const blockRegex = /\[providers\."([^"]+)"\]([\s\S]*?)(?=\n\[[^\]]+\]|$)/g;
  const preferred = [];
  const fallback = [];

  for (const match of raw.matchAll(blockRegex)) {
    const providerName = String(match[1] || "");
    const body = String(match[2] || "");
    const apiKeyMatch = body.match(/^\s*api_key\s*=\s*"([^"]+)"/m);
    const apiKey = String(apiKeyMatch?.[1] || "").trim();
    if (!apiKey) continue;
    const lower = providerName.toLowerCase();
    if (lower === "kimi-api" || lower.includes("kimi-code")) {
      preferred.push(apiKey);
    } else if (lower.includes("kimi")) {
      fallback.push(apiKey);
    }
  }

  return preferred[0] || fallback[0] || "";
}

function parseResetMeta(data, nowMs) {
  const resetAtKeys = ["reset_at", "resetAt", "reset_time", "resetTime"];
  for (const key of resetAtKeys) {
    const raw = data?.[key];
    if (!raw) continue;
    const ms = parseMs(raw);
    if (ms !== null) {
      return {
        resetsAt: new Date(ms).toISOString(),
        resetHint: `resets in ${formatDurationShort((ms - nowMs) / 1000)}`,
      };
    }
    return { resetsAt: String(raw), resetHint: `resets at ${String(raw)}` };
  }

  const resetInKeys = ["reset_in", "resetIn", "ttl", "window"];
  for (const key of resetInKeys) {
    const seconds = toPositiveNumber(data?.[key]);
    if (seconds === null) continue;
    return {
      resetsAt: new Date(nowMs + seconds * 1000).toISOString(),
      resetHint: `resets in ${formatDurationShort(seconds)}`,
    };
  }

  return { resetsAt: null, resetHint: null };
}

function durationToMinutes(durationRaw, unitRaw) {
  const duration = toPositiveNumber(durationRaw);
  if (duration === null || duration === 0) return null;
  const unit = String(unitRaw || "").toUpperCase();
  if (unit.includes("MINUTE")) return duration;
  if (unit.includes("HOUR")) return duration * 60;
  if (unit.includes("DAY")) return duration * 1440;
  if (unit.includes("WEEK")) return duration * 10080;
  if (unit.includes("SECOND")) return Math.max(1, Math.round(duration / 60));
  return null;
}

function usageRowFromData(data, defaultLabel, nowMs) {
  if (!isObject(data)) return null;
  const limit = toPositiveNumber(data.limit);
  let used = toPositiveNumber(data.used);
  if (used === null) {
    const remaining = toPositiveNumber(data.remaining);
    if (remaining !== null && limit !== null) used = Math.max(0, limit - remaining);
  }

  if (limit === null && used === null) return null;

  const resetMeta = parseResetMeta(data, nowMs);
  const windowMinutes =
    toPositiveNumber(data.windowMinutes) ||
    toPositiveNumber(data.window_minutes) ||
    null;
  const label = String(data.name || data.title || defaultLabel || "limit").trim();

  return {
    label: label || defaultLabel || "limit",
    used: used ?? 0,
    limit: limit ?? 0,
    windowMinutes,
    resetsAt: resetMeta.resetsAt,
    resetHint: resetMeta.resetHint,
  };
}

function buildLimitLabel(item, detail, window, idx) {
  for (const key of ["name", "title", "scope"]) {
    const v = item?.[key] ?? detail?.[key];
    if (v) return String(v);
  }

  const duration = toPositiveNumber(
    window?.duration ?? item?.duration ?? detail?.duration,
  );
  const unit = String(
    window?.timeUnit ?? item?.timeUnit ?? detail?.timeUnit ?? "",
  ).toUpperCase();
  if (duration !== null) {
    if (unit.includes("MINUTE")) return `${duration}m limit`;
    if (unit.includes("HOUR")) return `${duration}h limit`;
    if (unit.includes("DAY")) return `${duration}d limit`;
  }

  return `Limit #${idx + 1}`;
}

function rowToUsageWindow(row, nowMs, fallbackWindowMinutes) {
  if (!row) return null;
  const windowMinutes =
    row.windowMinutes && row.windowMinutes > 0
      ? row.windowMinutes
      : fallbackWindowMinutes;
  const limit = Number(row.limit || 0);
  const used = Number(row.used || 0);

  let usedPercent = 0;
  if (limit > 0) usedPercent = (used / limit) * 100;
  else if (used > 0) usedPercent = 100;
  usedPercent = Number(clamp(usedPercent, 0, 100).toFixed(1));

  const resetsAt =
    row.resetsAt || nextWindowResetIso(nowMs, Math.max(1, windowMinutes || 300));

  return {
    usedPercent,
    resetsAt,
    resetDescription: row.resetHint || row.label || "Usage window",
    windowMinutes: Math.max(1, Math.round(windowMinutes || 300)),
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row) continue;
    const key = [
      row.label || "",
      row.windowMinutes || "",
      row.limit || "",
      row.used || "",
      row.resetsAt || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function buildUsageFromApiPayload(payload, nowMs) {
  if (!isObject(payload)) return null;

  const rows = [];

  const summary = usageRowFromData(payload.usage, "Weekly limit", nowMs);
  if (summary) {
    if (!summary.windowMinutes) summary.windowMinutes = 10080;
    rows.push(summary);
  }

  const limits = Array.isArray(payload.limits) ? payload.limits : [];
  for (let idx = 0; idx < limits.length; idx += 1) {
    const item = limits[idx];
    if (!isObject(item)) continue;
    const detail = isObject(item.detail) ? item.detail : item;
    const window = isObject(item.window) ? item.window : {};
    const label = buildLimitLabel(item, detail, window, idx);
    const row = usageRowFromData(detail, label, nowMs);
    if (!row) continue;

    if (!row.windowMinutes) {
      row.windowMinutes = durationToMinutes(
        window.duration ?? item.duration ?? detail.duration,
        window.timeUnit ?? item.timeUnit ?? detail.timeUnit,
      );
    }
    rows.push(row);
  }

  const sortedRows = dedupeRows(rows).sort((a, b) => {
    const aMinutes = a.windowMinutes ?? Number.POSITIVE_INFINITY;
    const bMinutes = b.windowMinutes ?? Number.POSITIVE_INFINITY;
    if (aMinutes !== bMinutes) return aMinutes - bMinutes;
    const aReset = parseMs(a.resetsAt) ?? Number.POSITIVE_INFINITY;
    const bReset = parseMs(b.resetsAt) ?? Number.POSITIVE_INFINITY;
    return aReset - bReset;
  });

  const windows = sortedRows
    .map((row, idx) => rowToUsageWindow(row, nowMs, idx === 0 ? 300 : 10080))
    .filter(Boolean)
    .slice(0, 3);

  if (windows.length === 0) return null;

  return {
    identity: {
      providerID: "kimi",
      loginMethod: "Kimi Code API",
    },
    loginMethod: "Kimi Code API",
    updatedAt: new Date(nowMs).toISOString(),
    primary: windows[0] || null,
    secondary: windows[1] || null,
    tertiary: windows[2] || null,
  };
}

function extractCreditsFromPayload(payload, nowMs) {
  const candidates = [
    payload?.credits?.remaining,
    payload?.credit?.remaining,
    payload?.balance?.remaining,
    payload?.remaining,
  ];
  let remaining = null;
  for (const c of candidates) {
    const n = toNumber(c);
    if (n === null) continue;
    remaining = n;
    break;
  }

  const rawEvents =
    (Array.isArray(payload?.credits?.events) && payload.credits.events) ||
    (Array.isArray(payload?.events) && payload.events) ||
    [];

  const events = rawEvents
    .filter((e) => isObject(e))
    .slice(-200)
    .map((e) => ({
      ts: e.ts || e.timestamp || e.createdAt || null,
      delta: toNumber(
        e.delta ?? e.amount ?? e.value ?? e.change ?? e.cost ?? e.costUSD,
      ),
      note: e.note || e.type || e.description || null,
    }));

  return {
    remaining,
    updatedAt: new Date(nowMs).toISOString(),
    events,
  };
}

async function fetchKimiUsagePayload(apiKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), USAGE_TIMEOUT_MS);
  try {
    const res = await fetch(`${KIMI_BASE_URL}/usages`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function parseTokenUsageFromBlock(block) {
  const readValue = (...keys) => {
    for (const key of keys) {
      const re = new RegExp(`${escapeRegExp(key)}\\s*=\\s*(\\d+(?:\\.\\d+)?)`);
      const match = block.match(re);
      if (!match) continue;
      const n = toPositiveNumber(match[1]);
      if (n !== null) return n;
    }
    return 0;
  };

  const inputTokens = readValue("input_other", "input", "input_tokens");
  const outputTokens = readValue("output", "output_tokens");
  const cacheReadTokens = readValue("input_cache_read", "cache_read", "cache_read_input_tokens");
  const cacheCreationTokens = readValue(
    "input_cache_creation",
    "cache_write",
    "cache_creation_input_tokens",
  );
  const totalTokens =
    inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens;

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens,
  };
}

function parseTokenUsageFromCombinedLog(logPath) {
  if (!fs.existsSync(logPath)) return null;
  const text = readTextSafe(logPath);
  if (!text) return null;

  const regex =
    /token_usage\s*=\s*TokenUsage\(([\s\S]*?)\)\s*,\s*message_id\s*=/g;
  let best = null;

  for (const match of text.matchAll(regex)) {
    const parsed = parseTokenUsageFromBlock(String(match[1] || ""));
    if (!best || parsed.totalTokens > best.totalTokens) {
      best = parsed;
    }
  }

  return best;
}

function runDurationSeconds(run) {
  const started = parseMs(run.startedAt);
  const finished = parseMs(run.finishedAt);
  if (started === null || finished === null || finished < started) return null;
  return Math.round((finished - started) / 1000);
}

function getRunRecords() {
  const runsDir = path.join(KIMI_STATE_DIR, "runs");
  if (!fs.existsSync(runsDir)) return [];

  const result = [];
  const entries = fs.readdirSync(runsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("run-")) continue;

    const runDir = path.join(runsDir, entry.name);
    const recordPath = path.join(runDir, "record.json");
    if (!fs.existsSync(recordPath)) continue;

    const record = readJsonSafe(recordPath, null);
    if (!isObject(record)) continue;

    const runId =
      String(record.runId || record.id || entry.name).trim() || entry.name;
    const createdAt =
      record.createdAt || record.startedAt || record.finishedAt || null;
    const combinedPath =
      (isObject(record.logs) && record.logs.combinedPath) ||
      path.join(runDir, "combined.log");
    const tokenUsage = parseTokenUsageFromCombinedLog(String(combinedPath || ""));
    const duration = runDurationSeconds(record);

    result.push({
      runId,
      createdAt,
      startedAt: record.startedAt || null,
      finishedAt: record.finishedAt || null,
      status: String(record.status || "unknown"),
      command: String(record.requestedCommand || record.command || "(text)"),
      workspace: record.workspaceId || null,
      exitCode:
        record.exitCode === null || record.exitCode === undefined
          ? null
          : Number(record.exitCode),
      duration,
      tokenUsage,
    });
  }

  result.sort((a, b) => {
    const ams = parseMs(a.createdAt) ?? 0;
    const bms = parseMs(b.createdAt) ?? 0;
    return bms - ams;
  });

  return result;
}

function filterRunsByDays(runs, days) {
  const nowMs = Date.now();
  const cutoff = nowMs - Math.max(0, days) * 24 * 60 * 60 * 1000;
  return runs.filter((run) => {
    const ms = parseMs(run.createdAt);
    return ms !== null && ms >= cutoff;
  });
}

function countRunsInLastMinutes(runs, minutes) {
  const nowMs = Date.now();
  const cutoff = nowMs - Math.max(0, minutes) * 60 * 1000;
  let count = 0;
  for (const run of runs) {
    const ms = parseMs(run.createdAt);
    if (ms !== null && ms >= cutoff) count += 1;
  }
  return count;
}

function sumTokensInWindow(runs, windowMinutes, nowMs) {
  const cutoff = nowMs - Math.max(1, windowMinutes) * 60 * 1000;
  let total = 0;
  for (const run of runs) {
    const ts = parseMs(run.createdAt);
    if (ts === null || ts < cutoff || ts > nowMs) continue;
    const tokens = toPositiveNumber(run?.tokenUsage?.totalTokens) || 0;
    total += tokens;
  }
  return total;
}

function buildFallbackUsageFromRuns(runs, nowMs) {
  const sessionWindowMinutes = intFromEnv("KIMI_FALLBACK_SESSION_WINDOW_MINUTES", 300);
  const weekWindowMinutes = intFromEnv("KIMI_FALLBACK_WEEK_WINDOW_MINUTES", 10080);
  const sessionBudgetTokens = floatFromEnv(
    "KIMI_FALLBACK_SESSION_TOKENS_BUDGET",
    1_000_000,
  );
  const weekBudgetTokens = floatFromEnv(
    "KIMI_FALLBACK_WEEK_TOKENS_BUDGET",
    8_000_000,
  );

  const sessionTokens = sumTokensInWindow(runs, sessionWindowMinutes, nowMs);
  const weekTokens = sumTokensInWindow(runs, weekWindowMinutes, nowMs);

  const sessionUsed =
    sessionBudgetTokens > 0
      ? clamp((sessionTokens / sessionBudgetTokens) * 100, 0, 100)
      : 0;
  const weekUsed =
    weekBudgetTokens > 0
      ? clamp((weekTokens / weekBudgetTokens) * 100, 0, 100)
      : 0;

  return {
    identity: {
      providerID: "kimi",
      loginMethod: "Kimi (fallback from local gateway runs)",
    },
    loginMethod: "Kimi (fallback from local gateway runs)",
    updatedAt: new Date(nowMs).toISOString(),
    primary: {
      usedPercent: Number(sessionUsed.toFixed(1)),
      resetsAt: nextWindowResetIso(nowMs, sessionWindowMinutes),
      resetDescription: `~${Math.round(sessionTokens).toLocaleString()} tokens in ${sessionWindowMinutes}m`,
      windowMinutes: sessionWindowMinutes,
    },
    secondary: {
      usedPercent: Number(weekUsed.toFixed(1)),
      resetsAt: nextWindowResetIso(nowMs, weekWindowMinutes),
      resetDescription: `~${Math.round(weekTokens).toLocaleString()} tokens in ${weekWindowMinutes}m`,
      windowMinutes: weekWindowMinutes,
    },
    tertiary: null,
  };
}

function scoreActivity(run) {
  const statusBase = (() => {
    switch (run.status) {
      case "success":
        return 4;
      case "failed":
      case "timed_out":
        return 2;
      case "canceled":
      case "rejected":
        return 1;
      default:
        return 1;
    }
  })();

  const tokens = toPositiveNumber(run?.tokenUsage?.totalTokens) || 0;
  const tokenScore =
    ACTIVITY_TOKENS_PER_POINT > 0
      ? Math.round(tokens / ACTIVITY_TOKENS_PER_POINT)
      : 0;
  return clamp(Math.max(statusBase, tokenScore), 1, 100);
}

function buildHistoryEntries(runs) {
  const recentRuns = filterRunsByDays(runs, HISTORY_DAYS);
  const entries = [];

  for (const run of recentRuns) {
    const ts = run.createdAt || run.startedAt || run.finishedAt;
    if (!ts) continue;
    entries.push({
      ts,
      provider: "kimi",
      account: "default",
      activity: scoreActivity(run),
      sessionPct: scoreActivity(run),
      runId: run.runId,
      command: String(run.command || "").slice(0, 140),
      status: run.status,
      duration: run.duration,
      workspace: run.workspace,
      totalTokens: toPositiveNumber(run?.tokenUsage?.totalTokens) || null,
      inputTokens: toPositiveNumber(run?.tokenUsage?.inputTokens) || null,
      outputTokens: toPositiveNumber(run?.tokenUsage?.outputTokens) || null,
      cacheReadTokens: toPositiveNumber(run?.tokenUsage?.cacheReadTokens) || null,
      cacheCreationTokens:
        toPositiveNumber(run?.tokenUsage?.cacheCreationTokens) || null,
    });
  }

  const byRunId = new Map();
  for (const entry of entries) {
    if (!entry.runId) continue;
    if (!byRunId.has(entry.runId)) byRunId.set(entry.runId, entry);
  }

  const unique = Array.from(byRunId.values()).sort((a, b) => {
    const ams = parseMs(a.ts) ?? 0;
    const bms = parseMs(b.ts) ?? 0;
    return bms - ams;
  });

  return unique.slice(0, HISTORY_LIMIT);
}

function summarizeRuns(runs) {
  const summary = {
    success: 0,
    failed: 0,
    running: 0,
    queued: 0,
    canceled: 0,
    timed_out: 0,
    rejected: 0,
    unknown: 0,
  };

  for (const run of runs) {
    const key = String(run.status || "unknown");
    if (Object.hasOwn(summary, key)) summary[key] += 1;
    else summary.unknown += 1;
  }
  return summary;
}

function buildKimiStats(runs, nowMs) {
  const summary = summarizeRuns(runs);
  const recentRuns = runs.slice(0, RECENT_RUNS_LIMIT).map((run) => ({
    id: run.runId,
    createdAt: run.createdAt || run.startedAt || run.finishedAt || null,
    status: run.status,
    command: String(run.command || "").slice(0, 140),
    workspace: run.workspace,
    duration: run.duration,
    exitCode:
      run.exitCode === null || run.exitCode === undefined ? null : run.exitCode,
    totalTokens: toPositiveNumber(run?.tokenUsage?.totalTokens) || null,
  }));

  return {
    lastUpdated: new Date(nowMs).toISOString(),
    totalRuns: runs.length,
    status: "ready",
    summary,
    recentRuns,
  };
}

function usageWindowPercent(usage, key) {
  const n = toNumber(usage?.[key]?.usedPercent);
  return n === null ? null : Number(clamp(n, 0, 100).toFixed(1));
}

async function buildUsageEntry(runs, nowMs) {
  const now = new Date(nowMs).toISOString();
  const apiKey = resolveKimiApiKey();

  let payload = null;
  let apiError = "";
  if (apiKey) {
    try {
      payload = await fetchKimiUsagePayload(apiKey);
    } catch (err) {
      apiError = String(err);
    }
  } else {
    apiError = "Kimi API key not found";
  }

  const usageFromApi = payload ? buildUsageFromApiPayload(payload, nowMs) : null;
  const usage = usageFromApi || buildFallbackUsageFromRuns(runs, nowMs);
  const credits = extractCreditsFromPayload(payload || {}, nowMs);
  const runSummary = summarizeRuns(runs);

  const entry = {
    provider: "kimi",
    codexAuthAccount: "default",
    source: usageFromApi ? "kimi-api" : "kimi-gateway-fallback",
    version: "2.0.0",
    usage: {
      ...usage,
      updatedAt: now,
    },
    credits,
    kimiStats: {
      totalRuns: runs.length,
      runsToday: filterRunsByDays(runs, 1).length,
      runsThisWeek: filterRunsByDays(runs, 7).length,
      runsLast5Min: countRunsInLastMinutes(runs, 5),
      runsLastHour: countRunsInLastMinutes(runs, 60),
      primaryUsed: usageWindowPercent(usage, "primary"),
      secondaryUsed: usageWindowPercent(usage, "secondary"),
      successRate:
        runs.length > 0
          ? ((runSummary.success / runs.length) * 100).toFixed(1)
          : "0.0",
      successful: runSummary.success,
      failed:
        runSummary.failed + runSummary.timed_out + runSummary.canceled + runSummary.rejected,
    },
  };

  if (!usageFromApi && apiError) {
    entry.note = `Usage API unavailable, using fallback: ${apiError.slice(0, 220)}`;
  }

  return entry;
}

function writeToTargets(fileName, data) {
  const targets = Array.from(new Set([STATS_DATA_DIR, AI_DATA_DIR]));
  for (const dir of targets) {
    const outPath = path.join(dir, fileName);
    atomicWriteJson(outPath, data);
  }
}

async function main() {
  const nowMs = Date.now();
  const runs = getRunRecords();
  const usageEntry = await buildUsageEntry(runs, nowMs);
  const historyEntries = buildHistoryEntries(runs);
  const stats = buildKimiStats(runs, nowMs);

  writeToTargets("kimi-usage.json", usageEntry);
  writeToTargets("kimi-history.json", historyEntries);
  writeToTargets("kimi-stats.json", stats);

  console.log(
    `[kimi-collector] source=${usageEntry.source} runs=${runs.length} history=${historyEntries.length}`,
  );
}

main().catch((err) => {
  console.error(`[kimi-collector] failed: ${String(err)}`);
  process.exitCode = 1;
});
