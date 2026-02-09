// Nexus AI Dashboard - Enhanced Implementation
const DATA_URL = '/data/latest.json';
const HISTORY_URL = '/data/history.json';
const KIMI_STATS_URL = '/data/kimi-stats.json';
const REFRESH_MS = 60_000;
const HIDDEN_PROVIDER_IDS = new Set(['claude']);

// State
let currentTheme = localStorage.getItem('nexus-theme') || 'dark';
let currentLang = localStorage.getItem('nexus-lang') || 'en';
let dayTzOverride = localStorage.getItem('nexus-day-tz') || '';
let currentSort = 'reset';
let currentModelFilter = 'all';
let cachedData = null;
let cachedHistory = null;
let countdownIntervals = [];
let costChartHiddenProviders = new Set();
let costChartState = null;
let lastCostChartData = null;
let trendStartDate = '';
let trendEndDate = '';

// Provider colors
const PROVIDER_COLORS = {
  codex: '#10b981',
  claude: '#cc785c',
  gemini: '#4285f4',
  minimax: '#9b5cff',
  kimi: '#6c5ce7',
  default: '#94a3b8'
};

function normalizeProviderId(provider) {
  return String(provider || '').trim().toLowerCase();
}

function isProviderVisible(provider) {
  return !HIDDEN_PROVIDER_IDS.has(normalizeProviderId(provider));
}

function filterVisibleUsage(usageData) {
  if (!Array.isArray(usageData)) return [];
  return usageData.filter(item => isProviderVisible(item?.provider));
}

function filterVisibleCost(costData) {
  if (!Array.isArray(costData)) return [];
  return costData.filter(item => isProviderVisible(item?.provider));
}

function filterVisibleHistory(historyData) {
  if (!Array.isArray(historyData)) return [];
  return historyData.filter(item => isProviderVisible(item?.provider));
}

function filterVisibleCostByLang(costByLang) {
  if (!costByLang || typeof costByLang !== 'object') return undefined;
  const next = {};
  for (const [key, value] of Object.entries(costByLang)) {
    next[key] = filterVisibleCost(value);
  }
  return next;
}

function filterDashboardData(data) {
  if (!data || typeof data !== 'object') return data;
  const next = { ...data };
  next.usage = filterVisibleUsage(data.usage);
  if (Array.isArray(data.cost)) next.cost = filterVisibleCost(data.cost);
  const filteredCostByLang = filterVisibleCostByLang(data.costByLang);
  if (filteredCostByLang) next.costByLang = filteredCostByLang;
  if (Array.isArray(data.errors)) {
    next.errors = data.errors.filter((entry) => {
      if (entry && typeof entry === 'object' && 'provider' in entry) {
        return isProviderVisible(entry.provider);
      }
      const text = typeof entry === 'string' ? entry : JSON.stringify(entry ?? '');
      const lower = String(text).toLowerCase();
      for (const hiddenProvider of HIDDEN_PROVIDER_IDS) {
        if (lower.includes(hiddenProvider)) return false;
      }
      return true;
    });
  }
  return next;
}

// i18n
const i18n = {
  en: {
    dashboard: 'Dashboard', providers: 'Providers', analytics: 'Analytics',
    models: 'Models', heatmap: 'Activity', kimi: 'KiMi CLI',
    todaysCost: "Today's Cost", days30: '30 Days', totalTokens: 'Total Tokens',
    activeProviders: 'Active Providers', costTrend: 'Cost Trend',
    totalRuns: 'Total Runs', success: 'Success', failed: 'Failed',
    creditsLeft: 'Credits Left', creditsSpent: 'Credits Spent',
    recentRuns: 'Recent Runs', loading: 'Loading...', allModels: 'All Models',
    reset: 'Reset', exportCsv: 'Export CSV', originalDesign: 'Classic View',
    updated: 'Updated', ago: 'ago', justNow: 'just now',
    minutes: 'min', hours: 'hr', less: 'Less', more: 'More',
    noActivity: 'No activity', activity: 'Activity', used: 'used', left: 'left',
    resets: 'Resets', session: 'Session', week: 'Week', day: 'Day',
    today: 'Today', yesterday: 'Yesterday', source: 'Source', login: 'Login',
    active: 'Active', accounts: 'accounts', sortReset: 'Time',
    sortUsage: 'Usage', sortName: 'Name', noProviders: 'No providers found',
    noUsageData: 'No usage data', vsLastWeek: 'vs yesterday',
    newYork: 'NY', minsk: 'Minsk', window: 'Window'
  },
  ru: {
    dashboard: 'Панель', providers: 'Провайдеры', analytics: 'Аналитика',
    models: 'Модели', heatmap: 'Активность', kimi: 'KiMi CLI',
    todaysCost: 'Сегодня', days30: '30 дней', totalTokens: 'Всего токенов',
    activeProviders: 'Активные', costTrend: 'Динамика',
    totalRuns: 'Всего запусков', success: 'Успешно', failed: 'Ошибок',
    creditsLeft: 'Остаток', creditsSpent: 'Потрачено',
    recentRuns: 'Недавние', loading: 'Загрузка...', allModels: 'Все модели',
    reset: 'Сброс', exportCsv: 'Экспорт CSV', originalDesign: 'Оригинал',
    updated: 'Обновлено', ago: 'назад', justNow: 'только что',
    minutes: 'мин', hours: 'ч', less: 'Меньше', more: 'Больше',
    noActivity: 'Нет активности', activity: 'Активность', used: 'использовано',
    left: 'осталось', resets: 'Сброс', session: 'Сессия', week: 'Неделя',
    day: 'День', today: 'Сегодня', yesterday: 'Вчера', source: 'Источник',
    login: 'Вход', active: 'Активный', accounts: 'аккаунтов',
    sortReset: 'Время', sortUsage: 'Использование', sortName: 'Название',
    noProviders: 'Провайдеры не найдены', vsLastWeek: 'к вчерашнему',
    newYork: 'НЙ', minsk: 'Минск', window: 'Окно'
  }
};

