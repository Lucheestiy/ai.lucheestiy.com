// CodexBar Dashboard - Enhanced Version
const DATA_URL = "/data/latest.json";
const HISTORY_URL = "/data/history.json";
const KIMI_USAGE_URL = "/data/kimi-usage.json";
const KIMI_HISTORY_URL = "/data/kimi-history.json";
const REFRESH_MS = 60_000;
const DAY_TZ_STORAGE_KEY = "codexbar-day-tz"; // "en" (New York) | "ru" (Minsk)
const CODEX_ACCOUNT_VIEW_STORAGE_KEY = "codexbar-codex-account-view"; // "all" | account id
const CODEX_HEATMAP_COMBINED_STORAGE_KEY = "codexbar-codex-heatmap-combined"; // "1" => combined heatmap when view=all

// State
let currentLang = localStorage.getItem("codexbar-lang") || "en";
let dayTzOverride = localStorage.getItem(DAY_TZ_STORAGE_KEY) || "";
let currentTheme = localStorage.getItem("codexbar-theme") || "dark";
let currentSort = "reset";
let currentModelFilter = localStorage.getItem("codexbar-model-filter") || "all";
let trendPinned = localStorage.getItem("codexbar-trend-pinned") === "1";
let trendStartDate = trendPinned ? localStorage.getItem("codexbar-trend-start") || "" : "";
let trendEndDate = trendPinned ? localStorage.getItem("codexbar-trend-end") || "" : "";
let compareMode = false;
let cachedData = null;
let cachedHistory = null;
let countdownIntervals = [];
let codexAccountView = localStorage.getItem(CODEX_ACCOUNT_VIEW_STORAGE_KEY) || "";
let codexHeatmapCombined = localStorage.getItem(CODEX_HEATMAP_COMBINED_STORAGE_KEY) !== "0";

try {
  const q = new URLSearchParams(window.location.search).get("codex");
  if (q) codexAccountView = q;
} catch {
  // ignore
}

// i18n translations
const i18n = {
  en: {
    title: "CodexBar Dashboard",
    subtitle: "AI Usage & Cost Monitor",
    loading: "Loading...",
    usage: "Usage",
    costLocal: "Cost (Local Logs)",
    costTrend: "Cost Trend",
    usageByHour: "Usage by Hour",
    rawJson: "Raw JSON",
    apiEndpoint: "API Endpoint",
    compare: "Compare",
    sortReset: "Reset Time",
    sortUsage: "% Used",
    sortName: "Name",
    footer: "Updated every ~5 minutes (systemd timer). Cost is aggregated per provider on this machine.",
    updated: "Updated",
    host: "Host",
    active: "Active",
    session: "Session",
    week: "Week",
    window: "Window",
    day: "Day",
    today: "Today",
    yesterday: "Yesterday",
    last30Days: "Last 30 days",
    tokens: "tokens",
    left: "left",
    used: "used",
    resets: "Resets",
    noUsageData: "No usage data",
    noCostData: "No cost data",
    noProviders: "No providers found",
    login: "Login",
    credits: "Credits",
    creditsRemaining: "Credits Left",
    creditsSpent: "Credits Spent",
    source: "Source",
    errors: "Errors",
    less: "Less",
    more: "More",
    noActivity: "No activity",
    activity: "activity",
    input: "Input",
    output: "Output",
    cacheRead: "Cache Read",
    cacheCreate: "Cache Create",
    models: "Models Used",
    modelFilter: "Model",
    allModels: "All models",
    exportCsv: "Export CSV",
    range30d: "Reset",
    range30Days: "30 days",
    totalCost: "Total Cost",
    totalTokens: "Total Tokens",
    avgDaily: "Avg Daily",
    vsLastWeek: "vs last week",
    minutesAgo: "min ago",
    hoursAgo: "hr ago",
    justNow: "just now",
    accounts: "Accounts",
    allAccounts: "All",
    openInNewTab: "Open in new tab",
    combined: "Combined"
  },
  ru: {
    title: "Панель CodexBar",
    subtitle: "Мониторинг AI использования и стоимости",
    loading: "Загрузка...",
    usage: "Использование",
    costLocal: "Стоимость (локальные логи)",
    costTrend: "Динамика стоимости",
    usageByHour: "Использование по часам",
    rawJson: "JSON (сырые данные)",
    apiEndpoint: "API эндпоинт",
    compare: "Сравнить",
    sortReset: "Время сброса",
    sortUsage: "% использовано",
    sortName: "Название",
    footer: "Обновляется каждые ~5 минут. Стоимость агрегирована по провайдерам на этом сервере.",
    updated: "Обновлено",
    host: "Хост",
    active: "Активный",
    session: "Сессия",
    week: "Неделя",
    window: "Окно",
    day: "День",
    today: "Сегодня",
    yesterday: "Вчера",
    last30Days: "Последние 30 дней",
    tokens: "токенов",
    left: "осталось",
    used: "использовано",
    resets: "Сброс",
    noUsageData: "Нет данных по использованию",
    noCostData: "Нет данных по стоимости",
    noProviders: "Провайдеры не найдены",
    login: "Вход",
    credits: "Кредиты",
    creditsRemaining: "Остаток кредитов",
    creditsSpent: "Потрачено кредитов",
    source: "Источник",
    errors: "Ошибки",
    less: "Меньше",
    more: "Больше",
    noActivity: "Нет активности",
    activity: "активность",
    input: "Входные",
    output: "Выходные",
    cacheRead: "Чтение кэша",
    cacheCreate: "Создание кэша",
    models: "Модели",
    modelFilter: "Модель",
    allModels: "Все модели",
    exportCsv: "Экспорт CSV",
    range30d: "Сброс",
    range30Days: "30 дней",
    totalCost: "Общая стоимость",
    totalTokens: "Всего токенов",
    avgDaily: "Средн. в день",
    vsLastWeek: "к прошлой неделе",
    minutesAgo: "мин назад",
    hoursAgo: "ч назад",
    justNow: "только что",
    accounts: "Аккаунты",
    allAccounts: "Все",
    openInNewTab: "Открыть в новой вкладке",
    combined: "Суммарно",
    kimiCli: "KiMi CLI",
    openTelegram: "Open @KiMiclibot",
    recentRuns: "Recent Runs",
    totalRuns: "Total Runs"
  }
};

// DOM Elements
const updatedAtEl = document.getElementById("updatedAt");
const relativeTimeEl = document.getElementById("relativeTime");
const hostEl = document.getElementById("host");
const currentAccountEl = document.getElementById("currentAccount");
const providersEl = document.getElementById("providers");
const costEl = document.getElementById("cost");
const errorsEl = document.getElementById("errors");
const rawJsonEl = document.getElementById("rawJson");
const heatmapEl = document.getElementById("heatmap");
const heatmapDetailEl = document.getElementById("heatmapDetail");
const statsSummaryEl = document.getElementById("statsSummary");
const chartCanvas = document.getElementById("costChart");
const chartTooltip = document.getElementById("chartTooltip");
const chartLegend = document.getElementById("chartLegend");
const costTrendRangeLabelEl = document.getElementById("costTrendRangeLabel");
const trendStartEl = document.getElementById("trendStart");
const trendEndEl = document.getElementById("trendEnd");
const trendResetBtn = document.getElementById("trendReset");
const exportCsvBtn = document.getElementById("exportCsv");
const modelFilterEl = document.getElementById("modelFilter");
const langToggle = document.getElementById("langToggle");
const langLabel = document.getElementById("langLabel");
const tzToggle = document.getElementById("tzToggle");
const tzLabelEl = document.getElementById("tzLabel");
const themeToggle = document.getElementById("themeToggle");
const compareToggleBtn = document.getElementById("compareToggle");
const sortButtons = document.querySelectorAll('.sortBtn[data-sort]');

// Utility functions
function t(key) {
  return i18n[currentLang]?.[key] || i18n.en[key] || key;
}

function getDayBucketKey() {
  if (dayTzOverride === "en" || dayTzOverride === "ru") return dayTzOverride;
  return currentLang === "ru" ? "ru" : "en";
}

function getTimeZoneInfo() {
  const key = getDayBucketKey();
  if (key === "ru") {
    return { key, timeZone: "Europe/Minsk", label: currentLang === "ru" ? "Минск" : "Minsk" };
  }
  return { key, timeZone: "America/New_York", label: currentLang === "ru" ? "Нью-Йорк" : "New York" };
}

function getCostForCurrentView(data) {
  const costByLang = data?.costByLang;
  const picked = costByLang?.[getDayBucketKey()];
  if (Array.isArray(picked)) return picked;
  if (Array.isArray(data?.cost)) return data.cost;
  return [];
}

function formatYmdInTimeZone(date, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(date);
    const getPart = (type) => parts.find(p => p.type === type)?.value || "";
    const year = getPart("year");
    const month = getPart("month");
    const day = getPart("day");
    return year && month && day ? `${year}-${month}-${day}` : formatter.format(date);
  } catch {
    return "";
  }
}

function getTodayRange() {
  const { timeZone, label } = getTimeZoneInfo();
  const now = new Date();
  const today = formatYmdInTimeZone(now, timeZone);
  const tomorrow = formatYmdInTimeZone(new Date(now.getTime() + 24 * 60 * 60 * 1000), timeZone);
  return { timeZone, label, today, tomorrow };
}

function getTodayRangeText() {
  const { label, today, tomorrow } = getTodayRange();
  if (!today || !tomorrow) return label;
  return `${label}: ${today} 00:00 → ${tomorrow} 00:00`;
}

function getTodayYmd() {
  return getTodayRange().today;
}

function getDailyTotalsForDate(cost, dateYmd) {
  const daily = Array.isArray(cost?.daily) ? cost.daily : [];
  const entry = daily.find(d => d?.date === dateYmd);
  const totalCost = Number(entry?.totalCost ?? 0);
  const totalTokens = Number(entry?.totalTokens ?? 0);
  return {
    totalCost: Number.isFinite(totalCost) ? totalCost : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  };
}

