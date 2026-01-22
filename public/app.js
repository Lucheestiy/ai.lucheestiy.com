// CodexBar Dashboard - Enhanced Version
const DATA_URL = "/data/latest.json";
const HISTORY_URL = "/data/history.json";
const REFRESH_MS = 60_000;

// State
let currentLang = localStorage.getItem("codexbar-lang") || "en";
let currentTheme = localStorage.getItem("codexbar-theme") || "dark";
let currentSort = "reset";
let compareMode = false;
let cachedData = null;
let cachedHistory = null;
let countdownIntervals = [];

// i18n translations
const i18n = {
  en: {
    title: "CodexBar Dashboard",
    subtitle: "AI Usage & Cost Monitor",
    loading: "Loading...",
    usage: "Usage",
    costLocal: "Cost (Local Logs)",
    costTrend: "Cost Trend (30 Days)",
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
    today: "Today",
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
    totalCost: "Total Cost",
    totalTokens: "Total Tokens",
    avgDaily: "Avg Daily",
    vsLastWeek: "vs last week",
    minutesAgo: "min ago",
    hoursAgo: "hr ago",
    justNow: "just now"
  },
  ru: {
    title: "Панель CodexBar",
    subtitle: "Мониторинг AI использования и стоимости",
    loading: "Загрузка...",
    usage: "Использование",
    costLocal: "Стоимость (локальные логи)",
    costTrend: "Динамика стоимости (30 дней)",
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
    today: "Сегодня",
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
    totalCost: "Общая стоимость",
    totalTokens: "Всего токенов",
    avgDaily: "Средн. в день",
    vsLastWeek: "к прошлой неделе",
    minutesAgo: "мин назад",
    hoursAgo: "ч назад",
    justNow: "только что"
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
const langToggle = document.getElementById("langToggle");
const langLabel = document.getElementById("langLabel");
const themeToggle = document.getElementById("themeToggle");
const compareToggleBtn = document.getElementById("compareToggle");
const sortButtons = document.querySelectorAll(".sortBtn");

// Utility functions
function t(key) {
  return i18n[currentLang]?.[key] || i18n.en[key] || key;
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
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const opts = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };
  // RU: Minsk (UTC+3), EN: New York (UTC-5/UTC-4 DST)
  if (currentLang === "ru") {
    opts.timeZone = "Europe/Minsk";
  } else {
    opts.timeZone = "America/New_York";
  }
  return d.toLocaleString(currentLang === "ru" ? "ru-RU" : "en-US", opts);
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);

  if (diffMin < 1) return t("justNow");
  if (diffMin < 60) return `${diffMin} ${t("minutesAgo")}`;
  if (diffHr < 24) return `${diffHr} ${t("hoursAgo")}`;
  return "";
}

function parseIsoMs(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
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
  return "";
}