function t(key) { return i18n[currentLang]?.[key] || i18n.en[key] || key; }

// Utility functions
function formatNumber(value) {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toLocaleString();
}

function formatUsd(value) {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  return '$' + n.toFixed(2);
}

function formatPercent(value) {
  if (value == null) return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toFixed(1);
}

function parseIsoMs(iso) {
  if (!iso) return null;
  if (typeof iso === 'number') return iso < 1e12 ? iso * 1000 : iso;
  const d = new Date(String(iso));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatRelativeTime(iso) {
  const ms = parseIsoMs(iso);
  if (!ms) return '';
  const diffMin = Math.floor((Date.now() - ms) / 60000);
  if (diffMin < 1) return t('justNow');
  if (diffMin < 60) return diffMin + ' ' + t('minutes') + ' ' + t('ago');
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + ' ' + t('hours') + ' ' + t('ago');
  return new Date(ms).toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US');
}

function formatIso(iso) {
  if (!iso) return '—';
  const ms = parseIsoMs(iso);
  if (!ms) return String(iso);
  return new Date(ms).toLocaleString(currentLang === 'ru' ? 'ru-RU' : 'en-US');
}

function formatCountdown(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) return hrs + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  return mins + ':' + String(secs).padStart(2, '0');
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Count-up animation
function animateValue(element, start, end, duration = 800, formatter = formatNumber) {
  const startTime = performance.now();
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * easeOut;
    element.textContent = formatter(current);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// Timezone handling
function getDayBucketKey() {
  if (dayTzOverride === 'en' || dayTzOverride === 'ru') return dayTzOverride;
  return currentLang === 'ru' ? 'ru' : 'en';
}

function getTimeZoneInfo() {
  const key = getDayBucketKey();
  if (key === 'ru') return { key, timeZone: 'Europe/Minsk', label: t('minsk') };
  return { key, timeZone: 'America/New_York', label: t('newYork') };
}

function formatYmdInTimeZone(date, timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(date);
    const get = (type) => parts.find(p => p.type === type)?.value || '';
    return get('year') + '-' + get('month') + '-' + get('day');
  } catch { return ''; }
}

function getTodayRange() {
  const { timeZone, label } = getTimeZoneInfo();
  const now = new Date();
  const today = formatYmdInTimeZone(now, timeZone);
  const yesterday = formatYmdInTimeZone(new Date(now.getTime() - 86400000), timeZone);
  return { timeZone, label, today, yesterday };
}

// Theme handling
function applyTheme() {
  document.documentElement.setAttribute('data-theme', currentTheme);
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.innerHTML = currentTheme === 'dark'
      ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
      : '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
  }
}

function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  localStorage.setItem('nexus-theme', currentTheme);
  applyTheme();
  if (cachedData) {
    renderChart(getCostForCurrentView(cachedData));
    renderModelsChart(getCostForCurrentView(cachedData));
  }
}

function updateLanguage() {
  const tzInfo = getTimeZoneInfo();
  document.getElementById('tzLabel').textContent = tzInfo.label;
  document.getElementById('tzBadge').textContent = tzInfo.label === 'NY' ? 'New York' : 'Minsk';
  document.getElementById('langLabel').textContent = currentLang.toUpperCase();
  document.querySelector('.topbar-title h1').textContent = t('dashboard');
  if (cachedData) renderDashboard(cachedData, cachedHistory);
}

function toggleLanguage() {
  currentLang = currentLang === 'en' ? 'ru' : 'en';
  localStorage.setItem('nexus-lang', currentLang);
  updateLanguage();
}

function toggleTimezone() {
  dayTzOverride = getDayBucketKey() === 'en' ? 'ru' : 'en';
  localStorage.setItem('nexus-day-tz', dayTzOverride);
  updateLanguage();
}

// Countdown management
function clearCountdowns() {
  countdownIntervals.forEach(id => clearInterval(id));
  countdownIntervals = [];
}

function startCountdown(elementId, targetMs) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const update = () => {
    const remaining = targetMs - Date.now();
    if (remaining <= 0) { el.textContent = '0:00'; el.classList.add('urgent'); return; }
    el.textContent = formatCountdown(remaining);
    el.classList.toggle('urgent', remaining < 300000);
  };
  update();
  countdownIntervals.push(setInterval(update, 1000));
}

// Sidebar handling
let sidebarCollapsed = localStorage.getItem('nexus-sidebar-collapsed') === 'true';

function updateSidebarState() {
  const sidebar = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('sidebarCollapse');
  if (!sidebar) return;
  
  sidebar.classList.toggle('collapsed', sidebarCollapsed);
  
  if (collapseBtn) {
    collapseBtn.innerHTML = sidebarCollapsed 
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16M13 5l7 7-7 7"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>';
    collapseBtn.title = sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
  }
}

function toggleSidebarCollapse() {
  sidebarCollapsed = !sidebarCollapsed;
  localStorage.setItem('nexus-sidebar-collapsed', sidebarCollapsed);
  updateSidebarState();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('open');
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', toggleSidebar);
    document.body.appendChild(overlay);
  }
  overlay.classList.toggle('visible');
}