function addDaysToYmd(ymd, deltaDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd))) return "";
  const d = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + Number(deltaDays || 0));
  return d.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatIso(iso) {
  if (iso === null || iso === undefined || iso === "") return "—";
  const ms = parseIsoMs(iso);
  if (ms === null) return String(iso);
  const d = new Date(ms);
  const opts = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };
  opts.timeZone = getTimeZoneInfo().timeZone;
  return d.toLocaleString(currentLang === "ru" ? "ru-RU" : "en-US", opts);
}

function formatRelativeTime(iso) {
  const ms = parseIsoMs(iso);
  if (ms === null) return "";
  const now = Date.now();
  const diffMs = now - ms;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return t("justNow");
  if (diffMin < 60) return `${diffMin} ${t("minutesAgo")}`;
  if (diffHr < 24) return `${diffHr} ${t("hoursAgo")}`;
  return "";
}

function parseIsoMs(iso) {
  if (iso === null || iso === undefined || iso === "") return null;
  if (typeof iso === "number") {
    if (!Number.isFinite(iso)) return null;
    return iso < 1e12 ? iso * 1000 : iso; // seconds → ms (best effort)
  }
  const s = String(iso).trim();
  if (!s) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return n < 1e12 ? n * 1000 : n;
  }
  const d = new Date(s);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function findResetValueForWindowMinutes(usage, windowMinutes) {
  const target = Number(windowMinutes);
  if (!usage || !Number.isFinite(target) || target <= 0) return null;
  const windows = [usage.primary, usage.secondary, usage.tertiary].filter(Boolean);
  let bestValue = null;
  let bestMs = null;
  for (const w of windows) {
    if (Number(w.windowMinutes) !== target) continue;
    const ms = parseIsoMs(w.resetsAt);
    if (ms === null) continue;
    if (bestMs === null || ms < bestMs) {
      bestMs = ms;
      bestValue = w.resetsAt;
    }
  }
  return bestValue;
}

function getResetCandidate(usage, window) {
  if (!window) return { resetMs: null, resetValue: null };

  const directValue = window.resetsAt ?? null;
  const directMs = parseIsoMs(directValue);
  if (directMs !== null) return { resetMs: directMs, resetValue: directValue };

  const fallbackValue = findResetValueForWindowMinutes(usage, window.windowMinutes);
  const fallbackMs = parseIsoMs(fallbackValue);
  if (fallbackMs !== null) return { resetMs: fallbackMs, resetValue: fallbackValue };

  return { resetMs: null, resetValue: directValue };
}

function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString();
}

function formatUsd(value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function formatKimiCredits(value) {
  const formatted = formatUsd(value);
  if (formatted === "—") return formatted;
  if (typeof formatted === "string" && formatted.includes("$")) return formatted;
  return `$${formatted}`;
}

function formatPercent(value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const abs = Math.abs(n);
  const decimals = abs > 0 && abs < 1 ? 2 : 1;
  const rounded = n.toFixed(decimals);
  return rounded.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatCountdown(ms) {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function soonestResetMs(usage, windowMinutes) {
  if (!usage) return null;
  const windows = [usage.primary, usage.secondary, usage.tertiary].filter(Boolean);
  let best = null;
  for (const w of windows) {
    if (w.windowMinutes !== windowMinutes) continue;
    const ms = parseIsoMs(w.resetsAt);
    if (ms === null) continue;
    if (best === null || ms < best) best = ms;
  }
  return best;
}

function windowLabel(minutes) {
  if (!minutes) return t("window");
  if (minutes === 5) return `RPM (5min)`;
  if (minutes === 60) return `RPM (1h)`;
  if (minutes === 300) return `${t("session")} (5h)`;
  if (minutes === 10080) return `${t("week")} (7d)`;
  if (minutes === 1440) return `${t("window")} (24h)`;
  const hours = minutes / 60;
  if (hours < 48) return `${t("window")} (${hours.toFixed(1)}h)`;
  return `${t("window")} (${(hours / 24).toFixed(1)}d)`;
}

function getThresholdClass(usedPercent) {
  const n = Number(usedPercent);
  if (!Number.isFinite(n)) return "";
  if (n >= 90) return "danger";
  if (n >= 80) return "warn";
  if (n >= 70) return "warn";
  return "";
}

function getPillClass(usedPercent) {
  const n = Number(usedPercent);
  if (!Number.isFinite(n)) return "";
  const left = 100 - n;
  if (left <= 10) return "danger";
  if (left <= 20) return "warning";
  if (left <= 30) return "warning";
  return "";
}

function getProviderIcon(provider) {
  const p = (provider || "").toLowerCase();
  if (p === "codex") return `<span class="providerIcon codex">C</span>`;
  if (p === "claude") return `<span class="providerIcon claude">A</span>`;
  if (p === "gemini") return `<span class="providerIcon gemini">G</span>`;
  if (p === "minimax") return `<span class="providerIcon minimax">M</span>`;
  if (p === "kimi") return `<span class="providerIcon kimi">K</span>`;
  return "";
}

// Update i18n text
function updateTzLabel() {
  const tz = getTimeZoneInfo();
  if (tzLabelEl) tzLabelEl.textContent = tz.label;
  if (tzToggle) {
    tzToggle.classList.toggle("active", dayTzOverride === "en" || dayTzOverride === "ru");
    tzToggle.title = currentLang === "ru"
      ? "Часовой пояс дня (клик: переключить, Shift+клик: авто)"
      : "Day timezone (click: toggle, Shift-click: auto)";
  }
}

function updateI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (key && i18n[currentLang]?.[key]) {
      el.textContent = i18n[currentLang][key];
    }
  });
  langLabel.textContent = currentLang.toUpperCase();
  updateTzLabel();
  if (trendResetBtn) {
    trendResetBtn.title =
      currentLang === "ru" ? "Сбросить диапазон к последним 30 дням" : "Reset range to latest 30 days";
  }
}

// Theme toggle
function applyTheme() {
  document.documentElement.setAttribute("data-theme", currentTheme);
  const icon = document.getElementById("themeIcon");
  if (currentTheme === "light") {
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  } else {
    icon.innerHTML = `<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>`;
  }
}

// Countdown timers
function clearCountdowns() {
  countdownIntervals.forEach(id => clearInterval(id));
  countdownIntervals = [];
}

function startCountdown(elementId, targetMs) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const update = () => {
    const remaining = targetMs - Date.now();
    if (remaining <= 0) {
      el.textContent = "0:00";
      el.classList.add("urgent");
      return;
    }
    el.textContent = formatCountdown(remaining);
    el.classList.toggle("urgent", remaining < 300000); // < 5 min
  };

  update();
  const id = setInterval(update, 1000);
  countdownIntervals.push(id);
}

// Build usage section with countdown
function buildUsageSection(usage, providerId) {
  if (!usage) return `<div class="usageBlock"><div class="k">${t("noUsageData")}</div></div>`;

  const blocks = [
    { key: "primary", title: windowLabel(usage.primary?.windowMinutes) },
    { key: "secondary", title: windowLabel(usage.secondary?.windowMinutes) },
    usage.tertiary ? { key: "tertiary", title: windowLabel(usage.tertiary?.windowMinutes) } : null,
  ].filter(Boolean);

  const rows = blocks
    .map(({ key, title }, idx) => {
      const u = usage[key];
      if (!u) return "";
      const used = Number(u.usedPercent);
      const usedText = Number.isFinite(used) ? `${formatPercent(used)}% ${t("used")}` : "—";
      const left = Number.isFinite(used) ? Math.max(0, 100 - used) : null;
      const leftText = left !== null ? `${formatPercent(left)}% ${t("left")}` : "—";
      const pillClass = getPillClass(used);
      const barClass = getThresholdClass(used);
      const fill = Number.isFinite(used) ? Math.min(100, Math.max(0, used)) : 0;
      const { resetMs, resetValue } = getResetCandidate(usage, u);
      const countdownId = `countdown-${providerId}-${key}`;

      return `
        <div>
          <div class="usageRow">
            <div class="usageLabel">${escapeHtml(title)}</div>
            <div class="usageValue">
              ${escapeHtml(usedText)} · <span class="pill ${pillClass}">${escapeHtml(leftText)}</span>
              ${resetMs !== null ? `<span class="countdown" id="${countdownId}">--:--</span>` : ""}
            </div>
          </div>
          <div class="bar">
            <div class="barFill ${barClass}" style="width:${fill}%"></div>
            <div class="barMarker" style="left:70%"></div>
            <div class="barMarker" style="left:80%"></div>
            <div class="barMarker" style="left:90%"></div>
          </div>
          ${resetValue !== null ? `<div class="k" style="margin-top:6px">${t("resets")}: ${formatIso(resetValue)}</div>` : ""}
        </div>
      `;
    })
    .join("");

  return `<div class="usageBlock">${rows}</div>`;
}

