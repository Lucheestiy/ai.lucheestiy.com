#!/usr/bin/env node
// Collect MiniMax usage + history from Factory AI/Code sessions + real API limits.
// Sources:
// 1) Factory sessions at /root/.factory/sessions/ (MiniMax model + tokenUsage)
// 2) droidminimaxbot Telegram bot sessions
// 3) MiniMax API for actual rate limits (coding_plan/remains endpoint)

import fs from "node:fs";
import path from "node:path";

const FACTORY_PATH = process.env.FACTORY_PATH || "/root/.factory/sessions";
const DROID_BOT_PATHS = [
  "/home/mlweb/droidminimaxbot/history",
  "/home/mlweb/droidminimax2bot/history",
];
const STATS_DATA_DIR =
  process.env.STATS_DATA_DIR || "/home/mlweb/stats.lucheestiy.com/public/data";
const AI_DATA_DIR =
  process.env.AI_DATA_DIR || "/home/mlweb/ai.lucheestiy.com/public/data";

// MiniMax API configuration
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "sk-cp-okvPF0JbL7yuxX1JTpkdWMwYk5Zu3xiEBkaGH3O6uzDrcud8f7yyeZUAQEJhgbJOg26lGFbvrXxOaxAfiyKL0JO63Cd7xlfPdD6SsglNdhvN95Fi9D8RfMg";
const MINIMAX_REMAINS_URL = "https://www.minimax.io/v1/api/openplatform/coding_plan/remains";