// Navigation
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-section]');
  const sections = {
    dashboard: document.getElementById('statsSection'),
    providers: document.getElementById('providersSection'),
    analytics: document.getElementById('chartSection'),
    models: document.getElementById('modelsSection'),
    heatmap: document.getElementById('heatmapSection'),
    kimi: document.getElementById('kimiSection')
  };
  document.documentElement.style.scrollPaddingTop = '80px';
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = sections[item.dataset.section];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        if (window.innerWidth <= 920) toggleSidebar();
      }
    });
  });
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const sectionId = Object.keys(sections).find(key => sections[key] === entry.target);
        if (sectionId) {
          navItems.forEach(n => n.classList.toggle('active', n.dataset.section === sectionId));
        }
      }
    });
  }, { rootMargin: '-20% 0px -80% 0px' });
  
  Object.values(sections).forEach(s => s && observer.observe(s));
}

// Stats rendering
function getCostForCurrentView(data) {
  const picked = data?.costByLang?.[getDayBucketKey()];
  if (Array.isArray(picked)) return filterVisibleCost(picked);
  if (Array.isArray(data?.cost)) return filterVisibleCost(data.cost);
  return [];
}

function renderStats(data) {
  const cost = getCostForCurrentView(data);
  const usage = filterVisibleUsage(data?.usage);
  const { today, yesterday } = getTodayRange();
  
  let todayCost = 0, yesterdayCost = 0, monthCost = 0, totalTokens = 0;
  for (const c of cost) {
    monthCost += c.last30DaysCostUSD || 0;
    totalTokens += c.last30DaysTokens || 0;
    todayCost += c.daily?.find(d => d.date === today)?.totalCost || 0;
    yesterdayCost += c.daily?.find(d => d.date === yesterday)?.totalCost || 0;
  }
  
  const parseVal = (el) => parseFloat(el.textContent.replace(/[$,]/g, '')) || 0;
  
  animateValue(document.getElementById('todayCost'), parseVal(document.getElementById('todayCost')), todayCost, 800, formatUsd);
  animateValue(document.getElementById('monthCost'), parseVal(document.getElementById('monthCost')), monthCost, 800, formatUsd);
  animateValue(document.getElementById('totalTokens'), parseVal(document.getElementById('totalTokens')), totalTokens, 800, formatNumber);
  animateValue(document.getElementById('activeProviders'), parseVal(document.getElementById('activeProviders')), usage.length, 500, v => Math.round(v).toString());
  
  const trendEl = document.getElementById('todayTrend');
  if (trendEl && yesterdayCost > 0) {
    const change = ((todayCost - yesterdayCost) / yesterdayCost) * 100;
    trendEl.innerHTML = '<span class="trend-value ' + (change > 0 ? 'up' : 'down') + '">' + (change > 0 ? '↑' : '↓') + ' ' + Math.abs(change).toFixed(1) + '%</span>';
  }
  
  document.getElementById('todayComparison').textContent = t('vsLastWeek');
  
  const progressEl = document.getElementById('monthProgress');
  if (progressEl) progressEl.style.width = Math.min((monthCost / 1000) * 100, 100) + '%';
  
  const tokenRateEl = document.getElementById('tokenRate');
  if (tokenRateEl && totalTokens > 0) {
    tokenRateEl.textContent = formatNumber(Math.round(totalTokens / (30 * 24 * 60))) + ' tokens/min';
  }
  
  const dotsEl = document.getElementById('providerDots');
  if (dotsEl) {
    const active = [...new Set(usage.filter(u => !u.error).map(u => u.provider))];
    dotsEl.innerHTML = active.slice(0, 5).map(p => '<div class="provider-dot" style="background:' + (PROVIDER_COLORS[p] || PROVIDER_COLORS.default) + '"></div>').join('');
  }
  
  if (data.updatedAt) {
    document.getElementById('updatedAt').innerHTML = t('updated') + ' ' + formatRelativeTime(data.updatedAt);
  }
}

// Provider utilities
function getThresholdClass(usedPercent) {
  const n = Number(usedPercent);
  if (!Number.isFinite(n)) return 'good';
  if (n >= 90) return 'danger';
  if (n >= 70) return 'warning';
  return 'good';
}

function getPillClass(usedPercent) {
  const n = Number(usedPercent);
  if (!Number.isFinite(n)) return '';
  if (100 - n <= 10) return 'danger';
  if (100 - n <= 20) return 'warning';
  return 'good';
}

function windowLabel(minutes) {
  if (!minutes) return t('day');
  if (minutes === 5) return '5m';
  if (minutes === 60) return '1h';
  if (minutes === 300) return '5h';
  if (minutes === 1440) return '24h';
  if (minutes === 10080) return t('week');
  return Math.round(minutes / 60) + 'h';
}

function sortProviders(items) {
  return [...items].sort((a, b) => {
    if (currentSort === 'name') {
      return (a.item.codexAuthAccount || a.item.provider || '').localeCompare(b.item.codexAuthAccount || b.item.provider || '');
    }
    if (currentSort === 'usage') {
      const getMax = (item) => {
        const u = item.usage;
        if (!u) return 0;
        return Math.max(...[u.primary, u.secondary, u.tertiary].filter(Boolean).map(w => w.usedPercent || 0), 0);
      };
      return getMax(b.item) - getMax(a.item);
    }
    return 0;
  });
}

// Model filtering
function collectModels(costData) {
  const models = new Set();
  for (const c of costData) {
    for (const d of c.daily || []) {
      if (Array.isArray(d.modelsUsed)) d.modelsUsed.forEach(m => m && models.add(m));
    }
  }
  return Array.from(models).sort();
}