// Build cost section with token breakdown
function buildCostSection(cost) {
  if (!cost) return `<div class="k">${t("noCostData")}</div>`;

  const totals = cost.totals || {};
  const hasCache = totals.cacheReadTokens !== undefined || totals.cacheCreationTokens !== undefined;
  const todayRange = getTodayRange();
  const todayYmd = todayRange.today;
  const todayTotals = todayYmd ? getDailyTotalsForDate(cost, todayYmd) : { totalCost: 0, totalTokens: 0 };
  const todayRangeLine = todayRange.today && todayRange.tomorrow ? `${todayRange.today} 00:00 → ${todayRange.tomorrow} 00:00` : "";
  const yesterdayYmd = todayYmd ? addDaysToYmd(todayYmd, -1) : "";
  const yesterdayTotals = yesterdayYmd ? getDailyTotalsForDate(cost, yesterdayYmd) : { totalCost: 0, totalTokens: 0 };
  const yesterdayRangeLine = yesterdayYmd && todayYmd ? `${yesterdayYmd} 00:00 → ${todayYmd} 00:00` : "";

  let tokenBreakdown = "";
  if (totals.inputTokens !== undefined || totals.outputTokens !== undefined || hasCache) {
    tokenBreakdown = `
      <div class="tokenBreakdown">
        ${totals.inputTokens !== undefined ? `<div class="tokenRow"><span class="label">${t("input")}:</span><span>${formatNumber(totals.inputTokens)}</span></div>` : ""}
        ${totals.outputTokens !== undefined ? `<div class="tokenRow"><span class="label">${t("output")}:</span><span>${formatNumber(totals.outputTokens)}</span></div>` : ""}
        ${totals.cacheReadTokens !== undefined ? `<div class="tokenRow"><span class="label">${t("cacheRead")}:</span><span>${formatNumber(totals.cacheReadTokens)}</span></div>` : ""}
        ${totals.cacheCreationTokens !== undefined ? `<div class="tokenRow"><span class="label">${t("cacheCreate")}:</span><span>${formatNumber(totals.cacheCreationTokens)}</span></div>` : ""}
      </div>
    `;
  }

  // Comparison with previous period
  let comparisonHtml = "";
  if (compareMode && cost.daily && cost.daily.length >= 14) {
    const thisWeek = cost.daily.slice(-7).reduce((sum, d) => sum + (d.totalCost || 0), 0);
    const lastWeek = cost.daily.slice(-14, -7).reduce((sum, d) => sum + (d.totalCost || 0), 0);
    if (lastWeek > 0) {
      const change = ((thisWeek - lastWeek) / lastWeek) * 100;
      const cls = change > 0 ? "up" : change < 0 ? "down" : "neutral";
      const sign = change > 0 ? "+" : "";
      comparisonHtml = `<span class="comparison ${cls}">${sign}${change.toFixed(1)}% ${t("vsLastWeek")}</span>`;
    }
  }

  return `
    <div class="costBlock">
      <div>
        <div class="k">${escapeHtml(todayRange.label)}${todayRangeLine ? `<span class="todayRange">${escapeHtml(todayRangeLine)}</span>` : ""}</div>
        <div class="v">${escapeHtml(formatUsd(todayTotals.totalCost))} · ${escapeHtml(formatNumber(todayTotals.totalTokens))} ${t("tokens")}</div>
      </div>
      <div>
        <div class="k">${escapeHtml(todayRange.label)} · ${t("yesterday")}${yesterdayRangeLine ? `<span class="todayRange">${escapeHtml(yesterdayRangeLine)}</span>` : ""}</div>
        <div class="v">${escapeHtml(formatUsd(yesterdayTotals.totalCost))} · ${escapeHtml(formatNumber(yesterdayTotals.totalTokens))} ${t("tokens")}</div>
      </div>
      <div>
        <div class="k">${t("last30Days")} ${comparisonHtml}</div>
        <div class="v">${escapeHtml(formatUsd(cost.last30DaysCostUSD))} · ${escapeHtml(formatNumber(cost.last30DaysTokens))} ${t("tokens")}</div>
      </div>
    </div>
    ${tokenBreakdown}
  `;
}

// Build model breakdown
function buildModelBreakdown(cost) {
  if (!cost || !cost.daily || cost.daily.length === 0) return "";

  // Aggregate models across all days
  const modelTotals = {};
  for (const day of cost.daily) {
    if (!day.modelBreakdowns) continue;
    for (const mb of day.modelBreakdowns) {
      const name = mb.modelName || "unknown";
      modelTotals[name] = (modelTotals[name] || 0) + (mb.cost || 0);
    }
  }

  const models = Object.entries(modelTotals).sort((a, b) => b[1] - a[1]);
  if (models.length === 0) return "";

  const items = models.map(([name, cost]) => `
    <div class="modelItem">
      <span class="modelName">${escapeHtml(name)}</span>
      <span class="modelCost">${formatUsd(cost)}</span>
    </div>
  `).join("");

  return `
    <div class="modelBreakdown">
      <h4>${t("models")}</h4>
      <div class="modelList">${items}</div>
    </div>
  `;
}

// Build provider card
function buildProviderCard(providerUsage, idx) {
  const provider = providerUsage.provider || "provider";
  const profile = providerUsage.codexAuthAccount;
  const name = profile ? `${provider} (${profile})` : provider;
  const source = providerUsage.source || "—";
  const loginMethod = providerUsage.usage?.loginMethod || providerUsage.usage?.identity?.loginMethod || "—";
  const providerError = providerUsage.error?.message || null;
  const providerId = `provider-${idx}`;

  const isCodex = provider === "codex";
  const headRight = isCodex ? "" : `<span class="pill">${escapeHtml(source)}</span>`;
  const identityLines = [];
  if (!isCodex) {
    identityLines.push(`<div><div class="k">${t("login")}</div><div class="v">${escapeHtml(loginMethod)}</div></div>`);
  }

  const credits = providerUsage.credits?.remaining;
  const creditLine =
    !isCodex && typeof credits === "number"
      ? `<div><div class="k">${t("credits")}</div><div class="v">${escapeHtml(formatNumber(credits))}</div></div>`
      : "";

  const usageSection = buildUsageSection(providerUsage.usage, providerId);
  const errorSection = providerError ? `<div class="inlineError">${escapeHtml(providerError)}</div>` : "";
  const meta = `${identityLines.join("")}${creditLine}`;
  const metaSection = meta ? `<div class="kv">${meta}</div>` : "";

  return `
    <article class="card" data-provider-id="${providerId}">
      <div class="cardHeader">
        <div>
          <h2 class="providerName">${getProviderIcon(provider)}${escapeHtml(name)}</h2>
          ${metaSection}
        </div>
        <div>${headRight}</div>
      </div>
      ${errorSection}
      ${usageSection}
    </article>
  `;
}

function collectCodexAccounts(usageData) {
  const usage = Array.isArray(usageData) ? usageData : [];
  const accounts = new Set();
  for (const u of usage) {
    if (u?.provider !== "codex") continue;
    const a = String(u?.codexAuthAccount || "").trim();
    if (a) accounts.add(a);
  }
  return Array.from(accounts);
}

function sortCodexAccounts(accounts, activeAccount) {
  const active = String(activeAccount || "").trim();
  return [...accounts].sort((a, b) => {
    if (active && a === active) return -1;
    if (active && b === active) return 1;
    return a.localeCompare(b);
  });
}

function resolveCodexAccountView(view, usageData, activeAccount) {
  const accounts = collectCodexAccounts(usageData);
  const active = String(activeAccount || "").trim();
  const v = String(view || "").trim();

  if (accounts.length === 0) return "all";
  if (v === "all") return "all";
  if (v && accounts.includes(v)) return v;
  if (active && accounts.includes(active)) return active;
  return "all";
}

function updateCodexAccountQueryParam(view) {
  try {
    const v = String(view || "").trim();
    const url = new URL(window.location.href);
    if (v && v !== "all") url.searchParams.set("codex", v);
    else url.searchParams.delete("codex");
    history.replaceState(null, "", url);
  } catch {
    // ignore
  }
}

function applyCodexAccountView(usageData, activeAccount) {
  const accounts = collectCodexAccounts(usageData);
  const rawView = String(codexAccountView || "").trim();
  const explicit = rawView !== "";
  const valid = !explicit || rawView === "all" || accounts.includes(rawView);

  if (explicit && !valid) {
    codexAccountView = "";
    localStorage.removeItem(CODEX_ACCOUNT_VIEW_STORAGE_KEY);
    updateCodexAccountQueryParam("");
  }

  const effectiveView = resolveCodexAccountView(codexAccountView, usageData, activeAccount);

  // Usage card group
  const usageGroup = providersEl?.querySelector('[data-codex-group="usage"]');
  if (usageGroup) {
    const viewButtons = usageGroup.querySelectorAll("[data-codex-view]");
    viewButtons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.codexView === effectiveView);
    });

    const details = usageGroup.querySelectorAll(".codexAccountDetails");
    details.forEach(d => {
      const acc = d.dataset.codexAccount || "";
      d.open = effectiveView === "all" || (acc && acc === effectiveView);
    });

    const popout = usageGroup.querySelector("[data-codex-action=\"popout\"]");
    if (popout) {
      const disabled = effectiveView === "all";
      popout.disabled = disabled;
      popout.title = disabled ? "" : t("openInNewTab");
    }
  }

  // Heatmap group (if present)
  const heatmapGroup = heatmapEl?.querySelector('[data-codex-group="heatmap"]');
	  if (heatmapGroup) {
	    const viewButtons = heatmapGroup.querySelectorAll("[data-codex-view]");
	    viewButtons.forEach(btn => {
	      btn.classList.toggle("active", btn.dataset.codexView === effectiveView);
	    });

	    const combinedActive = Boolean(codexHeatmapCombined) && effectiveView === "all";

	    const combineBtn = heatmapGroup.querySelector('[data-codex-action="combine"]');
	    if (combineBtn) {
	      const disabled = effectiveView !== "all";
	      combineBtn.disabled = disabled;
	      combineBtn.classList.toggle("active", !disabled && combinedActive);
	      combineBtn.setAttribute("aria-pressed", !disabled && combinedActive ? "true" : "false");
	    }

	    const accountPanes = heatmapGroup.querySelectorAll("[data-codex-heatmap-account]");
	    accountPanes.forEach(pane => {
	      const acc = pane.dataset.codexHeatmapAccount || "";
	      if (effectiveView === "all") pane.hidden = combinedActive;
	      else pane.hidden = acc !== effectiveView;
	    });

	    const combinedPane = heatmapGroup.querySelector("[data-codex-heatmap-combined]");
	    if (combinedPane) combinedPane.hidden = !combinedActive;

	    const popout = heatmapGroup.querySelector("[data-codex-action=\"popout\"]");
	    if (popout) {
	      const disabled = effectiveView === "all";
	      popout.disabled = disabled;
      popout.title = disabled ? "" : t("openInNewTab");
    }
  }
}