// Update i18n text
function updateI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (key && i18n[currentLang]?.[key]) {
      el.textContent = i18n[currentLang][key];
    }
  });
  langLabel.textContent = currentLang.toUpperCase();
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
      const resetMs = parseIsoMs(u.resetsAt);
      const countdownId = `countdown-${providerId}-${key}`;

      return `
        <div>
          <div class="usageRow">
            <div class="usageLabel">${escapeHtml(title)}</div>
            <div class="usageValue">
              ${escapeHtml(usedText)} · <span class="pill ${pillClass}">${escapeHtml(leftText)}</span>
              ${resetMs ? `<span class="countdown" id="${countdownId}">--:--</span>` : ""}
            </div>
          </div>
          <div class="bar">
            <div class="barFill ${barClass}" style="width:${fill}%"></div>
            <div class="barMarker" style="left:70%"></div>
            <div class="barMarker" style="left:80%"></div>
            <div class="barMarker" style="left:90%"></div>
          </div>
          ${u.resetsAt ? `<div class="k" style="margin-top:6px">${t("resets")}: ${formatIso(u.resetsAt)}</div>` : ""}
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
        <div class="k">${t("today")}</div>
        <div class="v">${escapeHtml(formatUsd(cost.sessionCostUSD))} · ${escapeHtml(formatNumber(cost.sessionTokens))} ${t("tokens")}</div>
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
  const cost = Array.isArray(data.cost) ? data.cost : [];

  let totalCost30 = 0;
  let totalTokens30 = 0;
  let todayCost = 0;

  for (const c of cost) {
    totalCost30 += c.last30DaysCostUSD || 0;
    totalTokens30 += c.last30DaysTokens || 0;
    todayCost += c.sessionCostUSD || 0;
  }

  const avgDaily = totalCost30 / 30;

  return `
    <div class="statBox">
      <div class="label">${t("today")}</div>
      <div class="value">${formatUsd(todayCost)}</div>
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
    gemini: "rgba(66, 133, 244, 0.8)"
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
  if (dates.length === 0) return;

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

  // RU: Europe/Minsk, EN: America/New_York
  const timezone = currentLang === "ru" ? "Europe/Minsk" : "America/New_York";

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

  // RU: Europe/Minsk (UTC+3), EN: America/New_York (UTC-5/UTC-4 DST)
  const timezone = currentLang === "ru" ? "Europe/Minsk" : "America/New_York";

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
  const days = getLast7Days();
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Filter and sort entries for this provider by timestamp
  const providerEntries = history
    .filter(entry => `${entry.provider}|${entry.account || ""}` === providerKey)
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
    const dateOpts = currentLang === "ru"
      ? { timeZone: "Europe/Minsk", weekday: "short", month: "short", day: "numeric" }
      : { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" };
    const shortDay = new Date(day + "T12:00:00Z").toLocaleDateString(currentLang === "ru" ? "ru-RU" : "en-US", dateOpts);

    let dayTotal = 0;
    html += `<div class="heatmapRow">`;
    html += `<div class="heatmapLabel">${escapeHtml(shortDay)}</div>`;
    for (const h of hours) {
      const activity = lookup[day]?.[h] ?? null;
      if (activity) dayTotal += activity;
      const cls = getIntensityClass(activity);
      const titleText = activity !== null && activity > 0 ? `${activity.toFixed(1)}% ${t("activity")}` : t("noActivity");
      html += `<div class="heatmapCell ${cls}" data-day="${day}" data-hour="${h}" data-activity="${activity || 0}" title="${escapeHtml(day)} ${h}:00 - ${escapeHtml(titleText)}"></div>`;
    }
    html += `<div class="heatmapRowTotal">${dayTotal > 0 ? dayTotal.toFixed(1) + "%" : ""}</div>`;
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

  // Calculate totals for each provider
  // Show timezone indicator based on language
  const tzLabel = currentLang === "ru" ? "Минск" : "New York";

  let html = "";
  for (const [key, info] of providers) {
    // Calculate total activity as sum of deltas (actual changes), not absolute values
    const providerEntries = historyArray
      .filter(entry => `${entry.provider}|${entry.account || ""}` === key)
      .sort((a, b) => new Date(a.ts) - new Date(b.ts));

    let total = 0;
    let prevActivity = null;
    for (const entry of providerEntries) {
      const currentActivity = entry.activity ?? entry.sessionPct ?? 0;
      if (prevActivity !== null) {
        total += Math.abs(currentActivity - prevActivity);
      }
      prevActivity = currentActivity;
    }

    html += `<div class="card heatmapCard">`;
    html += `<h3 class="heatmapTitle">${getProviderIcon(info.provider)}${escapeHtml(info.label)}<span class="heatmapTotal">${total > 0 ? `(${total.toFixed(1)}% total)` : ""}</span> <span class="tzIndicator" style="font-size:0.7em;opacity:0.6;margin-left:8px;">${tzLabel}</span></h3>`;
    html += buildHeatmapForProvider(historyArray, key);
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
            ${t("activity")}: ${Number(activity).toFixed(1)}%
          </div>
        `;
      }
    });
  });
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
  clearCountdowns();

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
  const cost = Array.isArray(data.cost) ? data.cost : [];

  const sortedUsage = sortUsage(usage, currentSort);
  providersEl.innerHTML = sortedUsage.map((u, idx) => buildProviderCard(u, idx)).join("");

  // Start countdown timers after rendering
  setTimeout(() => {
    sortedUsage.forEach((u, idx) => {
      const providerId = `provider-${idx}`;
      const windows = ["primary", "secondary", "tertiary"];
      windows.forEach(key => {
        const resetMs = parseIsoMs(u.usage?.[key]?.resetsAt);
        if (resetMs) {
          startCountdown(`countdown-${providerId}-${key}`, resetMs);
        }
      });
    });
  }, 0);

  costEl.innerHTML = cost.length > 0 ? cost.map(c => buildCostCard(c)).join("") : `<div class="card"><div class="k">${t("noCostData")}</div></div>`;

  // Draw cost chart
  drawCostChart(cost);

  rawJsonEl.textContent = JSON.stringify(data, null, 2);
}

async function fetchHistory() {
  try {
    const res = await fetch(`${HISTORY_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function refresh() {
  try {
    const [res, history] = await Promise.all([
      fetch(`${DATA_URL}?t=${Date.now()}`, { cache: "no-store" }),
      fetchHistory(),
    ]);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
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

themeToggle.addEventListener("click", () => {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  localStorage.setItem("codexbar-theme", currentTheme);
  applyTheme();
  if (cachedData) drawCostChart(cachedData.cost || []);
});

compareToggleBtn.addEventListener("click", () => {
  compareMode = !compareMode;
  compareToggleBtn.classList.toggle("active", compareMode);
  if (cachedData) render(cachedData);
});

sortButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    sortButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentSort = btn.dataset.sort;
    if (cachedData) {
      const sortedUsage = sortUsage(cachedData.usage || [], currentSort);
      providersEl.innerHTML = sortedUsage.map((u, idx) => buildProviderCard(u, idx)).join("");
      // Restart countdowns
      clearCountdowns();
      setTimeout(() => {
        sortedUsage.forEach((u, idx) => {
          const providerId = `provider-${idx}`;
          ["primary", "secondary", "tertiary"].forEach(key => {
            const resetMs = parseIsoMs(u.usage?.[key]?.resetsAt);
            if (resetMs) startCountdown(`countdown-${providerId}-${key}`, resetMs);
          });
        });
      }, 0);
    }
  });
});

// Handle window resize for chart
window.addEventListener("resize", () => {
  if (cachedData) drawCostChart(cachedData.cost || []);
});

// Initialize
applyTheme();
updateI18n();
refresh();
setInterval(refresh, REFRESH_MS);