function updateModelFilterOptions(costData) {
  const select = document.getElementById('modelFilter');
  if (!select) return;
  const models = collectModels(costData);
  const current = select.value;
  select.innerHTML = '<option value="all">' + t('allModels') + '</option>';
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    select.appendChild(opt);
  }
  if (current === 'all' || models.includes(current)) select.value = current;
}

// Provider card builder
function buildProviderCard(item, idx) {
  const provider = item.provider || 'unknown';
  const account = item.codexAuthAccount;
  const name = account ? provider + ' (' + account + ')' : provider;
  const usageWindows = [];
  if (item.usage?.primary) usageWindows.push({ key: 'primary', ...item.usage.primary });
  if (item.usage?.secondary) usageWindows.push({ key: 'secondary', ...item.usage.secondary });
  if (item.usage?.tertiary) usageWindows.push({ key: 'tertiary', ...item.usage.tertiary });
  
  const usageHtml = usageWindows.map((u, wIdx) => {
    const used = Number(u.usedPercent);
    const cls = getThresholdClass(used);
    const pillClass = getPillClass(used);
    const countdownId = 'countdown-' + idx + '-' + wIdx;
    let resetHtml = '';
    if (u.resetsAt) {
      const resetMs = parseIsoMs(u.resetsAt);
      if (resetMs) { startCountdown(countdownId, resetMs); resetHtml = '<span class="countdown" id="' + countdownId + '">--:--</span>'; }
    }
    return '<div class="usage-item"><div class="usage-header"><span class="usage-label">' + escapeHtml(windowLabel(u.windowMinutes)) + '</span><div class="usage-values"><span class="usage-pill ' + pillClass + '">' + formatPercent(used) + '% ' + t('used') + '</span><span>' + formatPercent(Math.max(0, 100 - used)) + '% ' + t('left') + '</span>' + resetHtml + '</div></div><div class="usage-bar-bg"><div class="usage-bar-fill ' + cls + '" style="width:' + Math.min(100, used) + '%"></div></div></div>';
  }).join('');
  
  return '<div class="provider-card"><div class="provider-header"><div class="provider-title"><div class="provider-icon ' + provider.toLowerCase() + '">' + provider.charAt(0).toUpperCase() + '</div><div><div class="provider-name">' + escapeHtml(name) + '</div><div class="provider-source">' + escapeHtml(item.source || '—') + '</div></div></div>' + (item.usage?.loginMethod ? '<span class="provider-badge">' + escapeHtml(item.usage.loginMethod) + '</span>' : '') + '</div>' + (item.credits?.remaining !== undefined ? '<div class="provider-meta"><div class="meta-item"><span class="meta-label">' + t('creditsLeft') + '</span><span class="meta-value">' + formatNumber(item.credits.remaining) + '</span></div></div>' : '') + '<div class="usage-list">' + (usageHtml || '<div class="meta-value">' + t('noUsageData') + '</div>') + '</div></div>';
}

function buildCodexCard(codexItems, activeAccount) {
  const accounts = codexItems.map(({ item }) => item.codexAuthAccount).filter(Boolean);
  const active = activeAccount || accounts[0];
  return '<div class="provider-card"><div class="provider-header"><div class="provider-title"><div class="provider-icon codex">C</div><div><div class="provider-name">codex</div><div class="provider-source">' + accounts.length + ' ' + t('accounts') + '</div></div></div><span class="provider-badge">' + t('active') + ': ' + escapeHtml(active) + '</span></div><div class="codex-tabs">' + accounts.map(acc => '<button class="codex-tab ' + (acc === active ? 'active' : '') + '" data-account="' + escapeHtml(acc) + '">' + escapeHtml(acc) + '</button>').join('') + '</div><div class="codex-account-list">' + codexItems.map(({ item, idx }) => '<div class="codex-account-item" data-account="' + escapeHtml(item.codexAuthAccount) + '" style="' + (item.codexAuthAccount === active ? '' : 'display:none') + '">' + buildProviderCard(item, idx) + '</div>').join('') + '</div></div>';
}