function setCodexAccountView(nextView, usageData, activeAccount) {
  codexAccountView = String(nextView || "").trim();
  if (codexAccountView) localStorage.setItem(CODEX_ACCOUNT_VIEW_STORAGE_KEY, codexAccountView);
  else localStorage.removeItem(CODEX_ACCOUNT_VIEW_STORAGE_KEY);
  updateCodexAccountQueryParam(codexAccountView || "");
  applyCodexAccountView(usageData, activeAccount);
}

function setCodexHeatmapCombined(nextCombined, usageData, activeAccount) {
  codexHeatmapCombined = Boolean(nextCombined);
  if (codexHeatmapCombined) localStorage.setItem(CODEX_HEATMAP_COMBINED_STORAGE_KEY, "1");
  else localStorage.removeItem(CODEX_HEATMAP_COMBINED_STORAGE_KEY);
  applyCodexAccountView(usageData, activeAccount);
}

function buildCodexAccountDetails(providerUsage, idx, activeAccount) {
  const account = String(providerUsage?.codexAuthAccount || "").trim();
  const providerId = `provider-${idx}`;
  const isActive = account && String(activeAccount || "").trim() === account;
  const providerError = providerUsage?.error?.message || null;

  const sessionUsed = Number(providerUsage?.usage?.primary?.usedPercent);
  const weekUsed = Number(providerUsage?.usage?.secondary?.usedPercent);

  const sessionPill =
    Number.isFinite(sessionUsed)
      ? `<span class="pill ${getPillClass(sessionUsed)}">${escapeHtml(t("session"))}: ${escapeHtml(formatPercent(sessionUsed))}%</span>`
      : "";
  const weekPill =
    Number.isFinite(weekUsed)
      ? `<span class="pill ${getPillClass(weekUsed)}">${escapeHtml(t("week"))}: ${escapeHtml(formatPercent(weekUsed))}%</span>`
      : "";

  return `
    <details class="codexAccountDetails" data-codex-account="${escapeHtml(account)}">
      <summary class="codexAccountSummary">
        <div class="codexAccountSummaryLeft">
          <span class="codexAccountName">${escapeHtml(account || "codex")}</span>
          ${isActive ? `<span class="pill good">${escapeHtml(t("active"))}</span>` : ""}
        </div>
        <div class="codexAccountSummaryRight">
          ${sessionPill}
          ${weekPill}
        </div>
      </summary>
      ${providerError ? `<div class="inlineError">${escapeHtml(providerError)}</div>` : ""}
      ${buildUsageSection(providerUsage?.usage, providerId)}
    </details>
  `;
}

function buildCodexGroupCard(codexItemsWithIdx, usageData, activeAccount) {
  const accounts = sortCodexAccounts(collectCodexAccounts(usageData), activeAccount);
  const resolved = resolveCodexAccountView(codexAccountView, usageData, activeAccount);

  const active = String(activeAccount || "").trim();
  const metaPills = [
    active ? `<span class="pill good">${escapeHtml(t("active"))}: ${escapeHtml(active)}</span>` : "",
    `<span class="pill">${escapeHtml(String(accounts.length))} ${escapeHtml(t("accounts"))}</span>`,
  ].filter(Boolean).join("");

  const buttonsHtml = [
    `<button class="codexAccountBtn ${resolved === "all" ? "active" : ""}" data-codex-view="all">${escapeHtml(t("allAccounts"))}</button>`,
    ...accounts.map(a => {
      const isCurrent = active && a === active ? "codexAccountBtn--current" : "";
      const isSelected = resolved === a ? "active" : "";
      return `<button class="codexAccountBtn ${isCurrent} ${isSelected}" data-codex-view="${escapeHtml(a)}">${escapeHtml(a)}</button>`;
    }),
    `<button class="codexAccountBtn codexPopoutBtn" data-codex-action="popout" ${resolved === "all" ? "disabled" : ""} title="${escapeHtml(t("openInNewTab"))}">↗</button>`,
  ].join("");

  const detailsHtml = codexItemsWithIdx
    .map(({ item, idx }) => buildCodexAccountDetails(item, idx, activeAccount))
    .join("");

  return `
    <article class="card codexGroupCard" data-codex-group="usage">
      <div class="cardHeader codexGroupHeader">
        <div>
          <h2 class="providerName">${getProviderIcon("codex")}codex</h2>
        </div>
        <div class="codexGroupMeta">${metaPills}</div>
      </div>
      <div class="codexAccountsBar" role="group" aria-label="${escapeHtml(t("accounts"))}">
        ${buttonsHtml}
      </div>
      <div class="codexAccountsList">
        ${detailsHtml}
      </div>
    </article>
  `;
}

function buildCodexHeatmapCard(codexEntries, usageData, activeAccount, historyArray, tzLabel) {
  const keyByAccount = new Map();
  for (const entry of codexEntries) {
    const account = String(entry?.info?.account || "").trim();
    if (account) keyByAccount.set(account, entry.key);
  }

  const accounts = sortCodexAccounts(collectCodexAccounts(usageData), activeAccount).filter(a => keyByAccount.has(a));
  const resolved = resolveCodexAccountView(codexAccountView, usageData, activeAccount);
  const titleSuffix = resolved && resolved !== "all" ? ` (${escapeHtml(resolved)})` : "";
  const active = String(activeAccount || "").trim();
  const combinedActive = resolved === "all" && codexHeatmapCombined;

  const lookupByAccount = new Map();
  for (const a of accounts) {
    const key = keyByAccount.get(a);
    if (!key) continue;
    lookupByAccount.set(a, computeHeatmapLookup(historyArray, key));
  }
  const combinedLookup = mergeHeatmapLookups(Array.from(lookupByAccount.values()));

  const buttonsHtml = [
    `<button class="codexAccountBtn ${resolved === "all" ? "active" : ""}" data-codex-view="all">${escapeHtml(t("allAccounts"))}</button>`,
    `<button class="codexAccountBtn ${combinedActive ? "active" : ""}" data-codex-action="combine" ${resolved === "all" ? "" : "disabled"} aria-pressed="${combinedActive ? "true" : "false"}">Σ ${escapeHtml(t("combined"))}</button>`,
    ...accounts.map(a => {
      const isCurrent = active && a === active ? "codexAccountBtn--current" : "";
      const isSelected = resolved === a ? "active" : "";
      return `<button class="codexAccountBtn ${isCurrent} ${isSelected}" data-codex-view="${escapeHtml(a)}">${escapeHtml(a)}</button>`;
    }),
    `<button class="codexAccountBtn codexPopoutBtn" data-codex-action="popout" ${resolved === "all" ? "disabled" : ""} title="${escapeHtml(t("openInNewTab"))}">↗</button>`,
  ].join("");

  const combinedPaneHtml = `
    <div class="codexHeatmapPane" data-codex-heatmap-combined${combinedActive ? "" : " hidden"}>
      <div class="codexHeatmapPaneHeader">
        <div class="k">${escapeHtml(t("combined"))}</div>
        <span class="pill">${escapeHtml(String(accounts.length))} ${escapeHtml(t("accounts"))}</span>
      </div>
      ${buildHeatmapFromLookup(combinedLookup)}
    </div>
  `;

  const panesHtml = accounts.map(a => {
    const hidden = resolved === "all" ? combinedActive : resolved !== a;
    const hiddenAttr = hidden ? " hidden" : "";
    const isActive = active && a === active;
    const lookup = lookupByAccount.get(a) || {};
    return `
      <div class="codexHeatmapPane" data-codex-heatmap-account="${escapeHtml(a)}"${hiddenAttr}>
        <div class="codexHeatmapPaneHeader">
          <div class="k">${escapeHtml(a)}</div>
          ${isActive ? `<span class="pill good">${escapeHtml(t("active"))}</span>` : ""}
        </div>
        ${buildHeatmapFromLookup(lookup)}
      </div>
    `;
  }).join("");

  return `
    <div class="card heatmapCard codexHeatmapCard" data-codex-group="heatmap">
      <h3 class="heatmapTitle">${getProviderIcon("codex")}codex${titleSuffix} <span class="tzIndicator" style="font-size:0.7em;opacity:0.6;margin-left:8px;">${tzLabel}</span></h3>
      <div class="codexAccountsBar" role="group" aria-label="${escapeHtml(t("accounts"))}">
        ${buttonsHtml}
      </div>
      <div class="codexHeatmapPanes">
        ${combinedPaneHtml}
        ${panesHtml}
      </div>
    </div>
  `;
}

// Build cost card
function buildCostCard(cost) {
  const name = cost.provider || "provider";
  const source = cost.source || "—";
  const updatedAt = cost.updatedAt ? `${t("updated")}: ${formatIso(cost.updatedAt)}` : null;

  return `
    <article class="card">
      <div class="cardHeader">
        <div>
          <h2 class="providerName">${getProviderIcon(name)}${escapeHtml(name)}</h2>
          <div class="kv"><div><div class="k">${t("source")}</div><div class="v">${escapeHtml(source)}</div></div></div>
        </div>
        <div></div>
      </div>
      ${buildCostSection(cost)}
      ${buildModelBreakdown(cost)}
      ${updatedAt ? `<div class="k" style="margin-top:12px">${escapeHtml(updatedAt)}</div>` : ""}
    </article>
  `;
}