const HISTORY_LIMIT = intFromEnv("MINIMAX_HISTORY_LIMIT", 2000);
const HISTORY_DAYS = intFromEnv("MINIMAX_HISTORY_DAYS", 30);
const RECENT_RUNS_LIMIT = intFromEnv("MINIMAX_RECENT_RUNS_LIMIT", 20);
const ACTIVITY_TOKENS_PER_POINT = floatFromEnv(
  "MINIMAX_ACTIVITY_TOKENS_PER_POINT",
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

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function isMiniMaxModel(model) {
  if (!model) return false;
  const m = String(model).toLowerCase();
  return m.includes("minimax") || m.includes("m2.5") || m.includes("m2.1");
}

function parseFactorySettings(settingsPath) {
  try {
    const content = fs.readFileSync(settingsPath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function parseFactorySessionTitle(jsonlPath) {
  // Read first line to get session title
  try {
    const content = fs.readFileSync(jsonlPath, "utf8");
    const firstLine = content.trim().split("\n")[0];
    if (!firstLine) return null;
    const event = JSON.parse(firstLine);
    return event.title || event.sessionTitle || null;
  } catch {
    return null;
  }
}

function getFactorySessions() {
  const sessions = [];
  const factoryRoot = path.resolve(FACTORY_PATH);

  if (!fs.existsSync(factoryRoot)) return sessions;

  try {
    const workspaces = fs.readdirSync(factoryRoot, { withFileTypes: true });

    for (const ws of workspaces) {
      if (!ws.isDirectory()) continue;

      const wsPath = path.join(factoryRoot, ws.name);
      const entries = fs.readdirSync(wsPath, { withFileTypes: true });

      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (!ent.name.endsWith(".jsonl")) continue;

        const sessionId = ent.name.replace(".jsonl", "");
        const jsonlPath = path.join(wsPath, ent.name);
        const settingsPath = path.join(wsPath, `${sessionId}.settings.json`);

        const settings = parseFactorySettings(settingsPath);
        if (!settings || !isMiniMaxModel(settings.model)) continue;

        const stat = safeStat(jsonlPath);
        if (!stat) continue;

        // Get session title from JSONL
        const title = parseFactorySessionTitle(jsonlPath);

        // Get token usage from settings
        const tokenUsage = settings.tokenUsage || {};
        const totalTokens =
          (tokenUsage.inputTokens || 0) +
          (tokenUsage.outputTokens || 0) +
          (tokenUsage.cacheReadTokens || 0) +
          (tokenUsage.cacheCreationTokens || 0) +
          (tokenUsage.thinkingTokens || 0);

        sessions.push({
          sessionId,
          workspace: ws.name.replace(/^-/, "").replace(/-/g, "/"),
          jsonlPath,
          settingsPath,
          mtimeMs: stat.mtimeMs,
          model: settings.model,
          tokenUsage,
          totalTokens,
          title,
          source: "factory",
        });
      }
    }
  } catch (e) {
    console.error(`Error reading factory sessions: ${e.message}`);
  }

  return sessions;
}

function getDroidBotSessions() {
  const sessions = [];

  for (const botPath of DROID_BOT_PATHS) {
    if (!fs.existsSync(botPath)) continue;

    try {
      const entries = fs.readdirSync(botPath, { withFileTypes: true });
      for (const ent of entries) {
        if (!ent.isFile()) continue;
        if (!ent.name.endsWith(".json")) continue;

        const sessionPath = path.join(botPath, ent.name);
        const stat = safeStat(sessionPath);
        if (!stat) continue;

        // Parse history to count messages
        const history = readJsonSafe(sessionPath, []);
        const messageCount = Array.isArray(history) ? history.length : 0;

        // Estimate tokens (rough heuristic)
        const estimatedTokens = messageCount * 2000;

        sessions.push({
          sessionId: ent.name.replace(".json", ""),
          workspace: path.basename(path.dirname(botPath)),
          jsonlPath: sessionPath,
          mtimeMs: stat.mtimeMs,
          model: "custom:MiniMax-M2.5-0",
          tokenUsage: {},
          totalTokens: estimatedTokens,
          title: messageCount > 0 && history[0]?.user 
            ? String(history[0].user).slice(0, 100) 
            : null,
          messageCount,
          source: "droid-bot",
        });
      }
    } catch (e) {
      console.error(`Error reading droid bot sessions from ${botPath}: ${e.message}`);
    }
  }

  return sessions;
}

function getAllSessions() {
  const factory = getFactorySessions();
  const droid = getDroidBotSessions();
  const all = [...factory, ...droid];
  // Sort by mtime descending
  all.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return all;
}

function filterSessionsByDays(sessions, days) {
  const nowMs = Date.now();
  const cutoff = nowMs - Math.max(0, days) * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => s.mtimeMs >= cutoff);
}

function countSessionsInLastMinutes(sessions, minutes) {
  const nowMs = Date.now();
  const cutoff = nowMs - Math.max(0, minutes) * 60 * 1000;
  let count = 0;
  for (const s of sessions) {
    if (s.mtimeMs >= cutoff) count += 1;
  }
  return count;
}

function sumTokensInWindow(sessions, windowMinutes, nowMs) {
  const cutoff = nowMs - Math.max(1, windowMinutes) * 60 * 1000;
  let total = 0;
  for (const s of sessions) {
    if (s.mtimeMs < cutoff || s.mtimeMs > nowMs) continue;
    total += s.totalTokens || 0;
  }
  return total;
}

function scoreActivity(session) {
  const tokens = toPositiveNumber(session.totalTokens) || 0;
  const tokenScore =
    ACTIVITY_TOKENS_PER_POINT > 0
      ? Math.round(tokens / ACTIVITY_TOKENS_PER_POINT)
      : 0;
  return clamp(Math.max(1, tokenScore), 1, 100);
}

function buildHistoryEntries(sessions) {
  const recentSessions = filterSessionsByDays(sessions, HISTORY_DAYS);
  const entries = [];

  for (const s of recentSessions) {
    const ts = new Date(s.mtimeMs).toISOString();
    entries.push({
      ts,
      provider: "minimax",
      account: "default",
      activity: scoreActivity(s),
      sessionPct: scoreActivity(s),
      sessionId: s.sessionId,
      workspace: s.workspace,
      source: s.source,
      model: s.model,
      title: s.title,
      totalTokens: toPositiveNumber(s.totalTokens) || null,
      inputTokens: toPositiveNumber(s.tokenUsage?.inputTokens) || null,
      outputTokens: toPositiveNumber(s.tokenUsage?.outputTokens) || null,
      cacheReadTokens: toPositiveNumber(s.tokenUsage?.cacheReadTokens) || null,
      cacheCreationTokens:
        toPositiveNumber(s.tokenUsage?.cacheCreationTokens) || null,
      thinkingTokens: toPositiveNumber(s.tokenUsage?.thinkingTokens) || null,
    });
  }

  // Dedupe by sessionId
  const bySessionId = new Map();
  for (const entry of entries) {
    if (!entry.sessionId) continue;
    if (!bySessionId.has(entry.sessionId)) bySessionId.set(entry.sessionId, entry);
  }

  const unique = Array.from(bySessionId.values()).sort((a, b) => {
    const ams = parseMs(a.ts) ?? 0;
    const bms = parseMs(b.ts) ?? 0;
    return bms - ams;
  });

  return unique.slice(0, HISTORY_LIMIT);
}

function buildMiniMaxStats(sessions, nowMs) {
  const recentSessions = sessions.slice(0, RECENT_RUNS_LIMIT).map((s) => ({
    id: s.sessionId,
    createdAt: new Date(s.mtimeMs).toISOString(),
    workspace: s.workspace,
    source: s.source,
    model: s.model,
    title: s.title,
    totalTokens: toPositiveNumber(s.totalTokens) || null,
    inputTokens: toPositiveNumber(s.tokenUsage?.inputTokens) || null,
    outputTokens: toPositiveNumber(s.tokenUsage?.outputTokens) || null,
  }));

  // Calculate totals
  let totalTokens = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  let totalThinking = 0;

  for (const s of sessions) {
    totalTokens += s.totalTokens || 0;
    if (s.tokenUsage) {
      totalInput += s.tokenUsage.inputTokens || 0;
      totalOutput += s.tokenUsage.outputTokens || 0;
      totalCacheRead += s.tokenUsage.cacheReadTokens || 0;
      totalCacheCreation += s.tokenUsage.cacheCreationTokens || 0;
      totalThinking += s.tokenUsage.thinkingTokens || 0;
    }
  }

  return {
    lastUpdated: new Date(nowMs).toISOString(),
    totalSessions: sessions.length,
    totalTokens,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    totalCacheReadTokens: totalCacheRead,
    totalCacheCreationTokens: totalCacheCreation,
    totalThinkingTokens: totalThinking,
    status: "ready",
    recentSessions,
  };
}

function buildDailyCostBreakdown(sessions) {
  // MiniMax pricing: ~$0.50 per 1M tokens (approximate)
  const costPerMillion = 0.5;
  const dailyMap = new Map();

  for (const s of sessions) {
    if (!s.mtimeMs || !s.totalTokens) continue;
    
    const date = new Date(s.mtimeMs).toISOString().slice(0, 10); // YYYY-MM-DD
    const sessionCost = (s.totalTokens / 1_000_000) * costPerMillion;
    
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        date,
        totalCost: 0,
        totalTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        thinkingTokens: 0,
        modelsUsed: new Set(),
        modelBreakdowns: [],
      });
    }
    
    const day = dailyMap.get(date);
    day.totalCost += sessionCost;
    day.totalTokens += s.totalTokens || 0;
    day.inputTokens += s.tokenUsage?.inputTokens || 0;
    day.outputTokens += s.tokenUsage?.outputTokens || 0;
    day.cacheReadTokens += s.tokenUsage?.cacheReadTokens || 0;
    day.cacheCreationTokens += s.tokenUsage?.cacheCreationTokens || 0;
    day.thinkingTokens += s.tokenUsage?.thinkingTokens || 0;
    
    if (s.model) {
      day.modelsUsed.add(s.model);
      // Update or add model breakdown
      const existing = day.modelBreakdowns.find(mb => mb.modelName === s.model);
      if (existing) {
        existing.cost += sessionCost;
        existing.tokens += s.totalTokens || 0;
      } else {
        day.modelBreakdowns.push({
          modelName: s.model,
          cost: sessionCost,
          tokens: s.totalTokens || 0,
        });
      }
    }
  }

  // Convert to array and sort by date
  const daily = Array.from(dailyMap.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(day => ({
      date: day.date,
      totalCost: Number(day.totalCost.toFixed(6)),
      totalTokens: day.totalTokens,
      inputTokens: day.inputTokens || undefined,
      outputTokens: day.outputTokens || undefined,
      cacheReadTokens: day.cacheReadTokens || undefined,
      cacheCreationTokens: day.cacheCreationTokens || undefined,
      thinkingTokens: day.thinkingTokens || undefined,
      modelsUsed: Array.from(day.modelsUsed),
      modelBreakdowns: day.modelBreakdowns.map(mb => ({
        modelName: mb.modelName,
        cost: Number(mb.cost.toFixed(6)),
        tokens: mb.tokens,
      })),
    }));

  return daily;
}