function switchCodexAccount(account) {
  const container = document.querySelector('.codex-group-card');
  if (!container) return;
  container.querySelectorAll('.codex-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.account === account));
  container.querySelectorAll('.codex-account-item').forEach(item => item.style.display = item.dataset.account === account ? '' : 'none');
}

function renderProviders(data) {
  const usage = filterVisibleUsage(data?.usage);
  const container = document.getElementById('providersGrid');
  if (usage.length === 0) { container.innerHTML = '<div class="loading-state"><span>' + t('noProviders') + '</span></div>'; return; }
  
  let filteredUsage = usage;
  if (currentModelFilter !== 'all') {
    const cost = getCostForCurrentView(data);
    const providerModels = new Map();
    for (const c of cost) {
      const models = new Set();
      for (const d of c.daily || []) { if (Array.isArray(d.modelsUsed)) d.modelsUsed.forEach(m => models.add(m)); }
      providerModels.set(c.provider, models);
    }
    filteredUsage = usage.filter(u => (providerModels.get(u.provider) || new Set()).has(currentModelFilter));
  }
  
  const codexItems = [];
  const otherItems = [];
  for (let i = 0; i < filteredUsage.length; i++) {
    const item = filteredUsage[i];
    if (item.provider === 'codex') codexItems.push({ item, idx: i }); else otherItems.push({ item, idx: i });
  }
  
  const sortedCodex = sortProviders(codexItems);
  const sortedOther = sortProviders(otherItems);
  let html = '';
  
  if (sortedCodex.length > 1) html += buildCodexCard(sortedCodex, data.currentCodexAccount);
  else if (sortedCodex.length === 1) html += buildProviderCard(sortedCodex[0].item, sortedCodex[0].idx);
  
  for (const { item, idx } of sortedOther) html += buildProviderCard(item, idx);
  container.innerHTML = html;
  
  container.querySelectorAll('.codex-tab').forEach(tab => {
    tab.addEventListener('click', () => switchCodexAccount(tab.dataset.account));
  });
}

// Chart rendering - Area chart with gradient
function getAllCostDates(costData) {
  const dates = new Set();
  for (const cost of costData) {
    for (const d of cost.daily || []) if (d?.date) dates.add(d.date);
  }
  return Array.from(dates).sort();
}

function getDefaultTrendRange(dates) {
  if (!dates?.length) return { start: '', end: '' };
  return { start: dates[Math.max(0, dates.length - 30)], end: dates[dates.length - 1] };
}

function normalizeTrendRange(costData) {
  const dates = getAllCostDates(costData);
  if (!dates.length) return { dates, start: '', end: '' };
  const min = dates[0], max = dates[dates.length - 1];
  const defaultRange = getDefaultTrendRange(dates);
  let start = trendStartDate || defaultRange.start;
  let end = trendEndDate || defaultRange.end;
  start = start < min ? min : start > max ? max : start;
  end = end < min ? min : end > max ? max : end;
  if (start > end) [start, end] = [end, start];
  return { dates, start, end };
}

function renderChartLegend(providers) {
  const legend = document.getElementById('chartLegend');
  if (!legend) return;
  legend.innerHTML = providers.map(p => {
    const hidden = costChartHiddenProviders.has(p.name);
    return '<button class="legend-item ' + (hidden ? 'hidden' : '') + '" data-provider="' + escapeHtml(p.name) + '"><div class="legend-color" style="background:' + p.color + '"></div><span>' + escapeHtml(p.name) + '</span></button>';
  }).join('');
  
  legend.querySelectorAll('.legend-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.provider;
      costChartHiddenProviders.has(p) ? costChartHiddenProviders.delete(p) : costChartHiddenProviders.add(p);
      if (lastCostChartData) renderChart(lastCostChartData, false);
    });
  });
}