// Stats summary
function buildStatsSummary(data) {
  const usage = Array.isArray(data.usage) ? data.usage : [];
  const cost = getCostForCurrentView(data);
  const todayRange = getTodayRange();
  const tzLabel = todayRange.label;
  const todayRangeText = getTodayRangeText();
  const todayYmd = todayRange.today;
  const todayRangeLine = todayRange.today && todayRange.tomorrow ? `${todayRange.today} 00:00 → ${todayRange.tomorrow} 00:00` : "";
  const yesterdayYmd = todayYmd ? addDaysToYmd(todayYmd, -1) : "";
  const yesterdayRangeText = yesterdayYmd && todayYmd ? `${tzLabel}: ${yesterdayYmd} 00:00 → ${todayYmd} 00:00` : tzLabel;

  let totalCost30 = 0;
  let totalTokens30 = 0;
  let todayCost = 0;
  let yesterdayCost = 0;

  for (const c of cost) {
    totalCost30 += c.last30DaysCostUSD || 0;
    totalTokens30 += c.last30DaysTokens || 0;
    if (todayYmd) todayCost += getDailyTotalsForDate(c, todayYmd).totalCost;
    if (yesterdayYmd) yesterdayCost += getDailyTotalsForDate(c, yesterdayYmd).totalCost;
  }

  const avgDaily = totalCost30 / 30;

  return `
    <div class="statBox" title="${escapeHtml(todayRangeText)}">
      <div class="label">${escapeHtml(tzLabel)}</div>
      <div class="value">${formatUsd(todayCost)}</div>
      ${todayRangeLine ? `<div class="subtext">${escapeHtml(todayRangeLine)}</div>` : ""}
    </div>
    <div class="statBox" title="${escapeHtml(yesterdayRangeText)}">
      <div class="label">${t("yesterday")} (${escapeHtml(tzLabel)})</div>
      <div class="value">${formatUsd(yesterdayCost)}</div>
    </div>
    <div class="statBox">
      <div class="label">${t("last30Days")}</div>
      <div class="value">${formatUsd(totalCost30)}</div>
      <div class="subtext">${t("avgDaily")}: ${formatUsd(avgDaily)}</div>
    </div>
    <div class="statBox">
      <div class="label">${t("totalTokens")}</div>
      <div class="value">${formatNumber(totalTokens30)}</div>
    </div>
  `;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function downloadTextFile(filename, text, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getAllCostDates(costData) {
  const allDates = new Set();
  for (const cost of costData) {
    const daily = cost?.daily;
    if (!Array.isArray(daily)) continue;
    for (const d of daily) {
      if (d?.date) allDates.add(d.date);
    }
  }
  return Array.from(allDates).sort();
}

function getDefaultTrendRange(dates) {
  if (!Array.isArray(dates) || dates.length === 0) return { start: "", end: "" };
  const end = dates[dates.length - 1];
  const start = dates[Math.max(0, dates.length - 30)];
  return { start, end };
}

function normalizeTrendRange(costData) {
  const dates = getAllCostDates(costData);
  const min = dates[0] || "";
  const max = dates[dates.length - 1] || "";
  const defaultRange = getDefaultTrendRange(dates);

  if (!min || !max) {
    return { dates, start: "", end: "", defaultRange };
  }

  const hasStart = Boolean(trendStartDate);
  const hasEnd = Boolean(trendEndDate);

  let start;
  let end;
  if (!hasStart && !hasEnd) {
    start = defaultRange.start;
    end = defaultRange.end;
  } else {
    start = hasStart ? trendStartDate : min;
    end = hasEnd ? trendEndDate : max;
  }

  start = start < min ? min : start > max ? max : start;
  end = end < min ? min : end > max ? max : end;

  if (start > end) [start, end] = [end, start];

  return { dates, start, end, defaultRange };
}

function filterCostDataByTrendRange(costData, startDate, endDate) {
  const start = startDate || "0000-00-00";
  const end = endDate || "9999-99-99";

  return costData
    .map(cost => {
      const daily = cost?.daily;
      if (!Array.isArray(daily)) return null;
      const filteredDaily = daily.filter(d => d?.date && d.date >= start && d.date <= end);
      if (filteredDaily.length === 0) return null;
      return { ...cost, daily: filteredDaily };
    })
    .filter(Boolean);
}

function updateCostTrendRangeLabel(costData) {
  if (!costTrendRangeLabelEl) return;

  const { dates, start, end, defaultRange } = normalizeTrendRange(costData);
  if (dates.length === 0) {
    costTrendRangeLabelEl.textContent = "";
    costTrendRangeLabelEl.classList.remove("clickable");
    costTrendRangeLabelEl.removeAttribute("title");
    return;
  }

  const tzLabel = getTimeZoneInfo().label;
  const isDefault = start === defaultRange.start && end === defaultRange.end;
  costTrendRangeLabelEl.textContent = isDefault
    ? `(${t("range30Days")} · ${tzLabel})`
    : `(${start} → ${end} · ${tzLabel})`;

  costTrendRangeLabelEl.classList.toggle("clickable", !isDefault);
  if (!isDefault) {
    costTrendRangeLabelEl.title =
      currentLang === "ru" ? "Клик: сбросить диапазон к последним 30 дням" : "Click to reset range to latest 30 days";
  } else {
    costTrendRangeLabelEl.removeAttribute("title");
  }
}

function clearCostChart() {
  if (!chartCanvas) return;
  const ctx = chartCanvas.getContext("2d");
  if (!ctx) return;
  const rect = chartCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  chartCanvas.width = rect.width * dpr;
  chartCanvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (chartLegend) chartLegend.innerHTML = "";
}

function renderCostTrend(costData, { syncInputs = true } = {}) {
  const cost = Array.isArray(costData) ? costData : [];
  const { dates, start, end } = normalizeTrendRange(cost);

  if (syncInputs) {
    const disabled = dates.length === 0;
    const min = dates[0] || "";
    const max = dates[dates.length - 1] || "";

    if (trendStartEl) {
      trendStartEl.disabled = disabled;
      trendStartEl.min = min;
      trendStartEl.max = max;
      trendStartEl.value = start || "";
    }
    if (trendEndEl) {
      trendEndEl.disabled = disabled;
      trendEndEl.min = min;
      trendEndEl.max = max;
      trendEndEl.value = end || "";
    }
    if (trendResetBtn) trendResetBtn.disabled = disabled;
    if (exportCsvBtn) exportCsvBtn.disabled = disabled;
  }

  if (dates.length === 0) {
    clearCostChart();
    if (costTrendRangeLabelEl) costTrendRangeLabelEl.textContent = "";
    return { start: "", end: "", dates: [] };
  }

  // Persist range only when user explicitly pinned it.
  if (trendPinned) {
    if (trendStartDate !== start || trendEndDate !== end) {
      trendStartDate = start;
      trendEndDate = end;
    }

    if (trendStartDate) localStorage.setItem("codexbar-trend-start", trendStartDate);
    else localStorage.removeItem("codexbar-trend-start");

    if (trendEndDate) localStorage.setItem("codexbar-trend-end", trendEndDate);
    else localStorage.removeItem("codexbar-trend-end");
  }

  updateCostTrendRangeLabel(cost);

  const filtered = filterCostDataByTrendRange(cost, start, end);
  if (filtered.length === 0) {
    clearCostChart();
    return { start, end, dates };
  }

  drawCostChart(filtered);
  return { start, end, dates };
}

function exportCostTrendCsv(costData) {
  const cost = Array.isArray(costData) ? costData : [];
  const { dates, start, end } = normalizeTrendRange(cost);
  if (dates.length === 0) return;

  const rows = [
    [
      "date",
      "provider",
      "source",
      "totalCostUSD",
      "totalTokens",
      "inputTokens",
      "outputTokens",
      "modelsUsed",
      "modelBreakdowns",
    ],
  ];

  const filteredCost = filterCostDataByTrendRange(cost, start, end);
  for (const c of filteredCost) {
    for (const d of c.daily || []) {
      const modelsUsed = Array.isArray(d.modelsUsed) ? d.modelsUsed.join("|") : "";
      const modelBreakdowns = Array.isArray(d.modelBreakdowns) ? JSON.stringify(d.modelBreakdowns) : "";
      rows.push([
        d.date || "",
        c.provider || "",
        c.source || "",
        d.totalCost ?? "",
        d.totalTokens ?? "",
        d.inputTokens ?? "",
        d.outputTokens ?? "",
        modelsUsed,
        modelBreakdowns,
      ]);
    }
  }

  const csv = "\uFEFF" + rows.map(r => r.map(csvEscape).join(",")).join("\r\n");
  const filename = `codexbar-cost-trend_${start}_to_${end}.csv`;
  downloadTextFile(filename, csv);
}

// Cost chart
function drawCostChart(costData) {
  if (!chartCanvas) return;

  const ctx = chartCanvas.getContext("2d");
  const rect = chartCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  chartCanvas.width = rect.width * dpr;
  chartCanvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const padding = { top: 20, right: 20, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Collect all daily data by provider
  const providerColors = {
    codex: "rgba(56, 217, 150, 0.8)",
    claude: "rgba(204, 120, 92, 0.8)",
    gemini: "rgba(66, 133, 244, 0.8)",
    minimax: "rgba(155, 92, 255, 0.8)"
  };

  const providers = [];
  const allDates = new Set();

  for (const cost of costData) {
    if (!cost.daily) continue;
    const providerName = cost.provider || "unknown";
    const dailyMap = {};
    for (const d of cost.daily) {
      allDates.add(d.date);
      dailyMap[d.date] = d.totalCost || 0;
    }
    providers.push({ name: providerName, dailyMap, color: providerColors[providerName] || "rgba(150, 150, 150, 0.8)" });
  }

  const dates = Array.from(allDates).sort();
  if (dates.length === 0) {
    ctx.clearRect(0, 0, width, height);
    if (chartLegend) chartLegend.innerHTML = "";
    return;
  }

  // Find max value for scaling
  let maxValue = 0;
  for (const date of dates) {
    let total = 0;
    for (const p of providers) {
      total += p.dailyMap[date] || 0;
    }
    maxValue = Math.max(maxValue, total);
  }
  maxValue = Math.ceil(maxValue * 1.1); // Add 10% headroom

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // Draw grid lines
  const isDark = currentTheme === "dark";
  ctx.strokeStyle = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  ctx.lineWidth = 1;

  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const y = padding.top + (chartHeight / ySteps) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();

    // Y-axis labels
    const value = maxValue - (maxValue / ySteps) * i;
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
    ctx.font = "10px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(`$${value.toFixed(0)}`, padding.left - 8, y + 3);
  }

  // Draw bars
  const barWidth = Math.max(4, (chartWidth / dates.length) - 2);
  const barGap = (chartWidth - barWidth * dates.length) / (dates.length + 1);

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const x = padding.left + barGap + i * (barWidth + barGap);

    let yOffset = 0;
    for (const p of providers) {
      const value = p.dailyMap[date] || 0;
      const barHeight = (value / maxValue) * chartHeight;

      ctx.fillStyle = p.color;
      ctx.fillRect(x, padding.top + chartHeight - yOffset - barHeight, barWidth, barHeight);

      yOffset += barHeight;
    }

    // X-axis labels (show every few dates)
    if (i % Math.ceil(dates.length / 8) === 0 || i === dates.length - 1) {
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
      ctx.font = "9px system-ui";
      ctx.textAlign = "center";
      const label = date.slice(5); // MM-DD
      ctx.fillText(label, x + barWidth / 2, height - 8);
    }
  }

  // Legend
  let legendHtml = "";
  for (const p of providers) {
    legendHtml += `<div class="legendItem"><div class="legendColor" style="background:${p.color}"></div>${p.name}</div>`;
  }
  chartLegend.innerHTML = legendHtml;
}

// Heatmap
function getIntensityClass(pct) {
  if (pct === null || pct === undefined) return "intensity-0";
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return "intensity-0";
  if (n < 20) return "intensity-1";
  if (n < 40) return "intensity-2";
  if (n < 60) return "intensity-3";
  if (n < 80) return "intensity-4";
  return "intensity-5";
}

function getLastNDays(n) {
  const days = [];
  const now = new Date();

  const timezone = getTimeZoneInfo().timeZone;

  // Use Intl.DateTimeFormat for reliable timezone conversion (en-CA gives YYYY-MM-DD order)
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const parts = formatter.formatToParts(d);
    const getPart = (type) => parts.find(p => p.type === type)?.value || "";
    const year = getPart("year");
    const month = getPart("month");
    const dayNum = getPart("day");
    days.push(`${year}-${month}-${dayNum}`);
  }
  return days;
}