// Fetch real MiniMax rate limits from API
async function fetchMiniMaxLimits() {
  try {
    const response = await fetch(MINIMAX_REMAINS_URL, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${MINIMAX_API_KEY}`,
      },
    });

    if (!response.ok) {
      console.error(`[minimax-collector] API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    
    if (data.base_resp?.status_code !== 0) {
      console.error(`[minimax-collector] API error: ${data.base_resp?.status_msg || 'unknown'}`);
      return null;
    }

    // Parse model_remains array
    const modelRemains = data.model_remains || [];
    if (modelRemains.length === 0) {
      console.error("[minimax-collector] No model_remains data from API");
      return null;
    }

    // Use the first (and usually only) model entry
    const modelData = modelRemains[0];
    
    const totalCount = modelData.current_interval_total_count || 0;
    // Despite the field name, current_interval_usage_count from /coding_plan/remains
    // behaves as a remaining counter (starts at total and decreases as requests are used).
    const apiRemainingCount = modelData.current_interval_usage_count || 0;
    const remainingCount = Math.max(0, Math.min(totalCount, apiRemainingCount));
    const usageCount = Math.max(0, totalCount - remainingCount);
    const remainsTimeSeconds = modelData.remains_time || 0;
    const startTimeMs = modelData.start_time || 0;
    const endTimeMs = modelData.end_time || 0;
    const modelName = modelData.model_name || "MiniMax-M2";
    
    const nowMs = Date.now();
    
    // Calculate window duration (MiniMax uses 5-hour windows based on API data)
    const windowDurationMs = endTimeMs - startTimeMs;
    const windowMinutes = Math.round(windowDurationMs / (60 * 1000));
    
    // The remains_time from API appears to be very large (possibly a timestamp or total remaining)
    // Calculate resetsAt based on end_time instead for accuracy
    const resetsAtMs = endTimeMs;
    
    // Calculate time until reset
    const timeUntilResetSeconds = Math.max(0, Math.floor((resetsAtMs - nowMs) / 1000));
    
    // If the calculated window is unreasonable, fall back to 5 hours
    const effectiveWindowMinutes = (windowMinutes > 0 && windowMinutes < 1440) 
      ? windowMinutes 
      : 300; // 5 hours default

    return {
      modelName,
      totalCount,
      usageCount,
      remainingCount,
      usedPercent: totalCount > 0 ? Math.round((usageCount / totalCount) * 100) : 0,
      remainsTimeSeconds: timeUntilResetSeconds,
      resetsAt: new Date(resetsAtMs).toISOString(),
      windowMinutes: effectiveWindowMinutes,
      startTime: new Date(startTimeMs).toISOString(),
      endTime: new Date(endTimeMs).toISOString(),
      source: "api",
    };
  } catch (error) {
    console.error(`[minimax-collector] Failed to fetch limits: ${error.message}`);
    return null;
  }
}

function buildUsageEntry(sessions, limitsData, nowMs) {
  const now = new Date(nowMs).toISOString();

  // Calculate totals
  let totalCostUSD = 0;
  let totalTokens = 0;
  for (const s of sessions) {
    totalTokens += s.totalTokens || 0;
  }

  // MiniMax pricing: ~$0.50 per 1M tokens (approximate)
  const costPerMillion = 0.5;
  totalCostUSD = (totalTokens / 1_000_000) * costPerMillion;

  // Build daily cost breakdown for trend chart
  const daily = buildDailyCostBreakdown(sessions);
  
  // Calculate last 30 days stats from daily breakdown
  const last30Days = daily.slice(-30);
  const last30DaysCostUSD = last30Days.reduce((sum, d) => sum + d.totalCost, 0);
  const last30DaysTokens = last30Days.reduce((sum, d) => sum + d.totalTokens, 0);

  // For the usage card, show actual stats
  const sessionsToday = filterSessionsByDays(sessions, 1).length;
  const sessionsThisWeek = filterSessionsByDays(sessions, 7).length;
  const sessionsLast5Min = countSessionsInLastMinutes(sessions, 5);
  const sessionsLastHour = countSessionsInLastMinutes(sessions, 60);

  // Get today's tokens
  const todayTokens = filterSessionsByDays(sessions, 1).reduce((sum, s) => sum + (s.totalTokens || 0), 0);
  const thisWeekTokens = filterSessionsByDays(sessions, 7).reduce((sum, s) => sum + (s.totalTokens || 0), 0);

  // Build primary/secondary windows based on real API limits if available
  let primary, secondary;

  if (limitsData) {
    // Use real API limits for primary window
    const remainingFormatted = limitsData.remainingCount.toLocaleString();
    const totalFormatted = limitsData.totalCount.toLocaleString();
    const resetInMinutes = Math.ceil(limitsData.remainsTimeSeconds / 60);
    const resetFormatted = resetInMinutes < 60 
      ? `${resetInMinutes}m` 
      : `${Math.ceil(resetInMinutes / 60)}h`;
    
    primary = {
      usedPercent: limitsData.usedPercent,
      resetsAt: limitsData.resetsAt,
      resetDescription: `${limitsData.usageCount.toLocaleString()} / ${totalFormatted} used · ${remainingFormatted} remaining · resets in ${resetFormatted}`,
      windowMinutes: limitsData.windowMinutes,
      isStatOnly: false,
      modelName: limitsData.modelName,
      remainingCount: limitsData.remainingCount,
      totalCount: limitsData.totalCount,
      usageCount: limitsData.usageCount,
    };

    // Secondary: tokens today (informational)
    secondary = {
      usedPercent: null,
      resetsAt: null,
      resetDescription: `${Math.round(todayTokens).toLocaleString()} tokens today · ${sessionsToday} sessions`,
      windowMinutes: 1440,
      isStatOnly: true,
    };
  } else {
    // Fallback to stats-only display if API is unavailable
    primary = {
      usedPercent: null,
      resetsAt: null,
      resetDescription: `${Math.round(todayTokens).toLocaleString()} tokens today · ${sessionsToday} sessions`,
      windowMinutes: 1440,
      isStatOnly: true,
    };

    secondary = {
      usedPercent: null,
      resetsAt: null,
      resetDescription: `${Math.round(thisWeekTokens).toLocaleString()} tokens this week · ${sessionsThisWeek} sessions`,
      windowMinutes: 10080,
      isStatOnly: true,
    };
  }

  const usage = {
    identity: {
      providerID: "minimax",
      loginMethod: limitsData ? `MiniMax API (${limitsData.modelName})` : "Factory AI Subscription ($50/mo)",
    },
    loginMethod: limitsData ? `MiniMax API (${limitsData.modelName})` : "Factory AI Subscription ($50/mo)",
    updatedAt: now,
    primary,
    secondary,
    tertiary: null,
    window: {
      budgetUSD: 50.0,
      totalCostUSD,
      totalTokens,
      missingCostEntries: 0,
      resetOffsetMinutes: 0,
    },
    // Include raw limits data for debugging/detail views
    limits: limitsData,
  };

  return {
    provider: "minimax",
    source: "combined",
    usage,
    daily,
    last30DaysCostUSD,
    last30DaysTokens,
    minimaxStats: {
      totalSessions: sessions.length,
      sessionsToday,
      sessionsThisWeek,
      sessionsLast5Min,
      sessionsLastHour,
      todayTokens,
      thisWeekTokens,
      totalCostUSD,
      totalTokens,
    },
    limitsData,
  };
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
  
  // Fetch real MiniMax API limits
  const limitsData = await fetchMiniMaxLimits();
  
  const sessions = getAllSessions();
  const usageEntry = buildUsageEntry(sessions, limitsData, nowMs);
  const historyEntries = buildHistoryEntries(sessions);
  const stats = buildMiniMaxStats(sessions, nowMs);

  writeToTargets("minimax-usage.json", usageEntry);
  writeToTargets("minimax-history.json", historyEntries);
  writeToTargets("minimax-stats.json", stats);

  const limitsInfo = limitsData 
    ? `limits=${limitsData.usageCount}/${limitsData.totalCount}(${limitsData.usedPercent}%) resets_in=${Math.round(limitsData.remainsTimeSeconds/60)}m` 
    : "limits=unavailable";
  
  console.log(
    `[minimax-collector] sessions=${sessions.length} history=${historyEntries.length} tokens=${stats.totalTokens.toLocaleString()} ${limitsInfo}`,
  );
}

main().catch((err) => {
  console.error(`[minimax-collector] failed: ${String(err)}`);
  process.exitCode = 1;
});