function renderChart(costData, syncInputs = true) {
  const canvas = document.getElementById('costChart');
  if (!canvas) return;
  lastCostChartData = costData;
  
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  
  const width = rect.width, height = rect.height;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const cost = Array.isArray(costData) ? costData : [];
  const { dates, start, end } = normalizeTrendRange(cost);
  
  if (syncInputs) {
    const startEl = document.getElementById('trendStart');
    const endEl = document.getElementById('trendEnd');
    if (startEl) { startEl.min = dates[0] || ''; startEl.max = dates[dates.length - 1] || ''; startEl.value = start; }
    if (endEl) { endEl.min = dates[0] || ''; endEl.max = dates[dates.length - 1] || ''; endEl.value = end; }
  }
  
  const filtered = cost.map(c => {
    if (!c.daily) return null;
    const filteredDaily = c.daily.filter(d => d?.date && d.date >= start && d.date <= end);
    return filteredDaily.length ? { ...c, daily: filteredDaily } : null;
  }).filter(Boolean).filter(c => !costChartHiddenProviders.has(c.provider || 'unknown'));
  
  const allDates = [...new Set(filtered.flatMap(c => c.daily.map(d => d.date)))].sort();
  if (!allDates.length) { ctx.clearRect(0, 0, width, height); return; }
  
  const providers = filtered.map(c => ({
    name: c.provider || 'unknown',
    dailyMap: Object.fromEntries(c.daily.map(d => [d.date, d.totalCost || 0])),
    color: PROVIDER_COLORS[c.provider] || PROVIDER_COLORS.default
  }));
  
  let maxValue = 0;
  for (const date of allDates) {
    let total = 0;
    for (const p of providers) total += p.dailyMap[date] || 0;
    maxValue = Math.max(maxValue, total);
  }
  maxValue = Math.ceil(maxValue * 1.1) || 1;
  
  ctx.clearRect(0, 0, width, height);
  
  // Grid
  const isDark = currentTheme === 'dark';
  ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) {
    const y = padding.top + (chartHeight / 5) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
    ctx.fillStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('$' + (maxValue - (maxValue / 5) * i).toFixed(0), padding.left - 10, y + 4);
  }
  
  // Area chart with gradient
  const step = chartWidth / (allDates.length - 1 || 1);
  
  for (const p of providers) {
    // Create gradient
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    gradient.addColorStop(0, p.color + '40');
    gradient.addColorStop(1, p.color + '05');
    
    // Draw area
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top + chartHeight);
    for (let i = 0; i < allDates.length; i++) {
      const x = padding.left + i * step;
      const y = padding.top + chartHeight - ((p.dailyMap[allDates[i]] || 0) / maxValue) * chartHeight;
      if (i === 0) ctx.lineTo(x, y);
      else {
        const prevX = padding.left + (i - 1) * step;
        const prevY = padding.top + chartHeight - ((p.dailyMap[allDates[i - 1]] || 0) / maxValue) * chartHeight;
        const cpX = (prevX + x) / 2;
        ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
      }
    }
    ctx.lineTo(padding.left + (allDates.length - 1) * step, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    for (let i = 0; i < allDates.length; i++) {
      const x = padding.left + i * step;
      const y = padding.top + chartHeight - ((p.dailyMap[allDates[i]] || 0) / maxValue) * chartHeight;
      if (i === 0) ctx.moveTo(x, y);
      else {
        const prevX = padding.left + (i - 1) * step;
        const prevY = padding.top + chartHeight - ((p.dailyMap[allDates[i - 1]] || 0) / maxValue) * chartHeight;
        const cpX = (prevX + x) / 2;
        ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
      }
    }
    ctx.stroke();
    
    // Draw points
    ctx.fillStyle = p.color;
    for (let i = 0; i < allDates.length; i++) {
      const value = p.dailyMap[allDates[i]] || 0;
      if (value > 0) {
        const x = padding.left + i * step;
        const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  
  // X labels
  ctx.fillStyle = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < allDates.length; i += Math.ceil(allDates.length / 6)) {
    ctx.fillText(allDates[i].slice(5), padding.left + i * step, height - 12);
  }
  
  renderChartLegend(providers);
  costChartState = { dates: allDates, providers, padding, step, canvas };
  
  // Tooltip handler
  canvas.onmousemove = (e) => {
    const tooltip = document.getElementById('chartTooltip');
    if (!tooltip || !costChartState) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    if (mx < padding.left || mx > width - padding.right || my < padding.top || my > height - padding.bottom) {
      tooltip.classList.remove('visible');
      return;
    }
    
    const idx = Math.round((mx - padding.left) / costChartState.step);
    if (idx < 0 || idx >= costChartState.dates.length) { tooltip.classList.remove('visible'); return; }
    
    const date = costChartState.dates[idx];
    const rows = costChartState.providers.map(p => ({ name: p.name, value: p.dailyMap[date] || 0, color: p.color }))
      .filter(r => r.value > 0).sort((a, b) => b.value - a.value);
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    
    let html = '<div style="font-weight:600;margin-bottom:6px">' + escapeHtml(date) + '</div>';
    html += '<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:6px;font-size:12px;color:#999"><span>Total</span><span>' + escapeHtml(formatUsd(total)) + '</span></div>';
    for (const r of rows) {
      html += '<div style="display:flex;justify-content:space-between;gap:12px;margin:2px 0;font-size:12px"><span style="display:flex;align-items:center;gap:6px"><span style="background:' + r.color + ';width:8px;height:8px;border-radius:2px"></span>' + escapeHtml(r.name) + '</span><span>' + escapeHtml(formatUsd(r.value)) + '</span></div>';
    }
    tooltip.innerHTML = html;
    tooltip.classList.add('visible');
    
    let left = e.clientX - rect.left + 12;
    let top = e.clientY - rect.top + 12;
    if (left + tooltip.offsetWidth > width) left = e.clientX - rect.left - tooltip.offsetWidth - 12;
    if (top + tooltip.offsetHeight > height) top = e.clientY - rect.top - tooltip.offsetHeight - 12;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  };
  
  canvas.onmouseleave = () => {
    const tooltip = document.getElementById('chartTooltip');
    if (tooltip) tooltip.classList.remove('visible');
  };
}

// Models pie chart
function renderModelsChart(costData) {
  const canvas = document.getElementById('modelsChart');
  const list = document.getElementById('modelsList');
  if (!canvas || !list) return;
  
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const size = Math.min(rect.width, rect.height, 250);
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  ctx.scale(dpr, dpr);
  
  // Aggregate model costs
  const modelCosts = new Map();
  for (const c of costData) {
    for (const d of c.daily || []) {
      for (const mb of d.modelBreakdowns || []) {
        if (mb.modelName) {
          modelCosts.set(mb.modelName, (modelCosts.get(mb.modelName) || 0) + (mb.cost || 0));
        }
      }
    }
  }
  
  const sorted = Array.from(modelCosts.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, cost]) => sum + cost, 0);
  
  if (!sorted.length) {
    ctx.clearRect(0, 0, size, size);
    list.innerHTML = '<div class="loading-state"><span>No model data</span></div>';
    return;
  }
  
  // Draw donut chart
  const centerX = size / 2, centerY = size / 2, radius = size * 0.35, innerRadius = size * 0.22;
  let currentAngle = -Math.PI / 2;
  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#cc785c', '#9b5cff', '#ec4899', '#64748b'];
  
  sorted.forEach(([model, cost], i) => {
    const angle = (cost / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + angle);
    ctx.arc(centerX, centerY, innerRadius, currentAngle + angle, currentAngle, true);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    currentAngle += angle;
  });
  
  // Center text
  ctx.fillStyle = currentTheme === 'dark' ? '#fff' : '#0f172a';
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Models', centerX, centerY - 5);
  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = currentTheme === 'dark' ? '#94a3b8' : '#64748b';
  ctx.fillText(sorted.length + ' total', centerX, centerY + 12);
  
  // Model list
  list.innerHTML = sorted.slice(0, 6).map(([model, cost], i) => {
    const percent = ((cost / total) * 100).toFixed(1);
    return '<div class="model-item"><div class="model-color" style="background:' + colors[i % colors.length] + '"></div><div class="model-info"><div class="model-name">' + escapeHtml(model) + '</div><div class="model-percent">' + percent + '%</div></div><div class="model-cost">' + formatUsd(cost) + '</div></div>';
  }).join('');
}

// Heatmap
function getLast7Days() {
  const days = [];
  const { timeZone } = getTimeZoneInfo();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(formatYmdInTimeZone(d, timeZone));
  }
  return days;
}

function getIntensityClass(value) {
  if (!value || value <= 0) return 'heatmap-intensity-0';
  if (value < 20) return 'heatmap-intensity-1';
  if (value < 40) return 'heatmap-intensity-2';
  if (value < 60) return 'heatmap-intensity-3';
  if (value < 80) return 'heatmap-intensity-4';
  return 'heatmap-intensity-5';
}