function getLast7Days() {
  return getLastNDays(7);
}

// Convert UTC timestamp to timezone-aware hour and day
function getTimezoneAwareHourDay(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;

  const timezone = getTimeZoneInfo().timeZone;

  // Use Intl.DateTimeFormat for reliable timezone conversion
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const getPart = (type) => parts.find(p => p.type === type)?.value || "";

  const year = getPart("year");
  const month = getPart("month");
  const dayNum = getPart("day");
  const hourStr = getPart("hour");

  // Handle hour "24" edge case (some locales use 24 for midnight)
  let hour = parseInt(hourStr, 10);
  if (hour === 24) hour = 0;

  const day = `${year}-${month}-${dayNum}`;

  return { hour, day };
}

function buildHeatmapForProvider(history, providerKey) {
  return buildHeatmapFromLookup(computeHeatmapLookup(history, providerKey));
}

function computeHeatmapLookup(history, providerKey) {
  const historyArray = Array.isArray(history) ? history : [];
  const key = String(providerKey || "");

  // Filter and sort entries for this provider by timestamp
  const providerEntries = historyArray
    .filter(entry => `${entry.provider}|${entry.account || ""}` === key)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));

  const lookup = {};
  let prevActivity = null;

  for (const entry of providerEntries) {
    // Convert UTC timestamp to language-specific timezone
    const converted = getTimezoneAwareHourDay(entry.ts);

    // If conversion fails, skip this entry (don't use stored values which are in wrong timezone)
    if (!converted) {
      console.warn(`[Heatmap] Skipping entry - failed to convert ts: ${entry.ts}`);
      continue;
    }

    const day = converted.day;
    const hour = converted.hour;
    const currentActivity = entry.activity ?? entry.sessionPct ?? 0;

    // Calculate delta from previous reading - only count actual changes as activity
    // A change in usage percentage indicates real activity occurred
    let delta = 0;
    if (prevActivity !== null) {
      delta = Math.abs(currentActivity - prevActivity);
    }
    prevActivity = currentActivity;

    // Only record activity when there's an actual change in usage
    if (delta > 0) {
      if (!lookup[day]) lookup[day] = {};
      lookup[day][hour] = (lookup[day][hour] || 0) + delta;
    }
  }

  return lookup;
}

function mergeHeatmapLookups(lookups) {
  const combined = {};
  const list = Array.isArray(lookups) ? lookups : [];
  for (const lookup of list) {
    if (!lookup || typeof lookup !== "object") continue;
    for (const [day, hours] of Object.entries(lookup)) {
      if (!hours || typeof hours !== "object") continue;
      if (!combined[day]) combined[day] = {};
      for (const [hour, value] of Object.entries(hours)) {
        const v = Number(value) || 0;
        if (v <= 0) continue;
        combined[day][hour] = (combined[day][hour] || 0) + v;
      }
    }
  }
  return combined;
}

function buildHeatmapFromLookup(lookup) {
  const days = getLast7Days();
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Wrap grid in scrollable container for mobile
  let html = `<div class="heatmapScrollHint">← Swipe to scroll →</div>`;
  html += `<div class="heatmapScrollContainer">`;
  html += `<div class="heatmapGrid">`;

  // Header row with hours
  html += `<div class="heatmapRow heatmapHeader">`;
  html += `<div class="heatmapLabel"></div>`;
  for (const h of hours) {
    html += `<div class="heatmapHour">${h}</div>`;
  }
  html += `<div class="heatmapRowTotal"></div>`;
  html += `</div>`;

  // Data rows - RU: Minsk, EN: New York
  for (const day of days) {
    const dateOpts = { timeZone: getTimeZoneInfo().timeZone, weekday: "short", month: "short", day: "numeric" };
    const shortDay = new Date(day + "T12:00:00Z").toLocaleDateString(currentLang === "ru" ? "ru-RU" : "en-US", dateOpts);

    html += `<div class="heatmapRow">`;
    html += `<div class="heatmapLabel">${escapeHtml(shortDay)}</div>`;
    for (const h of hours) {
      const activity = lookup?.[day]?.[h] ?? null;
      const cls = getIntensityClass(activity);
      const titleText = activity !== null && activity > 0 ? t("activity") : t("noActivity");
      html += `<div class="heatmapCell ${cls}" data-day="${day}" data-hour="${h}" data-activity="${activity || 0}" title="${escapeHtml(day)} ${h}:00 - ${escapeHtml(titleText)}"></div>`;
    }
    html += `<div class="heatmapRowTotal"></div>`;
    html += `</div>`;
  }

  html += `</div>`; // Close heatmapGrid
  html += `</div>`; // Close heatmapScrollContainer

  // Legend (outside scroll container)
  html += `<div class="heatmapLegend">`;
  html += `<span class="heatmapLegendLabel">${t("less")}</span>`;
  html += `<div class="heatmapCell intensity-0"></div>`;
  html += `<div class="heatmapCell intensity-1"></div>`;
  html += `<div class="heatmapCell intensity-2"></div>`;
  html += `<div class="heatmapCell intensity-3"></div>`;
  html += `<div class="heatmapCell intensity-4"></div>`;
  html += `<div class="heatmapCell intensity-5"></div>`;
  html += `<span class="heatmapLegendLabel">${t("more")}</span>`;
  html += `</div>`;

  return html;
}

function renderHeatmap(history, usageData) {
  if (!heatmapEl) return;

  const providers = new Map();
  if (Array.isArray(usageData)) {
    for (const item of usageData) {
      const provider = item.provider || "unknown";
      const account = item.codexAuthAccount || "";
      const key = `${provider}|${account}`;
      if (!providers.has(key)) {
        providers.set(key, {
          provider,
          account,
          label: account ? `${provider} (${account})` : provider,
        });
      }
    }
  }

  if (providers.size === 0) {
    heatmapEl.innerHTML = `<div class="card"><div class="k">${t("noProviders")}</div></div>`;
    return;
  }

  const historyArray = Array.isArray(history) ? history : [];

  // Show day/timezone indicator for the current view (not strictly tied to language).
  const tzLabel = getTimeZoneInfo().label;
  const activeCodexAccount = cachedData?.currentCodexAccount || "";

  const entries = Array.from(providers.entries()).map(([key, info]) => ({ key, info }));
  const codexEntries = entries.filter(e => e?.info?.provider === "codex");
  const otherEntries = entries.filter(e => e?.info?.provider !== "codex");

  let html = "";
  if (codexEntries.length > 1) {
    html += buildCodexHeatmapCard(codexEntries, usageData, activeCodexAccount, historyArray, tzLabel);
  } else if (codexEntries.length === 1) {
    const entry = codexEntries[0];
    html += `<div class="card heatmapCard">`;
    html += `<h3 class="heatmapTitle">${getProviderIcon(entry.info.provider)}${escapeHtml(entry.info.label)} <span class="tzIndicator" style="font-size:0.7em;opacity:0.6;margin-left:8px;">${tzLabel}</span></h3>`;
    html += buildHeatmapForProvider(historyArray, entry.key);
    html += `</div>`;
  }

  for (const entry of otherEntries) {
    html += `<div class="card heatmapCard">`;
    html += `<h3 class="heatmapTitle">${getProviderIcon(entry.info.provider)}${escapeHtml(entry.info.label)} <span class="tzIndicator" style="font-size:0.7em;opacity:0.6;margin-left:8px;">${tzLabel}</span></h3>`;
    html += buildHeatmapForProvider(historyArray, entry.key);
    html += `</div>`;
  }

  heatmapEl.innerHTML = html;

  // Add click handlers for heatmap cells
  heatmapEl.querySelectorAll(".heatmapCell").forEach(cell => {
    cell.addEventListener("click", () => {
      const day = cell.dataset.day;
      const hour = cell.dataset.hour;
      const activity = cell.dataset.activity;

      document.querySelectorAll(".heatmapCell.selected").forEach(c => c.classList.remove("selected"));
      cell.classList.add("selected");

      if (heatmapDetailEl) {
        heatmapDetailEl.hidden = false;
        heatmapDetailEl.innerHTML = `
          <h4>${day} at ${hour}:00</h4>
          <div class="heatmapDetailContent">
            ${Number(activity) > 0 ? t("activity") : t("noActivity")}
          </div>
        `;
      }
    });
  });

  const codexGroup = heatmapEl.querySelector('[data-codex-group="heatmap"]');
	  if (codexGroup) {
	    codexGroup.querySelectorAll("[data-codex-view]").forEach(btn => {
	      btn.addEventListener("click", () => {
	        const view = btn.dataset.codexView || "";
	        setCodexAccountView(view, usageData, activeCodexAccount);
	      });
	    });

	    const combineBtn = codexGroup.querySelector('[data-codex-action="combine"]');
	    if (combineBtn) {
	      combineBtn.addEventListener("click", () => {
	        if (combineBtn.disabled) return;
	        setCodexHeatmapCombined(!codexHeatmapCombined, usageData, activeCodexAccount);
	      });
	    }

	    const popout = codexGroup.querySelector("[data-codex-action=\"popout\"]");
	    if (popout) {
	      popout.addEventListener("click", () => {
	        const resolved = resolveCodexAccountView(codexAccountView, usageData, activeCodexAccount);
	        if (!resolved || resolved === "all") return;
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("codex", resolved);
          window.open(url.toString(), "_blank", "noopener");
        } catch {
          window.open(`?codex=${encodeURIComponent(resolved)}`, "_blank", "noopener");
        }
      });
    }

    applyCodexAccountView(usageData, activeCodexAccount);
  }
}