function computeHeatmapLookup(history, providerKey) {
  const lookup = {};
  let prevActivity = null;
  const entries = (history || []).filter(e => (e.provider + '|' + (e.account || '')) === providerKey).sort((a, b) => new Date(a.ts) - new Date(b.ts));
  
  for (const entry of entries) {
    const d = new Date(entry.ts);
    if (Number.isNaN(d.getTime())) continue;
    const { timeZone } = getTimeZoneInfo();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false, day: 'numeric', month: 'numeric', year: 'numeric' }).formatToParts(d);
    const get = (type) => parts.find(p => p.type === type)?.value || '0';
    const day = get('year') + '-' + get('month').padStart(2, '0') + '-' + get('day').padStart(2, '0');
    const hour = parseInt(get('hour'), 10);
    const activity = entry.activity ?? entry.sessionPct ?? 0;
    
    let delta = 0;
    if (prevActivity !== null) delta = Math.abs(activity - prevActivity);
    prevActivity = activity;
    
    if (delta > 0) {
      if (!lookup[day]) lookup[day] = {};
      lookup[day][hour] = (lookup[day][hour] || 0) + delta;
    }
  }
  return lookup;
}

function buildHeatmapFromLookup(lookup) {
  const days = getLast7Days();
  const hours = Array.from({ length: 24 }, (_, i) => i);
  let html = '<div class="heatmap-grid">';
  html += '<div class="heatmap-row"><div class="heatmap-day-label"></div>';
  for (const h of hours) html += '<div class="heatmap-hour-label">' + h + '</div>';
  html += '<div class="heatmap-day-label"></div></div>';
  
  for (const day of days) {
    const dayLabel = new Date(day + 'T12:00:00Z').toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US', { timeZone: getTimeZoneInfo().timeZone, weekday: 'short', month: 'short', day: 'numeric' });
    html += '<div class="heatmap-row"><div class="heatmap-day-label">' + escapeHtml(dayLabel) + '</div>';
    for (const h of hours) {
      const activity = lookup?.[day]?.[h] ?? 0;
      html += '<div class="heatmap-cell ' + getIntensityClass(activity) + '" data-value="' + Math.round(activity) + '"></div>';
    }
    html += '<div class="heatmap-day-label"></div></div>';
  }
  html += '</div>';
  return html;
}

function renderHeatmap(history, usageData) {
  const container = document.getElementById('heatmapContainer');
  if (!container) return;
  
  const usage = filterVisibleUsage(usageData);
  const visibleHistory = filterVisibleHistory(history);
  const providers = new Map();
  if (usage.length > 0) {
    for (const item of usage) {
      const key = item.provider + '|' + (item.codexAuthAccount || '');
      if (!providers.has(key)) providers.set(key, { provider: item.provider, account: item.codexAuthAccount || '', label: item.codexAuthAccount ? item.provider + ' (' + item.codexAuthAccount + ')' : item.provider });
    }
  }
  
  if (!providers.size) { container.innerHTML = '<div class="loading-state"><span>No data</span></div>'; return; }
  
  let html = '';
  const codex = [], other = [];
  for (const [key, info] of providers) info.provider === 'codex' ? codex.push({ key, info }) : other.push({ key, info });
  
  if (codex.length > 1) {
    const combined = {};
    for (const { key } of codex) {
      const lookup = computeHeatmapLookup(visibleHistory, key);
      for (const [day, hours] of Object.entries(lookup)) {
        if (!combined[day]) combined[day] = {};
        for (const [hour, val] of Object.entries(hours)) combined[day][hour] = (combined[day][hour] || 0) + val;
      }
    }
    html += '<div class="heatmap-card"><div class="heatmap-title"><div class="provider-icon codex">C</div>codex (' + codex.length + ' ' + t('accounts') + ')</div><div class="heatmap-scroll">' + buildHeatmapFromLookup(combined) + '</div></div>';
  } else if (codex.length === 1) {
    html += '<div class="heatmap-card"><div class="heatmap-title"><div class="provider-icon codex">C</div>' + escapeHtml(codex[0].info.label) + '</div><div class="heatmap-scroll">' + buildHeatmapFromLookup(computeHeatmapLookup(visibleHistory, codex[0].key)) + '</div></div>';
  }
  
  for (const { key, info } of other) {
    html += '<div class="heatmap-card"><div class="heatmap-title"><div class="provider-icon ' + info.provider + '">' + info.provider.charAt(0).toUpperCase() + '</div>' + escapeHtml(info.label) + '</div><div class="heatmap-scroll">' + buildHeatmapFromLookup(computeHeatmapLookup(visibleHistory, key)) + '</div></div>';
  }
  
  html += '<div class="heatmap-legend"><span>' + t('less') + '</span>' + [0,1,2,3,4,5].map(i => '<div class="heatmap-legend-cell heatmap-intensity-' + i + '"></div>').join('') + '<span>' + t('more') + '</span></div>';
  container.innerHTML = html;
}

// KiMi rendering
function renderKimi(data) {
  if (!data) {
    ['kimiTotalRuns', 'kimiSuccess', 'kimiFailed', 'kimiCreditsRemaining', 'kimiCreditsSpent'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    return;
  }
  
  const parseVal = (el) => parseFloat(el.textContent.replace(/[$,]/g, '')) || 0;
  animateValue(document.getElementById('kimiTotalRuns'), parseVal(document.getElementById('kimiTotalRuns')), data.totalRuns || 0, 600, formatNumber);
  animateValue(document.getElementById('kimiSuccess'), parseVal(document.getElementById('kimiSuccess')), data.summary?.success || 0, 600, formatNumber);
  animateValue(document.getElementById('kimiFailed'), parseVal(document.getElementById('kimiFailed')), data.summary?.failed || 0, 600, formatNumber);
  animateValue(document.getElementById('kimiCreditsRemaining'), parseVal(document.getElementById('kimiCreditsRemaining')), data.credits?.remaining || 0, 600, formatUsd);
  animateValue(document.getElementById('kimiCreditsSpent'), parseVal(document.getElementById('kimiCreditsSpent')), data.credits?.spent || 0, 600, formatUsd);
  
  const recentList = document.getElementById('kimiRecentList');
  const recent = data.recentRuns || [];
  if (!recent.length) { recentList.innerHTML = '<div class="recent-item"><span>No recent runs</span></div>'; return; }
  
  recentList.innerHTML = recent.slice(0, 5).map(run => '<div class="recent-item"><span>' + escapeHtml(run.command || 'unknown') + '</span><span class="recent-status ' + (run.status === 'success' ? 'success' : 'error') + '">' + (run.status === 'success' ? '✓' : '✗') + '</span></div>').join('');
}

// CSV Export
function exportCsv() {
  const cost = getCostForCurrentView(cachedData);
  const { start, end } = normalizeTrendRange(cost);
  const rows = [['date', 'provider', 'source', 'totalCostUSD', 'totalTokens', 'inputTokens', 'outputTokens', 'modelsUsed']];
  
  for (const c of cost) {
    for (const d of c.daily || []) {
      if (d.date >= start && d.date <= end) {
        rows.push([d.date, c.provider, c.source, d.totalCost, d.totalTokens, d.inputTokens, d.outputTokens, (d.modelsUsed || []).join('|')]);
      }
    }
  }
  
  const csv = '\uFEFF' + rows.map(r => r.map(v => /[",\r\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'nexus-cost-' + start + '_to_' + end + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Main render
function renderDashboard(data, history) {
  const visibleData = filterDashboardData(data);
  const visibleHistory = filterVisibleHistory(history);
  clearCountdowns();
  renderStats(visibleData);
  updateModelFilterOptions(getCostForCurrentView(visibleData));
  renderProviders(visibleData);
  renderChart(getCostForCurrentView(visibleData));
  renderModelsChart(getCostForCurrentView(visibleData));
  renderHeatmap(visibleHistory, visibleData?.usage);
}

// Data fetching
async function fetchData() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.classList.add('spinning');
  
  try {
    const [dataRes, historyRes, kimiRes] = await Promise.all([
      fetch(DATA_URL),
      fetch(HISTORY_URL),
      fetch(KIMI_STATS_URL).catch(() => null)
    ]);
    
    const data = await dataRes.json();
    const history = await historyRes.json();
    let kimiData = null;
    if (kimiRes?.ok) kimiData = await kimiRes.json();
    
    const visibleData = filterDashboardData(data);
    const visibleHistory = filterVisibleHistory(history);
    cachedData = visibleData;
    cachedHistory = visibleHistory;
    renderDashboard(visibleData, visibleHistory);
    renderKimi(kimiData);
    
  } catch (err) {
    console.error('Failed to fetch data:', err);
    document.getElementById('providersGrid').innerHTML = '<div class="error-message">Failed to load data: ' + escapeHtml(err.message) + '</div>';
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('spinning');
  }
}

// Preset buttons
function setupPresetButtons() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = parseInt(btn.dataset.days);
      const cost = getCostForCurrentView(cachedData);
      const allDates = getAllCostDates(cost);
      if (allDates.length) {
        trendEndDate = allDates[allDates.length - 1];
        trendStartDate = allDates[Math.max(0, allDates.length - days)];
        renderChart(cost);
      }
    });
  });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  updateLanguage();
  initNavigation();
  setupPresetButtons();
  
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('langToggle').addEventListener('click', toggleLanguage);
  document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarClose').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarCollapse').addEventListener('click', toggleSidebarCollapse);
  document.getElementById('refreshBtn').addEventListener('click', fetchData);
  document.getElementById('tzToggle').addEventListener('click', toggleTimezone);
  
  // Apply saved sidebar state
  updateSidebarState();
  
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort || 'reset';
      if (cachedData) renderProviders(cachedData);
    });
  });
  
  const modelFilter = document.getElementById('modelFilter');
  if (modelFilter) {
    modelFilter.addEventListener('change', () => {
      currentModelFilter = modelFilter.value;
      if (cachedData) renderProviders(cachedData);
    });
  }
  
  const trendStart = document.getElementById('trendStart');
  const trendEnd = document.getElementById('trendEnd');
  if (trendStart) trendStart.addEventListener('change', () => { trendStartDate = trendStart.value; if (cachedData) renderChart(getCostForCurrentView(cachedData)); });
  if (trendEnd) trendEnd.addEventListener('change', () => { trendEndDate = trendEnd.value; if (cachedData) renderChart(getCostForCurrentView(cachedData)); });
  
  document.getElementById('exportCsv').addEventListener('click', exportCsv);
  
  // Update footer time
  document.getElementById('footerTime').textContent = new Date().toLocaleString();
  
  fetchData();
  setInterval(fetchData, REFRESH_MS);
});

window.addEventListener('resize', () => {
  if (cachedData) {
    renderChart(getCostForCurrentView(cachedData), false);
    renderModelsChart(getCostForCurrentView(cachedData));
  }
});

// Listen for system theme changes
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('nexus-theme')) {
      currentTheme = e.matches ? 'dark' : 'light';
      applyTheme();
      if (cachedData) renderChart(getCostForCurrentView(cachedData), false);
    }
  });
}