function buildProviderModelIndex(costData, startDate, endDate) {
  const start = startDate || "0000-00-00";
  const end = endDate || "9999-99-99";
  const index = new Map();

  for (const c of costData) {
    const provider = c?.provider || "unknown";
    const daily = c?.daily;
    if (!Array.isArray(daily)) continue;

    for (const d of daily) {
      if (!d?.date || d.date < start || d.date > end) continue;
      const set = index.get(provider) || new Set();

      if (Array.isArray(d.modelsUsed)) {
        d.modelsUsed.forEach(m => {
          if (m) set.add(m);
        });
      }
      if (Array.isArray(d.modelBreakdowns)) {
        d.modelBreakdowns.forEach(mb => {
          if (mb?.modelName) set.add(mb.modelName);
        });
      }

      index.set(provider, set);
    }
  }

  return index;
}

function collectModelsFromCost(costData, startDate, endDate) {
  const start = startDate || "0000-00-00";
  const end = endDate || "9999-99-99";
  const models = new Set();

  for (const c of costData) {
    const daily = c?.daily;
    if (!Array.isArray(daily)) continue;
    for (const d of daily) {
      if (!d?.date || d.date < start || d.date > end) continue;
      if (Array.isArray(d.modelsUsed)) d.modelsUsed.forEach(m => m && models.add(m));
      if (Array.isArray(d.modelBreakdowns)) d.modelBreakdowns.forEach(mb => mb?.modelName && models.add(mb.modelName));
    }
  }

  return Array.from(models).sort((a, b) => a.localeCompare(b));
}

function updateModelFilterOptions(costData, trendRange) {
  if (!modelFilterEl) return;

  const cost = Array.isArray(costData) ? costData : [];
  const range = trendRange?.start && trendRange?.end ? trendRange : normalizeTrendRange(cost);
  const models = collectModelsFromCost(cost, range.start, range.end);
  const prev = modelFilterEl.value || currentModelFilter;

  modelFilterEl.innerHTML = "";

  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = t("allModels");
  modelFilterEl.appendChild(allOpt);

  for (const m of models) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    modelFilterEl.appendChild(opt);
  }

  const nextValue = prev && (prev === "all" || models.includes(prev)) ? prev : "all";
  modelFilterEl.value = nextValue;
  modelFilterEl.disabled = models.length === 0;

  if (nextValue !== currentModelFilter) {
    currentModelFilter = nextValue;
    localStorage.setItem("codexbar-model-filter", currentModelFilter);
  }
}

function startUsageCountdowns(sortedUsage) {
  clearCountdowns();
  setTimeout(() => {
    sortedUsage.forEach((u, idx) => {
      const providerId = `provider-${idx}`;
      ["primary", "secondary", "tertiary"].forEach(key => {
        const { resetMs } = getResetCandidate(u.usage, u.usage?.[key]);
        if (resetMs !== null) startCountdown(`countdown-${providerId}-${key}`, resetMs);
      });
    });
  }, 0);
}

function renderUsageProviders(usageData, costData, trendRange) {
  const usage = Array.isArray(usageData) ? usageData : [];
  const cost = Array.isArray(costData) ? costData : [];
  const range = trendRange?.start && trendRange?.end ? trendRange : normalizeTrendRange(cost);
  const modelIndex = buildProviderModelIndex(cost, range.start, range.end);
  const activeCodexAccount = cachedData?.currentCodexAccount || "";

  const filteredUsage =
    currentModelFilter === "all"
      ? usage
      : usage.filter(u => modelIndex.get(u?.provider || "unknown")?.has(currentModelFilter));

  const sortedUsage = sortUsage(filteredUsage, currentSort);
  const withIdx = sortedUsage.map((item, idx) => ({ item, idx }));
  const codexItems = withIdx.filter(x => x?.item?.provider === "codex");
  const otherItems = withIdx.filter(x => x?.item?.provider !== "codex");

  const parts = [];
  if (codexItems.length > 1) {
    parts.push(buildCodexGroupCard(codexItems, sortedUsage, activeCodexAccount));
  } else if (codexItems.length === 1) {
    parts.push(buildProviderCard(codexItems[0].item, codexItems[0].idx));
  }
  for (const x of otherItems) parts.push(buildProviderCard(x.item, x.idx));

  providersEl.innerHTML = parts.length > 0 ? parts.join("") : `<div class="card"><div class="k">${t("noProviders")}</div></div>`;

  startUsageCountdowns(sortedUsage);

  const codexGroup = providersEl.querySelector('[data-codex-group="usage"]');
  if (codexGroup) {
    codexGroup.querySelectorAll("[data-codex-view]").forEach(btn => {
      btn.addEventListener("click", () => {
        const view = btn.dataset.codexView || "";
        setCodexAccountView(view, sortedUsage, activeCodexAccount);
      });
    });

    const popout = codexGroup.querySelector("[data-codex-action=\"popout\"]");
    if (popout) {
      popout.addEventListener("click", () => {
        const resolved = resolveCodexAccountView(codexAccountView, sortedUsage, activeCodexAccount);
        if (!resolved || resolved === "all") return;
        try {
          const url = new URL(window.location.href);
          url.searchParams.set("codex", resolved);
          window.open(url.toString(), "_blank", "noopener");
        } catch {
          window.open(`?codex=${encodeURIComponent(resolved)}`, "_blank", "noopener");
        }
      });
    }

    applyCodexAccountView(sortedUsage, activeCodexAccount);
  }
}

// Sorting
function sortUsage(usage, sortBy) {
  return [...usage].sort((a, b) => {
    // Always show codex accounts first
    const aIsCodex = a?.provider === "codex" ? 0 : 1;
    const bIsCodex = b?.provider === "codex" ? 0 : 1;
    if (aIsCodex !== bIsCodex) return aIsCodex - bIsCodex;

    if (sortBy === "reset") {
      const aWeekly = soonestResetMs(a?.usage, 10080);
      const bWeekly = soonestResetMs(b?.usage, 10080);
      const aKey = aWeekly === null ? Number.POSITIVE_INFINITY : aWeekly;
      const bKey = bWeekly === null ? Number.POSITIVE_INFINITY : bWeekly;
      if (aKey !== bKey) return aKey - bKey;
    } else if (sortBy === "usage") {
      const aUsed = a?.usage?.secondary?.usedPercent ?? 0;
      const bUsed = b?.usage?.secondary?.usedPercent ?? 0;
      if (aUsed !== bUsed) return bUsed - aUsed; // High to low
    }
    // Fall through to name sort
    const providerCmp = String(a?.provider || "").localeCompare(String(b?.provider || ""));
    if (providerCmp !== 0) return providerCmp;
    return String(a?.codexAuthAccount || "").localeCompare(String(b?.codexAuthAccount || ""));
  });
}

// Render
function render(data) {
  const updatedAt = data.generatedAt ? `${t("updated")}: ${formatIso(data.generatedAt)}` : `${t("updated")}: —`;
  updatedAtEl.textContent = updatedAt;
  relativeTimeEl.textContent = formatRelativeTime(data.generatedAt);
  hostEl.textContent = data.hostname ? `${t("host")}: ${data.hostname}` : "";
  currentAccountEl.textContent = data.currentCodexAccount ? `${t("active")}: codex (${data.currentCodexAccount})` : "";

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    errorsEl.hidden = false;
    errorsEl.innerHTML = `
      <h2>${t("errors")}</h2>
      <pre>${escapeHtml(JSON.stringify(data.errors, null, 2))}</pre>
    `;
  } else {
    errorsEl.hidden = true;
    errorsEl.textContent = "";
  }

  // Stats summary
  statsSummaryEl.innerHTML = buildStatsSummary(data);

  const usage = Array.isArray(data.usage) ? data.usage : [];
  const cost = getCostForCurrentView(data);

  const trendRange = renderCostTrend(cost);
  updateModelFilterOptions(cost, trendRange);
  renderUsageProviders(usage, cost, trendRange);

  costEl.innerHTML = cost.length > 0 ? cost.map(c => buildCostCard(c)).join("") : `<div class="card"><div class="k">${t("noCostData")}</div></div>`;

  rawJsonEl.textContent = JSON.stringify(data, null, 2);
}

async function fetchHistory() {
  try {
    const [res, kimiRes] = await Promise.all([
      fetch(`${HISTORY_URL}?t=${Date.now()}`, { cache: "no-store" }),
      fetch(`${KIMI_HISTORY_URL}?t=${Date.now()}`, { cache: "no-store" }),
    ]);
    let history = [];
    if (res.ok) {
      history = await res.json();
    }
    // Merge KIMI history entries
    if (kimiRes.ok) {
      const kimiHistory = await kimiRes.json();
      if (Array.isArray(kimiHistory)) {
        // Convert KIMI history entries to standard format for heatmap
        const kimiEntries = kimiHistory.map(entry => ({
          provider: "kimi",
          account: entry.account || "",
          ts: entry.ts || entry.timestamp || entry.createdAt,
          activity: entry.activity || 1,
        }));
        history = [...history, ...kimiEntries];
      }
    }
    return history;
  } catch {
    return [];
  }
}

async function fetchKimiUsage() {
  try {
    const res = await fetch(`${KIMI_USAGE_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function refresh() {
  try {
    const [res, history, kimiUsage] = await Promise.all([
      fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" }),
      fetchHistory(),
      fetchKimiUsage(),
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    // Merge KIMI usage into the main usage array
    if (kimiUsage && kimiUsage.provider) {
      const existingUsage = data.usage || [];
      // Remove any existing kimi entry
      const filtered = existingUsage.filter(u => u.provider !== "kimi");
      data.usage = [...filtered, kimiUsage];
    }
    
    cachedData = data;
    cachedHistory = history;
    render(data);
    renderHeatmap(history, data.usage);
  } catch (err) {
    updatedAtEl.textContent = `Error: ${err?.message || err}`;
    errorsEl.hidden = false;
    errorsEl.innerHTML = `<h2>${t("errors")}</h2><pre>${escapeHtml(String(err?.stack || err))}</pre>`;
  }
}

// Event handlers
langToggle.addEventListener("click", () => {
  currentLang = currentLang === "en" ? "ru" : "en";
  localStorage.setItem("codexbar-lang", currentLang);
  updateI18n();
  if (cachedData) {
    render(cachedData);
    if (cachedHistory) renderHeatmap(cachedHistory, cachedData.usage);
  }
});

if (tzToggle) {
  tzToggle.addEventListener("click", (ev) => {
    if (ev.shiftKey) {
      dayTzOverride = "";
      localStorage.removeItem(DAY_TZ_STORAGE_KEY);
    } else {
      dayTzOverride = getDayBucketKey() === "en" ? "ru" : "en";
      localStorage.setItem(DAY_TZ_STORAGE_KEY, dayTzOverride);
    }
    updateTzLabel();
    if (cachedData) {
      render(cachedData);
      if (cachedHistory) renderHeatmap(cachedHistory, cachedData.usage);
    }
  });
}

themeToggle.addEventListener("click", () => {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  localStorage.setItem("codexbar-theme", currentTheme);
  applyTheme();
  if (cachedData) renderCostTrend(getCostForCurrentView(cachedData), { syncInputs: false });
});

compareToggleBtn.addEventListener("click", () => {
  compareMode = !compareMode;
  compareToggleBtn.classList.toggle("active", compareMode);
  if (cachedData) render(cachedData);
});

if (modelFilterEl) {
  modelFilterEl.addEventListener("change", () => {
    currentModelFilter = modelFilterEl.value || "all";
    localStorage.setItem("codexbar-model-filter", currentModelFilter);
    if (cachedData) renderUsageProviders(cachedData.usage || [], getCostForCurrentView(cachedData));
  });
}

function resetTrendRange() {
  trendPinned = false;
  trendStartDate = "";
  trendEndDate = "";
  localStorage.removeItem("codexbar-trend-pinned");
  localStorage.removeItem("codexbar-trend-start");
  localStorage.removeItem("codexbar-trend-end");

  if (cachedData) {
    const cost = getCostForCurrentView(cachedData);
    const range = renderCostTrend(cost);
    updateModelFilterOptions(cost, range);
    renderUsageProviders(cachedData.usage || [], cost, range);
  }
}

if (costTrendRangeLabelEl) {
  costTrendRangeLabelEl.addEventListener("click", () => {
    if (!cachedData) return;
    const cost = getCostForCurrentView(cachedData);
    const { dates, start, end, defaultRange } = normalizeTrendRange(cost);
    if (dates.length === 0) return;
    const isDefault = start === defaultRange.start && end === defaultRange.end;
    if (isDefault && !trendPinned) return;
    resetTrendRange();
  });
}

function onTrendRangeInputChange() {
  trendStartDate = trendStartEl?.value || "";
  trendEndDate = trendEndEl?.value || "";

  trendPinned = Boolean(trendStartDate || trendEndDate);
  if (trendPinned) localStorage.setItem("codexbar-trend-pinned", "1");
  else localStorage.removeItem("codexbar-trend-pinned");

  if (trendStartDate) localStorage.setItem("codexbar-trend-start", trendStartDate);
  else localStorage.removeItem("codexbar-trend-start");

  if (trendEndDate) localStorage.setItem("codexbar-trend-end", trendEndDate);
  else localStorage.removeItem("codexbar-trend-end");

  if (cachedData) {
    const cost = getCostForCurrentView(cachedData);
    const range = renderCostTrend(cost);
    updateModelFilterOptions(cost, range);
    renderUsageProviders(cachedData.usage || [], cost, range);
  }
}

if (trendStartEl) trendStartEl.addEventListener("change", onTrendRangeInputChange);
if (trendEndEl) trendEndEl.addEventListener("change", onTrendRangeInputChange);

if (trendResetBtn) {
  trendResetBtn.addEventListener("click", () => {
    resetTrendRange();
  });
}

if (exportCsvBtn) {
  exportCsvBtn.addEventListener("click", () => {
    if (cachedData) exportCostTrendCsv(getCostForCurrentView(cachedData));
  });
}

sortButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    sortButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentSort = btn.dataset.sort;
    if (cachedData) renderUsageProviders(cachedData.usage || [], getCostForCurrentView(cachedData));
  });
});

// Handle window resize for chart
window.addEventListener("resize", () => {
  if (cachedData) renderCostTrend(getCostForCurrentView(cachedData), { syncInputs: false });
});

// KIMI CLI Stats
const KIMI_STATS_URL = "/data/kimi-stats.json";

function extractKimiCredits(usageData) {
  const credits = usageData?.credits;
  if (!credits) return { remaining: null, spent: null };

  const remaining = credits.remaining ?? null;
  const events = Array.isArray(credits.events) ? credits.events : [];
  const deltas = events
    .map(event => {
      const delta =
        event?.delta ??
        event?.amount ??
        event?.value ??
        event?.change ??
        event?.cost ??
        event?.costUSD ??
        event?.amountUSD;
      const n = Number(delta);
      return Number.isFinite(n) ? n : null;
    })
    .filter(n => n !== null);

  const spent = deltas.reduce((sum, v) => sum + (v < 0 ? -v : 0), 0);
  return { remaining, spent: spent > 0 ? spent : null };
}

async function loadKimiStats() {
  try {
    const [statsRes, usageRes] = await Promise.all([
      fetch(`${KIMI_STATS_URL}?t=${Date.now()}`, { cache: "no-store" }),
      fetch(`${KIMI_USAGE_URL}?t=${Date.now()}`, { cache: "no-store" })
    ]);
    if (!statsRes.ok) throw new Error(`HTTP ${statsRes.status}`);
    const data = await statsRes.json();
    const kimiUsage = usageRes.ok ? await usageRes.json() : null;
    
    if (data.status !== "ready") return;
    
    // Update summary stats
    const totalRunsEl = document.getElementById("kimiTotalRuns");
    const successEl = document.getElementById("kimiSuccess");
    const failedEl = document.getElementById("kimiFailed");
    const creditsRemainingEl = document.getElementById("kimiCreditsRemaining");
    const creditsSpentEl = document.getElementById("kimiCreditsSpent");
    const updatedEl = document.getElementById("kimiUpdated");
    
    if (totalRunsEl) totalRunsEl.textContent = data.totalRuns || 0;
    if (successEl) successEl.textContent = data.summary?.success || 0;
    if (failedEl) failedEl.textContent = data.summary?.failed || 0;
    if (creditsRemainingEl || creditsSpentEl) {
      const { remaining, spent } = extractKimiCredits(kimiUsage);
      if (creditsRemainingEl) creditsRemainingEl.textContent = formatKimiCredits(remaining);
      if (creditsSpentEl) creditsSpentEl.textContent = formatKimiCredits(spent);
    }
    if (updatedEl && data.lastUpdated) {
      const date = new Date(data.lastUpdated);
      updatedEl.textContent = `(${t("updated")}: ${formatRelativeTime(data.lastUpdated)})`;
    }
    
    // Update recent runs list
    const recentListEl = document.getElementById("kimiRecentList");
    if (recentListEl && data.recentRuns?.length > 0) {
      const runs = data.recentRuns.map(run => {
        const statusClass = run.status === "success" ? "success" : run.status === "failed" ? "failed" : "";
        const durationStr = run.duration ? `${run.duration}s` : "—";
        const timeStr = formatRelativeTime(run.createdAt);
        return `
          <div class="kimiRecentItem">
            <span class="kimiRunStatus ${statusClass}"></span>
            <span class="kimiRunTime">${timeStr}</span>
            <span class="kimiRunCommand">${escapeHtml(run.command)}</span>
            <span class="kimiRunDuration">${durationStr}</span>
          </div>
        `;
      }).join("");
      recentListEl.innerHTML = runs;
    } else if (recentListEl) {
      recentListEl.innerHTML = `<div class="kimiNoRuns">${t("noActivity")}</div>`;
    }
  } catch (err) {
    console.warn("[KIMI] Failed to load stats:", err);
  }
}

// Initialize
applyTheme();
updateI18n();
refresh();
setInterval(refresh, REFRESH_MS);

// Load KIMI stats after page load
loadKimiStats();
setInterval(loadKimiStats, 60000);
