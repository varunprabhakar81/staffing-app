/* ── Staffing Intelligence — Frontend App ──────────────────────── */

'use strict';

// ── Current user role (set after auth check, used for role-based gating) ──
let currentUserRole         = null;
let currentUserCanViewRates = false;

// ── Fix Chart.js resolution on high-DPI / Retina displays ─────────
Chart.defaults.devicePixelRatio = window.devicePixelRatio || 2;

// ── Tab switching ─────────────────────────────────────────────────
document.querySelectorAll('.nav-item:not(.nav-item--disabled)').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
    // Clear search input on every tab switch
    const searchInput = document.querySelector('.hdr-search-input');
    if (searchInput) searchInput.value = '';
    // Update bell badge on every tab switch
    updateBellBadge();
    // Re-render virtual scroll after tab layout settles (clientHeight was 0 while hidden)
    if (tab === 'staffing') {
      requestAnimationFrame(() => _vsRenderVisible());
    }
    // Resize charts after tab becomes visible (fixes Chart.js sizing on hidden panels)
    if (tab === 'needs') {
      requestAnimationFrame(() => {
        Object.values(charts).forEach(c => c && typeof c.resize === 'function' && c.resize());
      });
    }
    // Refresh suggested questions each time Ask tab is opened
    if (tab === 'ask') {
      loadSuggestedQuestions();
    }
    // Reload user list each time Settings tab is opened
    if (tab === 'settings') {
      loadUsers();
    }
  });
});

function navigateTo(tabName) {
  const btn = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  if (btn) btn.click();
}

// ── Sidebar collapse ───────────────────────────────────────────────
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  const icon = document.querySelector('.collapse-icon');
  if (icon) icon.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
}

// ── Keyboard shortcuts ────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
  if (e.key === 'Escape') { closeDrilldown(); closeShortcutGuide(); return; }
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'r') { e.preventDefault(); loadDashboard(); return; }
    if (e.key === '1') { e.preventDefault(); navigateTo('overview'); return; }
    if (e.key === '2') { e.preventDefault(); navigateTo('staffing'); return; }
    if (e.key === '3') { e.preventDefault(); navigateTo('needs');    return; }
    if (e.key === '4') { e.preventDefault(); navigateTo('ask');      return; }
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleSidebar(); return; }
  }
  if (e.key === '?' && !inInput) { e.preventDefault(); toggleShortcutGuide(); }
});

// ── Keyboard shortcut guide ───────────────────────────────────────
function openShortcutGuide()   { document.getElementById('shortcutOverlay').classList.add('active'); }
function closeShortcutGuide()  { const el = document.getElementById('shortcutOverlay'); if (el) el.classList.remove('active'); }
function toggleShortcutGuide() { const el = document.getElementById('shortcutOverlay'); if (el) el.classList.toggle('active'); }
function handleShortcutOverlayClick(e) { if (e.target === e.currentTarget) closeShortcutGuide(); }

// ── Header: Date Range Selector ───────────────────────────────────
window.selectedDateRange = { type: 'current', weekOffset: 0 };

(function initDateRange() {
  function getWeekEndDate(offsetWeeks) {
    const today = new Date();
    const daysToSat = (6 - today.getDay() + 7) % 7;
    const sat = new Date(today);
    sat.setDate(today.getDate() + daysToSat + offsetWeeks * 7);
    return sat;
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function formatWeekLabel(date) {
    return `Week of ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  }

  const labelBtn  = document.getElementById('dateRangeLabel');
  const dropdown  = document.getElementById('dateRangeDropdown');
  const prevBtn   = document.getElementById('dateRangePrev');
  const nextBtn   = document.getElementById('dateRangeNext');

  if (labelBtn) labelBtn.textContent = formatWeekLabel(getWeekEndDate(0));

  function applyWeekOffset() {
    window.selectedDateRange.type = 'custom';
    if (labelBtn) labelBtn.textContent = formatWeekLabel(getWeekEndDate(window.selectedDateRange.weekOffset));
    document.dispatchEvent(new CustomEvent('dateRangeChanged', { detail: { ...window.selectedDateRange } }));
  }

  if (labelBtn) {
    labelBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (dropdown) dropdown.classList.toggle('hidden');
    });
  }

  document.querySelectorAll('.hdr-date-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const range = btn.dataset.range;
      window.selectedDateRange.type = range;
      window.selectedDateRange.weekOffset = 0;
      const labels = { current: 'Current Week', next2: 'Next 2 Weeks', next4: 'Next 4 Weeks', month: 'This Month' };
      if (labelBtn) labelBtn.textContent = labels[range] || 'Current Week';
      if (dropdown) dropdown.classList.add('hidden');
      document.dispatchEvent(new CustomEvent('dateRangeChanged', { detail: { ...window.selectedDateRange } }));
    });
  });

  if (prevBtn) prevBtn.addEventListener('click', () => { window.selectedDateRange.weekOffset--; applyWeekOffset(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { window.selectedDateRange.weekOffset++; applyWeekOffset(); });

  document.addEventListener('click', () => { if (dropdown) dropdown.classList.add('hidden'); });
})();

// ── Header: Search Bar ────────────────────────────────────────────
(function initHeaderSearch() {
  const input = document.getElementById('headerSearch');
  if (!input) return;

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; input.blur(); e.stopPropagation(); }
  });

  input.addEventListener('input', () => {
  });
})();

// ── Header: Notification Bell ─────────────────────────────────────
function closeBellDropdown() {
  const dd = document.getElementById('bellDropdown');
  if (dd) dd.classList.add('hidden');
}

function updateBellBadge() {
  const badge     = document.getElementById('bellBadge');
  const alertList = document.getElementById('bellAlertList');
  if (!badge || !alertList) return;

  const unmetCount = (rawData.coverageRoles || []).filter(r => r.status === 'unmet').length;

  const empTotals = {};
  for (const row of rawData.supply || []) {
    const n = row.employeeName;
    if (!empTotals[n]) empTotals[n] = [];
    for (const hrs of Object.values(row.weeklyHours || {})) empTotals[n].push(hrs || 0);
  }
  const overbookedCount = Object.values(empTotals).filter(weeks => {
    const avg = weeks.length ? weeks.reduce((a, b) => a + b, 0) / weeks.length : 0;
    return avg > 45;
  }).length;

  const total = unmetCount + overbookedCount;

  // If data hasn't loaded yet keep the hardcoded fallback badge visible
  if (rawData.coverageRoles.length === 0 && rawData.supply.length === 0) return;

  badge.textContent = String(total);
  badge.style.display = total > 0 ? '' : 'none';

  let html = '';
  if (unmetCount > 0) {
    html += `<div class="hdr-alert-item">
      <span class="hdr-alert-icon">⚠️</span>
      <span class="hdr-alert-text">${unmetCount} unmet staffing need${unmetCount !== 1 ? 's' : ''}</span>
      <button class="hdr-alert-link" onclick="navigateTo('needs');closeBellDropdown()">View →</button>
    </div>`;
  }
  if (overbookedCount > 0) {
    html += `<div class="hdr-alert-item">
      <span class="hdr-alert-icon">🔴</span>
      <span class="hdr-alert-text">${overbookedCount} employee${overbookedCount !== 1 ? 's' : ''} overbooked</span>
      <button class="hdr-alert-link" onclick="navigateTo('staffing');closeBellDropdown()">View →</button>
    </div>`;
  }
  if (total === 0) {
    html = '<div class="hdr-alert-empty">No active alerts</div>';
  }
  alertList.innerHTML = html;
}

(function initBell() {
  const bellBtn  = document.getElementById('bellBtn');
  const dropdown = document.getElementById('bellDropdown');
  if (!bellBtn || !dropdown) return;

  bellBtn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) updateBellBadge();
  });

  document.addEventListener('click', e => {
    if (!bellBtn.contains(e.target)) dropdown.classList.add('hidden');
  });
})();

// ── Chart registry (so we can destroy + re-render on refresh) ─────
const charts = {};

// ── Raw data store for drilldowns ─────────────────────────────────
const rawData = { supply: [], employees: [], cliffs: [], coverageRoles: [], heatmap: null };

// ── Tracks which employee rows are expanded in the heatmap ────────
const _hmExpanded = new Set();

// ── Utilization status helper ─────────────────────────────────────
function utilStatus(hours) {
  if (hours > 45)  return { label: 'Overbooked',     cls: 'status-overbooked' };
  if (hours === 45) return { label: 'Fully Utilized', cls: 'status-full' };
  if (hours >= 40)  return { label: 'Nominal',        cls: 'status-nominal' };
  if (hours > 0)    return { label: 'Underutilized',  cls: 'status-under' };
  return             { label: 'Bench',                cls: 'status-bench' };
}

// ── Per-employee average hours (built from rawData.supply) ────────
function buildEmpAverages() {
  const map = {};
  for (const row of rawData.supply) {
    const n = row.employeeName;
    if (!map[n]) map[n] = { skillSet: row.skillSet, projects: [], weekTotals: {} };
    if (row.projectAssigned && !map[n].projects.includes(row.projectAssigned))
      map[n].projects.push(row.projectAssigned);
    for (const [wk, hrs] of Object.entries(row.weeklyHours))
      map[n].weekTotals[wk] = (map[n].weekTotals[wk] || 0) + (hrs || 0);
  }
  const out = {};
  for (const [n, info] of Object.entries(map)) {
    const vals = Object.values(info.weekTotals);
    const avg  = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    out[n] = { avg: Math.round(avg * 10) / 10, skillSet: info.skillSet,
               projects: info.projects, weekTotals: info.weekTotals };
  }
  return out;
}

// ── Format week label — return just "M/D" (strips "Week ending " prefix)
function fmtWeek(wk) {
  const iso = String(wk).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${parseInt(iso[2])}/${parseInt(iso[3])}`;
  const md = String(wk).match(/(\d+)\/(\d+)/);
  return md ? `${parseInt(md[1])}/${parseInt(md[2])}` : String(wk);
}

// ── Load Dashboard ────────────────────────────────────────────────
async function loadDashboard() {
  const refreshBtn = document.getElementById('headerRefreshBtn');
  if (refreshBtn) refreshBtn.classList.add('spinning');
  try {
    const [dashRes, supplyRes, empRes, heatmapRes] = await Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/supply'),
      fetch('/api/employees'),
      fetch('/api/heatmap'),
    ]);

    const [dashText, supplyText, empText, heatmapText] = await Promise.all([
      dashRes.text(), supplyRes.text(), empRes.text(), heatmapRes.text(),
    ]);
    if (!dashRes.ok) throw new Error(`HTTP ${dashRes.status}`);
    const data = JSON.parse(dashText);
    if (data.error) throw new Error(data.error);

    rawData.supply        = supplyRes.ok    ? JSON.parse(supplyText)    : [];
    rawData.employees     = empRes.ok       ? JSON.parse(empText)       : [];
    rawData.cliffs        = data.cliffs     || [];
    rawData.coverageRoles = (data.needsCoverage || {}).roles || [];
    rawData.heatmap       = heatmapRes.ok   ? JSON.parse(heatmapText)   : null;

    // Week ending date (Saturday) + update time
    (function() {
      const now = new Date();
      const daysToSat = (6 - now.getDay() + 7) % 7;
      const weekEnd = new Date(now);
      weekEnd.setDate(now.getDate() + daysToSat);
      const weekLabel = `${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;
      const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const tsEl = document.getElementById('dataTimestamp');
      if (tsEl) tsEl.innerHTML = `<span class="sidebar-week-time">Updated ${timeLabel}</span>`;
    })();

    renderKPIs(data);
    renderOverviewStats(data, rawData.heatmap);
    renderCoverageChart(data.needsCoverage);
    renderBenchReport(data.benchReport);
    if (rawData.heatmap) buildHeatmapTable(rawData.heatmap);
    loadSuggestedQuestions();
    updateBellBadge();

  } catch (err) {
    document.getElementById('dataTimestamp').textContent = 'Could not load data — check server';
    console.error('[Dashboard]', err);
  } finally {
    const refreshBtn = document.getElementById('headerRefreshBtn');
    if (refreshBtn) refreshBtn.classList.remove('spinning');
  }
}

// ── Toast notification ────────────────────────────────────────────
function showToast(msg, type = 'default', durationMs = 8000) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'app-toast';
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => {
      clearTimeout(toast._timer);
      toast.classList.remove('visible');
    });
    document.body.appendChild(toast);
  }
  const styles = {
    error:   { icon: '✕' },
    success: { icon: '✓' },
    default: { icon: '⚠️' },
  };
  const { icon } = styles[type] || styles.default;
  toast.classList.remove('toast-default', 'toast-success', 'toast-error');
  toast.classList.add(`toast-${type}`);

  const colonIdx = msg.indexOf(':');
  if (type === 'default' && colonIdx !== -1) {
    const label = msg.slice(0, colonIdx + 1);
    const body  = msg.slice(colonIdx + 1).trimStart();
    toast.innerHTML =
      `<span class="app-toast-icon">${icon}</span>` +
      `<span class="app-toast-body"><span class="app-toast-label">${label}</span> ${body}</span>`;
  } else {
    toast.innerHTML =
      `<span class="app-toast-icon">${icon}</span>` +
      `<span class="app-toast-body">${msg}</span>`;
  }
  clearTimeout(toast._timer);
  toast.classList.remove('visible');
  void toast.offsetHeight; // force reflow so the CSS transition fires from opacity:0
  toast.classList.add('visible');
  toast._timer = setTimeout(() => toast.classList.remove('visible'), durationMs);
}

// ── SSE auto-refresh ──────────────────────────────────────────────
(function initSSE() {
  if (!window.EventSource) return;
  const es = new EventSource('/api/events');
  es.addEventListener('data-updated', () => {
    if (_pendingStaffing.size === 0) {
      loadDashboard();
    } else {
      showToast('Data updated in background — save or discard your changes first', 'default', 6000);
    }
  });
  // on error EventSource auto-reconnects; no special handling needed
})();

// ── KPI Cards (KPI strip — kept for compatibility, no-ops if strip removed) ──
function renderKPIs(data) {
  if (!document.getElementById('kpiHeadcount')) return; // strip removed from Overview
}

// ── Overview Executive Dashboard ──────────────────────────────────
function renderOverviewStats(data, heatmapData) {
  // ── Shared data ──────────────────────────────────────────────────
  const levels           = data.utilizationByLevel || [];
  const headcount        = levels.reduce((s, l) => s + l.headcount, 0);
  const totalConsultants = heatmapData && heatmapData.employees ? heatmapData.employees.length : headcount;

  // Compute available hours and current-week hours from heatmap
  let totalAvail = 0, benchThisWeek = 0, currentWeekHours = 0;
  if (heatmapData && heatmapData.employees) {
    for (const emp of heatmapData.employees) {
      const hrs = emp.weeklyHours[0] || 0;
      totalAvail      += Math.max(0, 45 - hrs);
      currentWeekHours += hrs;
      if (hrs === 0) benchThisWeek++;
    }
  }
  // Use API's multi-week weighted average for utilization % (correct 65% figure)
  const avgUtil = headcount
    ? Math.round(levels.reduce((s, l) => s + l.utilizationPct * l.headcount, 0) / headcount)
    : 0;
  // Booked count: employees with client project hours > 0 this week (excludes Unassigned/bench rows)
  const currentWeekKey = heatmapData && heatmapData.weeks && heatmapData.weeks[0]
    ? `Week ending ${heatmapData.weeks[0]}` : null;
  const bookedSet = new Set();
  (rawData.supply || []).forEach(row => {
    if (currentWeekKey && row.projectAssigned !== 'Unassigned'
        && (row.weeklyHours || {})[currentWeekKey] > 0) {
      bookedSet.add(row.employeeName);
    }
  });
  const allWithHours = currentWeekKey
    ? new Set((rawData.supply || []).filter(r => (r.weeklyHours || {})[currentWeekKey] > 0).map(r => r.employeeName)).size
    : 0;
  const bookedCount = bookedSet.size || (totalConsultants - benchThisWeek);

  // ── Card 1: Utilization ──────────────────────────────────────────
  const utilColor = avgUtil >= 80 ? '#A8E6CF' : avgUtil >= 60 ? '#FFF3A3' : '#FFB3B3';
  const utilCard  = document.getElementById('overviewUtilCard');
  if (utilCard) utilCard.style.setProperty('--ov-accent', utilColor);

  const utilEl = document.getElementById('overviewUtil');
  if (utilEl) utilEl.textContent = headcount ? String(avgUtil) : '—';

  const utilSecondary = document.getElementById('overviewUtilSecondary');
  if (utilSecondary && headcount) {
    const avgHrs = headcount > 0 ? Math.round(currentWeekHours / headcount) : 0;
    utilSecondary.textContent = `${bookedCount} of ${headcount} booked · avg ${avgHrs}h/wk`;
  }

  const utilTrendEl = document.getElementById('overviewUtilTrend');
  if (utilTrendEl && headcount) {
    if (avgUtil >= 80) {
      utilTrendEl.textContent = '↑ At or above 80% target';
      utilTrendEl.className = 'ov-card-trend ok';
    } else {
      utilTrendEl.textContent = `↓ Below 80% target`;
      utilTrendEl.className = 'ov-card-trend warn';
    }
  }

  // ── Card 2: Available Hours ──────────────────────────────────────
  const availEl = document.getElementById('overviewAvailHours');
  if (availEl) availEl.textContent = totalAvail ? String(totalAvail) : '—';

  const availSecondary = document.getElementById('overviewAvailSecondary');
  if (availSecondary && totalConsultants) {
    const totalCap = totalConsultants * 45;
    const capUsedPct = totalCap > 0 ? Math.round((totalCap - totalAvail) / totalCap * 100) : 0;
    availSecondary.textContent = `${capUsedPct}% of total capacity booked`;
  }

  const availTrendEl = document.getElementById('overviewAvailTrend');
  if (availTrendEl) {
    if (benchThisWeek > 0) {
      availTrendEl.textContent = `${benchThisWeek} consultant${benchThisWeek !== 1 ? 's' : ''} fully free`;
      availTrendEl.className = 'ov-card-trend warn';
    } else if (totalAvail === 0) {
      availTrendEl.textContent = '✓ Team fully booked this week';
      availTrendEl.className = 'ov-card-trend ok';
    } else {
      availTrendEl.textContent = 'Unbooked capacity available';
      availTrendEl.className = 'ov-card-trend';
    }
  }

  // ── Card 2: capacity bar ─────────────────────────────────────────
  const totalCap  = totalConsultants * 45;
  const bookedHrs = totalCap - totalAvail;
  const capFill   = document.getElementById('ovCapBarFill');
  const capLabel  = document.getElementById('ovCapBarLabel');
  if (capFill) capFill.style.width = totalCap > 0 ? `${Math.round(bookedHrs / totalCap * 100)}%` : '0%';
  if (capLabel && totalCap > 0) capLabel.textContent = `${bookedHrs}h booked · ${totalAvail}h available`;

  // ── Card 3: Pipeline Coverage ─────────────────────────────────────
  const summary    = (data.needsCoverage || {}).summary || {};
  const unmet      = summary.unmet || 0;
  const totalRoles = (summary.fully_met || 0) + (summary.partially_met || 0) + unmet;
  const needsColor = unmet > 0 ? '#FFB3B3' : '#A8E6CF';
  const needsCard  = document.getElementById('overviewNeedsCard');
  if (needsCard) needsCard.style.setProperty('--ov-accent', needsColor);

  const unmetEl = document.getElementById('overviewUnmet');
  if (unmetEl) unmetEl.textContent = String(unmet);

  const needsSecondary = document.getElementById('overviewNeedsSecondary');
  if (needsSecondary) {
    needsSecondary.textContent = totalRoles > 0
      ? `${unmet} unmet · ${summary.partially_met || 0} partial`
      : 'no open needs';
  }

  // Mini donut for Card 3
  if (charts.needsDonut) { try { charts.needsDonut.destroy(); } catch(e) {} charts.needsDonut = null; }
  const donutCanvas = document.getElementById('overviewNeedsDonut');
  if (donutCanvas && totalRoles > 0) {
    charts.needsDonut = new Chart(donutCanvas, {
      type: 'doughnut',
      data: { datasets: [{ data: [summary.fully_met || 0, summary.partially_met || 0, unmet],
        backgroundColor: ['#A8E6CF', '#FFF3A3', '#FFB3B3'], borderWidth: 0, hoverOffset: 0 }] },
      options: { responsive: false, cutout: '60%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 600 } }
    });
  }

  const unmetTrendEl = document.getElementById('overviewUnmetTrend');
  if (unmetTrendEl) {
    if (unmet > 0) {
      unmetTrendEl.textContent = `⚠ ${unmet} role${unmet !== 1 ? 's' : ''} need attention`;
      unmetTrendEl.className = 'ov-card-trend warn';
    } else {
      unmetTrendEl.textContent = '✓ All needs covered';
      unmetTrendEl.className = 'ov-card-trend ok';
    }
  }

  // ── Card 4: On Bench ─────────────────────────────────────────────
  const benchCount = (data.benchReport || []).reduce((s, g) => s + g.employees.length, 0);
  const benchColor = benchCount > 0 ? '#FFB3B3' : '#A8E6CF';
  const benchCard  = document.getElementById('overviewBenchCard');
  if (benchCard) benchCard.style.setProperty('--ov-accent', benchColor);

  const benchEl = document.getElementById('overviewBench');
  if (benchEl) benchEl.textContent = String(benchCount);

  const benchSecondary = document.getElementById('overviewBenchSecondary');
  if (benchSecondary && totalConsultants) {
    benchSecondary.textContent = `of ${totalConsultants} consultants total`;
  }

  const benchTrendEl = document.getElementById('overviewBenchTrend');
  if (benchTrendEl) {
    if (benchCount > 0) {
      benchTrendEl.textContent = `⚠ ${benchCount} person${benchCount !== 1 ? 's' : ''} available to assign`;
      benchTrendEl.className = 'ov-card-trend warn';
    } else {
      benchTrendEl.textContent = '✓ All consultants booked';
      benchTrendEl.className = 'ov-card-trend ok';
    }
  }

  // ── Row 2 & 3 panels ─────────────────────────────────────────────
  renderLevelBreakdown(heatmapData);
  renderTopProjects(heatmapData);
  renderRollingOff(heatmapData);
  renderNeedsAttention(data);
}

// ── Level Breakdown (Row 2 left) ──────────────────────────────────
const LEVEL_ORDER_OV = ['Partner/MD', 'Senior Manager', 'Manager', 'Senior Consultant', 'Consultant', 'Analyst'];

function renderLevelBreakdown(heatmapData) {
  const el = document.getElementById('ovLevelBreakdown');
  if (!el) return;
  const byLevel = {};
  const weekLabels = (heatmapData && heatmapData.weeks) || [];
  const numWeeks = (heatmapData && heatmapData.employees && heatmapData.employees[0])
    ? (heatmapData.employees[0].weeklyHours || []).length
    : 1;
  if (heatmapData && heatmapData.employees) {
    for (const emp of heatmapData.employees) {
      if (!byLevel[emp.level]) byLevel[emp.level] = { totalHours: 0, count: 0, weeklyTotals: {} };
      const lvl = byLevel[emp.level];
      lvl.count++;
      for (let w = 0; w < (emp.weeklyHours || []).length; w++) {
        lvl.totalHours += emp.weeklyHours[w] || 0;
        lvl.weeklyTotals[w] = (lvl.weeklyTotals[w] || 0) + (emp.weeklyHours[w] || 0);
      }
    }
  }
  // Only render levels that have employees in the current data
  const rows = LEVEL_ORDER_OV
    .filter(l => byLevel[l])
    .map(l => {
      const { totalHours, count, weeklyTotals } = byLevel[l];
      const weeks = Math.max(numWeeks, 1);
      const utilPct = Math.round(totalHours / (count * 45 * weeks) * 100);
      // Build per-week avg data
      const weekAvgs = Object.keys(weeklyTotals).map(wi => {
        const idx = parseInt(wi, 10);
        const avg = Math.round(weeklyTotals[idx] / count * 10) / 10;
        return { idx, label: weekLabels[idx] || `Week ${idx + 1}`, avg };
      });
      const overallocated = weekAvgs.some(w => w.avg > 45);
      // Rich tooltip: only overallocated weeks
      const tooltipLines = weekAvgs
        .filter(w => w.avg > 45)
        .map(w => `Week ${w.label}: ${w.avg}h avg (cap: 45h)`)
        .join('\n');
      return { level: l, count, utilPct, overallocated, weekAvgs, tooltipLines };
    });

  const safeId = l => l.replace(/[^a-zA-Z0-9]/g, '_');

  el.innerHTML = rows.map((r, i) => {
    const color = r.utilPct > 100 ? '#FFB3B3' : r.utilPct >= 90 ? '#A8E6CF' : r.utilPct >= 70 ? '#FFF3A3' : '#FFB3B3';
    const barWidth = Math.min(r.utilPct, 100);
    const rowBg = i % 2 === 0 ? '#1A1D27' : '#16192A';
    let warning = '';
    let panel = '';
    if (r.overallocated) {
      const panelId = `overalloc-panel-${safeId(r.level)}`;
      const tooltipAttr = r.tooltipLines.replace(/"/g, '&quot;');
      warning = `<span class="ov-level-warn ov-level-warn--clickable" title="${tooltipAttr}" data-panel="${panelId}">⚠️<span class="ov-level-warn-hint">click for details</span></span>`;
      const weekRows = r.weekAvgs.map(w => {
        const over = w.avg > 45;
        const statusCls = over ? 'ov-overalloc-status--over' : 'ov-overalloc-status--ok';
        const statusLabel = over ? 'Over' : 'OK';
        return `<tr>
          <td>Week ${w.label}</td>
          <td>${w.avg}h</td>
          <td>45h</td>
          <td><span class="ov-overalloc-status ${statusCls}">${statusLabel}</span></td>
        </tr>`;
      }).join('');
      panel = `<div class="ov-overalloc-panel hidden" id="${panelId}">
        <table class="ov-overalloc-table">
          <thead><tr><th>Week</th><th>Avg Hours</th><th>Capacity</th><th>Status</th></tr></thead>
          <tbody>${weekRows}</tbody>
        </table>
      </div>`;
    }
    return `<div class="ov-level-row-wrap">
      <div class="ov-level-row" style="background:${rowBg}">
        <span class="ov-level-name">${r.level}</span>
        <span class="ov-level-count">(${r.count})</span>
        <div class="ov-level-bar-track">
          <div class="ov-level-bar-fill" style="width:${barWidth}%;background:${color}"></div>
        </div>
        <span class="ov-level-pct" style="color:${color}">${r.utilPct}%</span>${warning}
      </div>${panel}
    </div>`;
  }).join('');

  // Toggle panel on ⚠️ click (remove previous listener to avoid stacking on re-render)
  if (el._overallocHandler) el.removeEventListener('click', el._overallocHandler);
  el._overallocHandler = function(e) {
    const warn = e.target.closest('.ov-level-warn--clickable');
    if (!warn) return;
    e.stopPropagation();
    const panel = document.getElementById(warn.dataset.panel);
    if (panel) panel.classList.toggle('hidden');
  };
  el.addEventListener('click', el._overallocHandler);
}

// ── Top Projects This Week (Row 2 left bottom) ────────────────────
function renderTopProjects(heatmapData) {
  const el = document.getElementById('ovTopProjects');
  if (!el) return;
  if (!heatmapData || !heatmapData.employees) {
    el.innerHTML = '<div class="ov-empty">No data</div>'; return;
  }
  const projectHours = {};
  for (const emp of heatmapData.employees) {
    const projects = (emp.weeklyProjects && emp.weeklyProjects[0]) || [];
    for (const { project, hours } of projects) {
      if (project && project !== 'Unassigned') {
        projectHours[project] = (projectHours[project] || 0) + hours;
      }
    }
  }
  const sorted = Object.entries(projectHours).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!sorted.length) {
    el.innerHTML = '<div class="ov-empty">No projects this week</div>'; return;
  }
  const maxHrs = sorted[0][1];
  el.innerHTML = sorted.map(([project, hours]) => `
    <div class="ov-project-row">
      <div class="ov-project-label">
        <span class="ov-project-name">${project}</span>
        <span class="ov-project-hours">${hours}h</span>
      </div>
      <div class="ov-project-bar-track">
        <div class="ov-project-bar-fill" style="width:${Math.round(hours / maxHrs * 100)}%"></div>
      </div>
    </div>`).join('');
}

// ── Rolling Off Soon (Row 2 right top) ────────────────────────────
function renderRollingOff(heatmapData) {
  const el = document.getElementById('ovRollingOff');
  if (!el) return;
  if (!heatmapData || !heatmapData.employees) {
    el.innerHTML = '<div class="ov-empty ok">✓ No major roll-offs in next 2 weeks</div>'; return;
  }
  const weeks   = heatmapData.weeks || [];
  const results = [];
  for (const emp of heatmapData.employees) {
    const w0 = emp.weeklyHours[0] || 0;
    const w1 = emp.weeklyHours[1] || 0;
    const w2 = emp.weeklyHours[2] || 0;
    if (w0 < 20) continue;
    if (w0 - w1 >= 20) {
      results.push({ name: emp.name, level: emp.level, skillSet: emp.skillSet,
        fromH: w0, toH: w1, weekLabel: weeks[1] || 'next week', urgency: 'coral' });
    } else if (w0 - w2 >= 20) {
      results.push({ name: emp.name, level: emp.level, skillSet: emp.skillSet,
        fromH: w0, toH: w2, weekLabel: weeks[2] || 'week 3', urgency: 'yellow' });
    }
  }
  results.sort((a, b) => a.urgency === b.urgency ? b.fromH - a.fromH : a.urgency === 'coral' ? -1 : 1);
  if (!results.length) {
    el.innerHTML = '<div class="ov-empty ok">✓ No major roll-offs in next 2 weeks</div>'; return;
  }
  el.innerHTML = results.slice(0, 4).map(r => {
    const bc = r.urgency === 'coral' ? '#FFB3B3' : '#FFF3A3';
    return `<div class="ov-cliff-item" style="border-left-color:${bc}">
      <div class="ov-cliff-name">${r.name}</div>
      <div class="ov-cliff-meta">${r.level || '—'}${r.skillSet ? ' · ' + r.skillSet : ''}</div>
      <div class="ov-cliff-detail">
        <span style="color:${bc};font-size:11px">Week of ${r.weekLabel}</span>
        <span class="ov-cliff-hours">${r.fromH}h → ${r.toH}h</span>
      </div>
    </div>`;
  }).join('');
}

// ── Needs Attention (Row 2 right bottom) ─────────────────────────
function renderNeedsAttention(data) {
  const el = document.getElementById('ovNeedsAttention');
  if (!el) return;
  const roles  = (data.needsCoverage || {}).roles || [];
  const urgent = roles
    .filter(r => r.status === 'unmet' || r.status === 'partially_met')
    .sort((a, b) => {
      const da = a.startDate ? new Date(a.startDate) : new Date('9999');
      const db = b.startDate ? new Date(b.startDate) : new Date('9999');
      return da - db;
    });
  if (!urgent.length) {
    el.innerHTML = '<div class="ov-empty ok">✓ All current needs are covered</div>'; return;
  }
  const today = new Date();
  el.innerHTML = urgent.slice(0, 4).map(r => {
    const isUnmet   = r.status === 'unmet';
    const bc        = isUnmet ? '#FFB3B3' : '#FFF3A3';
    const startD    = r.startDate ? new Date(r.startDate) : null;
    const dateCol   = startD && startD <= today ? '#FFB3B3' : '#FFF3A3';
    return `<div class="ov-needs-item">
      <div class="ov-needs-row">
        <span class="ov-needs-project">${r.project || '—'}</span>
        <span class="ov-needs-badge" style="background:${bc}22;color:${bc};border-color:${bc}">${isUnmet ? 'Unmet' : 'Partial'}</span>
      </div>
      <div class="ov-needs-meta">${r.level || ''}${r.skillSet ? ' · ' + r.skillSet : ''}</div>
      <div class="ov-needs-date" style="color:${dateCol}">From ${r.startDate || '—'}</div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════
// ── Availability Heatmap ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function heatmapCellBg(hours) {
  return '#161820'; // uniform dark — color signal is on border-left only
}

// Row-level utilization tint — applied to emp-row cells only
// weekDate: the Saturday end-date of the column (Date object). Beyond 8-week planning horizon,
// 0h cells are neutral (unplanned is expected) rather than alarming red.
function heatmapRowTint(hours, weekDate) {
  if (hours === 0) {
    if (weekDate) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 56); // 8-week planning horizon
      if (weekDate > cutoff) return '#161820'; // beyond horizon — neutral, not alarming
    }
    return 'rgba(239,68,68,0.08)';   // bench (within horizon)
  }
  if (hours < 20)    return 'rgba(245,158,11,0.07)';  // at risk
  if (hours < 40)    return 'rgba(99,102,241,0.08)';  // under — indigo, distinct from current-week blue
  if (hours <= 45)   return 'rgba(16,185,129,0.07)';  // optimal
  return 'rgba(239,68,68,0.05)';                       // over
}

function heatmapCellFg(hours, weekDate) {
  if (hours === 0) {
    if (weekDate) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + 56); // 8-week planning horizon
      if (weekDate > cutoff) return '#3A3D4A'; // beyond horizon — neutral muted, not alarming red
    }
    return 'rgba(239,68,68,0.6)'; // bench within horizon
  }
  return '#E2E8F0';
}

function heatmapCellBorder(hours) {
  if (hours === 0)   return '#3A3D4A'; // bench
  if (hours < 40)    return '#3B82F6'; // under
  if (hours < 45)    return '#10B981'; // nominal
  if (hours === 45)  return '#F59E0B'; // full
  if (hours <= 50)   return '#EF4444'; // over
  return '#DC2626';                    // over+
}

function encodeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
}

// ── Virtual scroll constants & state ─────────────────────────────
const VS_H_EMP   = 48;   // employee row height px
const VS_H_LEVEL = 20;   // level group header height px
const VS_H_SUB   = 26;   // project sub-row height px
const VS_BUFFER  = 8;    // extra rows rendered beyond viewport

let _vsData    = null;   // {weeks, employees} reference
let _vsAllRows = [];     // flat array of row descriptors
let _vsColCount = 13;    // 1 name col + N week cols
let _vsScrollRaf = null; // rAF handle for scroll debounce
let _hmCurWeek = -1;     // index of the current week column (-1 = none visible)

// Find which week index contains today's date (weeks[] are "M/D" Saturday end-dates)
function _computeCurWeekIdx(weeks) {
  const now = new Date();
  const year = now.getFullYear();
  for (let i = 0; i < weeks.length; i++) {
    const m = weeks[i].match(/(\d+)\/(\d+)/);
    if (!m) continue;
    const sat = new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
    const sun = new Date(sat); sun.setDate(sat.getDate() - 6);
    if (now >= sun && now <= sat) return i;
  }
  return -1;
}

// Build (or rebuild) flat row list from _vsData + _hmExpanded state
function _buildVsAllRows() {
  _vsAllRows = [];
  if (!_vsData) return;
  const { weeks, employees } = _vsData;
  _vsColCount = weeks.length + 1;

  const byLevel = {};
  for (const emp of employees) {
    if (!byLevel[emp.level]) byLevel[emp.level] = [];
    byLevel[emp.level].push(emp);
  }

  for (const level of LEVEL_ORDER) {
    const emps = byLevel[level];
    if (!emps || !emps.length) continue;
    _vsAllRows.push({ type: 'level', level, count: emps.length, height: VS_H_LEVEL });

    for (const emp of emps) {
      _vsAllRows.push({ type: 'emp', emp, height: VS_H_EMP });
      if (_hmExpanded.has(emp.name)) {
        const allProjects = [];
        for (const wkProjs of emp.weeklyProjects)
          for (const p of wkProjs)
            if (!allProjects.includes(p.project)) allProjects.push(p.project);
        for (const projName of allProjects)
          _vsAllRows.push({ type: 'sub', emp, projName, height: VS_H_SUB });
        _vsAllRows.push({ type: 'total', emp, height: VS_H_SUB });
      }
    }
  }
}

// ── Inline edit state ────────────────────────────────────────────
let _editActiveCell = null;   // { empName, weekIdx, project } or null
// pending changes: key = `${empName}||${weekLabel}||${project}` → hours
const _pendingStaffing = new Map();

// Returns true if the current user's role can edit heatmap cells
function _hmCanEdit() {
  return currentUserRole === 'admin' || currentUserRole === 'resource_manager';
}

// Compute pending display total for a cell (null = no pending)
function _pendingDisplayTotal(empName, weekIdx) {
  if (!_vsData) return null;
  const weekLabel = _vsData.weeks[weekIdx];
  const emp = _vsData.employees.find(e => e.name === empName);
  const origProjects = (emp && emp.weeklyProjects[weekIdx]) || [];

  let hasPending = false;
  const pendingByProj = {};
  for (const [key, hours] of _pendingStaffing) {
    const parts = key.split('||');
    if (parts[0] === empName && parts[1] === weekLabel) {
      hasPending = true;
      pendingByProj[parts[2]] = hours;
    }
  }
  if (!hasPending) return null;

  let total = 0;
  for (const h of Object.values(pendingByProj)) total += h;
  for (const p of origProjects) {
    if (!(p.project in pendingByProj)) total += p.hours;
  }
  return total;
}

// Render a single virtual row to HTML
function _vsRenderRow(row) {
  const C = _vsColCount;
  if (row.type === 'level') {
    return `<tr class="hm-level-row"><td colspan="${C}">${row.level} <span style="opacity:0.5;font-size:9px">(${row.count})</span></td></tr>`;
  }

  if (row.type === 'emp') {
    const emp = row.emp;
    const sn  = encodeAttr(emp.name);
    const h0  = emp.weeklyHours[0] || 0;
    const st  = h0 === 0 ? 'On bench' : h0 < 40 ? 'Under-utilized' : h0 <= 45 ? 'Nominal' : 'Overbooked';
    const tip = encodeAttr(`${emp.name}\n${emp.level}  ·  ${emp.skillSet || '—'}\nThis week: ${h0}h — ${st}`);
    const chv = _hmExpanded.has(emp.name) ? '▼' : '▶';
    const cells = emp.weeklyHours.map((h, i) => {
      // Emp row always drills — never renders as an editing input
      const pendingH = _pendingDisplayTotal(emp.name, i);
      const displayH = pendingH !== null ? pendingH : h;
      const isPending = pendingH !== null;
      const projs    = emp.weeklyProjects[i];
      const projText = projs.length ? projs.map(p => `${p.project}: ${p.hours}h`).join('\n') : 'No bookings';
      const ct = encodeAttr(`${displayH}h total\n${projText}`);
      // Emp row total — click shows tooltip + expands; never editable
      // Compute week's Saturday end-date for planning-horizon tint logic
      const _wkStr  = _vsData && _vsData.weeks ? _vsData.weeks[i] : null;
      const _wkM    = _wkStr ? _wkStr.match(/(\d+)\/(\d+)/) : null;
      const _wkDate = _wkM ? new Date(new Date().getFullYear(), parseInt(_wkM[1]) - 1, parseInt(_wkM[2])) : null;
      const _empBl  = isPending ? '3px solid #F59E0B' : `3px solid ${heatmapCellBorder(h)}`;
      const _empBg  = heatmapRowTint(displayH, _wkDate);
      const _empFg  = isPending ? '#F59E0B' : heatmapCellFg(displayH, _wkDate);
      const _curCls = i === _hmCurWeek ? ' hm-col-current' : '';
      return `<td class="hm-cell${isPending ? ' hm-cell-pending' : ''}${_curCls}"
        style="background:${_empBg};color:${_empFg};border-left:${_empBl}"
        data-emp="${sn}" data-idx="${i}" data-tip="${ct}" data-cell-type="emp-total"
        onclick="empTotalCellClick(event,this)"
        onmouseenter="showHmTooltip(event,this)"
        onmousemove="positionHmTooltip(event)"
        onmouseleave="hideHmTooltip()">${displayH}</td>`;
    }).join('');
    return `<tr class="hm-emp-row">
      <td class="hm-name-cell" data-emp="${sn}" data-tip="${tip}"
        onmouseenter="showEmpTip(event,this)"
        onmousemove="moveEmpTip(event)"
        onmouseleave="hideEmpTip()">
        <div class="hm-name-inner" onclick="toggleHmExpand(this.closest('td').dataset.emp)">
          <span class="hm-chevron">${chv}</span>
          <div class="hm-name-text"><div class="hm-emp-name">${emp.name}</div></div>
        </div>
        <span class="hm-info-icon"
          onclick="event.stopPropagation();drillHeatmapEmployee(this.closest('td').dataset.emp)"
          title="Full booking history">ℹ</span>
      </td>${cells}</tr>`;
  }

  if (row.type === 'sub') {
    const { emp, projName } = row;
    const sn = encodeAttr(emp.name);
    const cells = emp.weeklyProjects.map((wkProjs, i) => {
      const match = wkProjs.find(p => p.project === projName);
      const origH = match ? match.hours : 0;

      const isActive = _editActiveCell &&
        _editActiveCell.empName === emp.name && _editActiveCell.weekIdx === i &&
        _editActiveCell.project === projName;
      if (isActive) {
        return `<td class="hm-sub-cell hm-cell-editing">
          <input class="hm-cell-input" type="number" min="0" max="100"
            value="${origH}" data-emp="${sn}" data-idx="${i}" data-proj="${encodeAttr(projName)}"
            onblur="hmCellBlur(this)"
            onkeydown="hmCellKeydown(event,this)"
            onfocus="this.select()"></td>`;
      }

      const weekLabel = _vsData ? _vsData.weeks[i] : '';
      const fillKey   = `${emp.name}||${weekLabel}||${projName}`;
      const pending   = _pendingStaffing.has(fillKey) ? _pendingStaffing.get(fillKey) : null;
      const h         = pending !== null ? pending : origH;
      const isPending = pending !== null;

      const _subBl = isPending ? '3px solid #F59E0B' : `3px solid ${heatmapCellBorder(h)}`;
      const bg = '#161820'; // pending handled by CSS outline; no amber flood fill
      const fg = isPending ? '#F59E0B' : heatmapCellFg(h);

      if (_hmCanEdit()) {
        return `<td class="hm-sub-cell hm-cell-editable${isPending ? ' hm-cell-pending' : ''}"
          style="background:${bg};color:${fg};border-left:${_subBl}"
          onclick="hmSubCellClick('${sn}',${i},'${encodeAttr(projName)}')">${h > 0 ? h : '—'}</td>`;
      }
      const _bl = `3px solid ${heatmapCellBorder(h)}`;
      return `<td class="hm-sub-cell" style="background:#161820;color:${heatmapCellFg(h)};border-left:${_bl}">${h > 0 ? h : '—'}</td>`;
    }).join('');
    return `<tr class="hm-sub-row hm-sub-visible">
      <td class="hm-sub-name-cell"><span class="hm-sub-indent">${encodeAttr(projName)}</span></td>${cells}</tr>`;
  }

  if (row.type === 'total') {
    const cells = row.emp.weeklyHours.map((h, i) => {
      const pendingH = _pendingDisplayTotal(row.emp.name, i);
      const displayH = pendingH !== null ? pendingH : h;
      const isPending = pendingH !== null;
      const _totBl = isPending ? '3px solid #F59E0B' : `3px solid ${heatmapCellBorder(h)}`;
      const bg = '#161820'; // pending handled by CSS outline; no amber flood fill
      const fg = isPending ? '#F59E0B' : heatmapCellFg(h);
      return `<td class="hm-sub-cell hm-sub-total-cell${isPending ? ' hm-cell-pending' : ''}" style="background:${bg};color:${fg};border-left:${_totBl}">${displayH}</td>`;
    }).join('');
    return `<tr class="hm-sub-row hm-sub-total-row hm-sub-visible">
      <td class="hm-sub-name-cell"><span class="hm-sub-indent hm-sub-total-label">Total</span></td>${cells}</tr>`;
  }
  return '';
}

// Render only the rows currently in (or near) the viewport
function _vsRenderVisible() {
  const tbody = document.getElementById('hmTbody');
  const wrap  = document.querySelector('.hm-scroll-wrap');
  if (!tbody || !wrap) return;

  const n = _vsAllRows.length;
  if (n === 0) { tbody.innerHTML = ''; return; }

  // Compute cumulative row tops
  let y = 0;
  const tops = _vsAllRows.map(r => { const t = y; y += r.height; return t; });
  const totalH = y;

  const scrollTop = wrap.scrollTop;
  const viewH     = wrap.clientHeight || 2000;
  const bufPx     = VS_BUFFER * VS_H_EMP;
  const visTop    = Math.max(0, scrollTop - bufPx);
  const visBot    = scrollTop + viewH + bufPx;

  let first = 0;
  while (first < n && tops[first] + _vsAllRows[first].height <= visTop) first++;
  let last = first;
  while (last < n && tops[last] < visBot) last++;

  const topH = first > 0 ? tops[first] : 0;
  const botH = last < n  ? totalH - tops[last] : 0;

  let html = `<tr><td colspan="${_vsColCount}" style="height:${topH}px;padding:0;border:none;background:transparent"></td></tr>`;
  for (let i = first; i < last; i++) html += _vsRenderRow(_vsAllRows[i]);
  html += `<tr><td colspan="${_vsColCount}" style="height:${botH}px;padding:0;border:none;background:transparent"></td></tr>`;
  tbody.innerHTML = html;
}

function hmVsScroll() {
  if (_editActiveCell) return; // freeze virtual scroll while a cell is being edited
  if (_vsScrollRaf) return;
  _vsScrollRaf = requestAnimationFrame(() => { _vsScrollRaf = null; _vsRenderVisible(); });
}

// ── Tooltip helpers (cell hover) ──────────────────────────────────
let _hmTip = null;

function showHmTooltip(evt, el) {
  if (!_hmTip) { _hmTip = document.createElement('div'); _hmTip.id = 'hmTooltip'; document.body.appendChild(_hmTip); }
  _hmTip.textContent = el.dataset.tip || '';
  _hmTip.style.display = 'block';
  positionHmTooltip(evt);
}
function hideHmTooltip() { if (_hmTip) _hmTip.style.display = 'none'; }
function positionHmTooltip(evt) {
  if (!_hmTip || _hmTip.style.display === 'none') return;
  _hmTip.style.left = Math.min(evt.clientX + 14, window.innerWidth - 220) + 'px';
  _hmTip.style.top  = Math.max(evt.clientY - 50, 8) + 'px';
}

// ── Employee name hover tooltip (300ms delay) ─────────────────────
let _empTipTimer = null;

function showEmpTip(evt, el) {
  clearTimeout(_empTipTimer);
  _empTipTimer = setTimeout(() => {
    if (!_hmTip) { _hmTip = document.createElement('div'); _hmTip.id = 'hmTooltip'; document.body.appendChild(_hmTip); }
    _hmTip.textContent = el.dataset.tip || '';
    _hmTip.style.display = 'block';
    moveEmpTip(evt);
  }, 300);
}
function moveEmpTip(evt) {
  if (!_hmTip || _hmTip.style.display === 'none') return;
  _hmTip.style.left = Math.min(evt.clientX + 16, window.innerWidth - 260) + 'px';
  _hmTip.style.top  = Math.max(evt.clientY - 10, 8) + 'px';
}
function hideEmpTip() { clearTimeout(_empTipTimer); if (_hmTip) _hmTip.style.display = 'none'; }

// ── Populate Quick Fill dropdowns from current heatmap data ───────
function _populateQuickFillDropdowns(data) {
  const empSel = document.getElementById('qfEmployee');
  const projDL = document.getElementById('qfProjectList');
  if (!empSel || !projDL) return;

  const empNames = (data.employees || []).map(e => e.name).sort();
  empSel.innerHTML = '<option value="">Employee…</option>' +
    empNames.map(n => `<option value="${_esc(n)}">${_esc(n)}</option>`).join('');

  const projSet = new Set();
  for (const emp of (data.employees || [])) {
    for (const wkProjs of (emp.weeklyProjects || [])) {
      for (const p of wkProjs) projSet.add(p.project);
    }
  }
  projDL.innerHTML = [...projSet].sort().map(p => `<option value="${_esc(p)}">`).join('');
}

// ── Build heatmap table ───────────────────────────────────────────
function buildHeatmapTable(data) {
  const container = document.getElementById('heatmapContainer');
  if (!container) return;
  const { weeks, employees } = data;

  _populateQuickFillDropdowns(data);

  // Store for virtual scroll
  _vsData = data;

  // Badge + legend stats for week 0
  let bench = 0, under = 0, full = 0, over = 0, totalAvail = 0;
  for (const emp of employees) {
    const h = emp.weeklyHours[0] || 0;
    totalAvail += Math.max(0, 45 - h);
    if (h === 0) bench++; else if (h < 40) under++; else if (h <= 45) full++; else over++;
  }
  const badge = document.getElementById('heatmapBadge');
  if (badge) { badge.textContent = `${totalAvail}h available this week`; badge.className = 'chart-badge'; }

  _hmCurWeek = _computeCurWeekIdx(weeks);
  const wkThs = weeks.map((w, i) =>
    `<th class="hm-week-th dd-clickable${i === _hmCurWeek ? ' hm-col-current' : ''}" onclick="drillHeatmapWeek(${i})" title="Click for week availability">${w}</th>`
  ).join('');

  const swatches = [
    { color: '#3A3D4A', label: '0h — Bench' },
    { color: '#6366F1', label: '1–39h — Under' },
    { color: '#10B981', label: '40–44h — Nominal' },
    { color: '#F59E0B', label: '45h — Full' },
    { color: '#EF4444', label: '46–50h — Over' },
    { color: '#DC2626', label: '51h+ — Over+' },
  ].map(s => `<div class="hm-swatch-item"><span class="hm-swatch-bar" style="background:${s.color}"></span>${s.label}</div>`).join('');

  container.innerHTML = `
    <div class="hm-controls-row">
      <div class="hm-pill-btns">
        <button id="hmToggleAll" class="hm-pill-btn hm-toggle-expand" onclick="hmToggleAll()">⊞ Expand All</button>
      </div>
    </div>
    <div class="hm-scroll-wrap" onscroll="hmVsScroll()">
      <table class="hm-table">
        <thead><tr><th class="hm-name-th">Employee</th>${wkThs}</tr></thead>
        <tbody id="hmTbody"></tbody>
      </table>
    </div>
    <div class="hm-legend">
      <div class="hm-legend-swatches">${swatches}</div>
      <div class="hm-legend-stats">
        <span style="color:#10B981;font-weight:600">${totalAvail}h available this week</span>
        <span style="color:#6B6F76;margin-left:16px">Bench: ${bench} · Under: ${under} · Full/Nominal: ${full} · Overbooked: ${over}</span>
      </div>
      <div class="hm-legend-hint">Hover employee name for details · Click ▶ to expand project breakdown</div>
    </div>`;

  _buildVsAllRows();
  _vsRenderVisible();
  _updateHmPillBtns();
  _updateQuickFillVisibility();
}

// ── Expand / Collapse (virtual-scroll aware) ──────────────────────
function toggleHmExpand(empName) {
  if (_hmExpanded.has(empName)) _hmExpanded.delete(empName);
  else _hmExpanded.add(empName);
  _buildVsAllRows();
  _vsRenderVisible();
  _updateHmPillBtns();
  _updateQuickFillVisibility();
}

function _updateQuickFillVisibility() {
  const bar = document.getElementById('hmQuickFillBar');
  if (!bar) return;
  if (_hmExpanded.size > 0) {
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

function _updateHmPillBtns() {
  const btn = document.getElementById('hmToggleAll');
  if (!btn) return;
  const allNames = _vsData ? _vsData.employees.map(e => e.name) : [];
  // Show "Collapse All" when any row is expanded (mixed or all expanded)
  // Show "Expand All" only when nothing is expanded
  const anyExpanded = _hmExpanded.size > 0;
  if (anyExpanded) {
    btn.textContent = '⊟ Collapse All';
    btn.classList.remove('hm-toggle-expand');
    btn.classList.add('hm-toggle-collapse');
  } else {
    btn.textContent = '⊞ Expand All';
    btn.classList.remove('hm-toggle-collapse');
    btn.classList.add('hm-toggle-expand');
  }
}

function hmToggleAll() {
  const anyExpanded = _hmExpanded.size > 0;
  if (anyExpanded) {
    _hmExpanded.clear();
  } else {
    for (const emp of (_vsData ? _vsData.employees : [])) _hmExpanded.add(emp.name);
  }
  _buildVsAllRows();
  _vsRenderVisible();
  _updateHmPillBtns();
  _updateQuickFillVisibility();
}

// ── Heatmap Drilldown A: Cell click ──────────────────────────────
function drillHeatmapCell(empName, weekIdx) {
  const hm = rawData.heatmap;
  if (!hm) return;
  const emp = hm.employees.find(e => e.name === empName);
  if (!emp) return;
  const week     = hm.weeks[weekIdx];
  const hours    = emp.weeklyHours[weekIdx] || 0;
  const projects = emp.weeklyProjects[weekIdx] || [];
  const avail    = Math.max(0, 45 - hours);
  const stat     = utilStatus(hours);

  const projRows = projects.length
    ? projects.map(p => `<tr><td>${p.project}</td><td><b>${p.hours}h</b></td></tr>`).join('')
    : '<tr><td colspan="2" style="color:#8892B0;text-align:center">No bookings this week</td></tr>';

  openDrilldown(`${empName} — Week of ${week}`, `
    <div class="dd-role-card">
      <div class="dd-role-row"><span>Employee</span><b>${empName}</b></div>
      <div class="dd-role-row"><span>Level</span><b>${emp.level}</b></div>
      <div class="dd-role-row"><span>Skill Set</span><b>${emp.skillSet || '—'}</b></div>
      <div class="dd-role-row"><span>Total Hours</span><b>${hours}h / 45h</b></div>
      <div class="dd-role-row"><span>Status</span><b><span class="dd-badge ${stat.cls}">${stat.label}</span></b></div>
      <div class="dd-role-row"><span>Available Hours</span><b style="color:#A8E6CF">${avail}h remaining</b></div>
    </div>
    <h4 class="dd-section-title">Project Breakdown</h4>
    <table class="dd-table">
      <thead><tr><th>Project</th><th>Hours</th></tr></thead>
      <tbody>${projRows}</tbody>
    </table>`);
}

// ── Heatmap Drilldown B: Employee name click ──────────────────────
function drillHeatmapEmployee(empName) {
  const hm = rawData.heatmap;
  if (!hm) return;
  const emp = hm.employees.find(e => e.name === empName);
  if (!emp) return;

  const total    = emp.weeklyHours.reduce((a, b) => a + b, 0);
  const avg      = emp.weeklyHours.length ? Math.round(total / emp.weeklyHours.length * 10) / 10 : 0;
  const peak     = Math.max(...emp.weeklyHours);
  const peakIdx  = emp.weeklyHours.indexOf(peak);
  const peakWeek = hm.weeks[peakIdx] || '—';
  const benchWks = emp.weeklyHours.filter(h => h < 10).length;

  const tableRows = hm.weeks.map((week, i) => {
    const h = emp.weeklyHours[i];
    const ps = emp.weeklyProjects[i];
    const stat = utilStatus(h);
    const projText = ps.length
      ? ps.map(p => `${p.project} (${p.hours}h)`).join(', ')
      : '<span style="color:#8892B0">No bookings</span>';
    const bc = heatmapCellBorder(h);
    return `<tr>
      <td>${week}</td>
      <td style="font-size:12px">${projText}</td>
      <td><span style="border-left:3px solid ${bc};padding-left:6px;color:#E2E8F0;font-weight:600;font-size:12px">${h}h</span></td>
      <td><span class="dd-badge ${stat.cls}">${stat.label}</span></td>
    </tr>`;
  }).join('');

  openDrilldown(`${empName} — Full Booking History`, `
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      <div class="dd-stat"><div class="dd-stat-value">${avg}h</div><div class="dd-stat-label">Avg / Week</div></div>
      <div class="dd-stat"><div class="dd-stat-value">${peak}h</div><div class="dd-stat-label">Peak (${peakWeek})</div></div>
      <div class="dd-stat"><div class="dd-stat-value">${benchWks}</div><div class="dd-stat-label">Bench Weeks</div></div>
    </div>
    <table class="dd-table">
      <thead><tr><th>Week</th><th>Projects</th><th>Hours</th><th>Status</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>`);
}

// ── Heatmap Drilldown C: Week header click ────────────────────────
function drillHeatmapWeek(weekIdx) {
  const hm = rawData.heatmap;
  if (!hm) return;
  const week = hm.weeks[weekIdx];

  const byLevel = {};
  for (const emp of hm.employees) {
    const h = emp.weeklyHours[weekIdx] || 0;
    const avail = Math.max(0, 45 - h);
    if (!byLevel[emp.level]) byLevel[emp.level] = [];
    byLevel[emp.level].push({ name: emp.name, skillSet: emp.skillSet, hours: h, avail });
  }
  for (const level of Object.keys(byLevel))
    byLevel[level].sort((a, b) => b.avail - a.avail);

  const totalAvail = hm.employees.reduce((s, e) => s + Math.max(0, 45 - (e.weeklyHours[weekIdx] || 0)), 0);

  let html = `<div style="margin-bottom:16px"><span style="color:#A8E6CF;font-weight:700;font-size:15px">${totalAvail}h</span> <span style="color:#8892B0">total available across ${hm.employees.length} employees</span></div>`;

  for (const level of LEVEL_ORDER) {
    const emps = byLevel[level];
    if (!emps || !emps.length) continue;
    const rows = emps.map(e => {
      const stat = utilStatus(e.hours);
      return `<tr>
        <td>${e.name}</td>
        <td style="font-size:12px;color:#8892B0">${e.skillSet || '—'}</td>
        <td>${e.hours}h</td>
        <td style="color:#A8E6CF;font-weight:600">${e.avail}h free</td>
        <td><span class="dd-badge ${stat.cls}">${stat.label}</span></td>
      </tr>`;
    }).join('');
    html += `<h4 class="dd-section-title" style="margin-top:16px">${level}</h4>
      <table class="dd-table">
        <thead><tr><th>Employee</th><th>Skill Set</th><th>Booked</th><th>Available</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  openDrilldown(`Week of ${week} — Availability Summary`, html);
}

// ── Needs Tab AI Recommendations State ───────────────────────────
const _needs = {
  recommendations: null,  // cached from /api/recommendations; array matching demand order
  loadState: 'idle',      // 'idle' | 'loading' | 'loaded' | 'error'
  expanded: new Set(),    // set of currently expanded roleIdx
  pending: [],            // [{ needIdx, need, consultant }]
};

// ── Needs Coverage ────────────────────────────────────────────────
function renderCoverageChart(coverage) {
  if (charts.coverage) charts.coverage.destroy();
  if (!coverage) return;

  // Reset recommendations cache on data refresh (preserve pending)
  _needs.recommendations = null;
  _needs.loadState = 'idle';
  _needs.expanded.clear();

  const summary      = coverage.summary || {};
  const fullyMet     = summary.fully_met    || 0;
  const partiallyMet = summary.partially_met || 0;
  const unmet        = summary.unmet        || 0;
  const total        = fullyMet + partiallyMet + unmet;

  const badge = document.getElementById('coverageBadge');
  badge.textContent = total ? `${total} open needs` : 'No open needs';
  badge.className   = 'chart-badge ' + (unmet === 0 ? 'ok' : unmet < total ? 'warn' : 'danger');

  charts.coverage = new Chart(document.getElementById('chartCoverage'), {
    type: 'doughnut',
    data: {
      labels: ['Fully Met', 'Partially Met', 'Unmet'],
      datasets: [{
        data: total === 0 ? [1, 0, 0] : [fullyMet, partiallyMet, unmet],
        backgroundColor: total === 0
          ? ['#2E3250', '#2E3250', '#2E3250']
          : ['#A8E6CF', '#FFF3A3', '#FFB3B3'],
        borderWidth: 0,
        hoverOffset: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: window.devicePixelRatio || 2,
      cutout: '62%',
      animation: { animateRotate: true, animateScale: false },
      hover: { mode: null },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
    },
    plugins: [{
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea: { width, height, left, top } } = chart;
        ctx.save();
        const cx = left + width / 2;
        const cy = top  + height / 2;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 30px Inter, sans-serif`;
        ctx.fillStyle = total === 0 ? '#8892B0' : '#FFFFFF';
        ctx.fillText(total === 0 ? '—' : `${total}`, cx, cy - 10);
        ctx.font = `400 11px Inter, sans-serif`;
        ctx.fillStyle = '#8892B0';
        ctx.fillText('open needs', cx, cy + 14);
        ctx.restore();
      },
    }],
  });

  const legendEl = document.getElementById('coverageLegend');
  if (legendEl) {
    const colors = total === 0 ? ['#2E3250', '#2E3250', '#2E3250'] : ['#A8E6CF', '#FFF3A3', '#FFB3B3'];
    const items  = [
      { label: 'Fully Met',     count: fullyMet,     color: colors[0] },
      { label: 'Partially Met', count: partiallyMet, color: colors[1] },
      { label: 'Unmet',         count: unmet,         color: colors[2] },
    ];
    legendEl.innerHTML = items.map(it =>
      `<div class="cov-legend-item">
        <span class="cov-legend-dot" style="background:${it.color}"></span>
        <span class="cov-legend-label">${it.label}</span>
        <span class="cov-legend-count">${it.count}</span>
      </div>`
    ).join('');
  }

  const tableEl = document.getElementById('coverageTable');
  if (!coverage.roles || !coverage.roles.length) {
    tableEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:8px 0">No open needs</p>';
    return;
  }

  const fmtDate = (s) => {
    if (!s) return '—';
    const p = String(s).split('/');
    if (p.length < 2) return s;
    const yr = p[2] ? '/' + p[2].slice(-2) : '';
    return `${parseInt(p[0])}/${parseInt(p[1])}${yr}`;
  };

  const statusBadge = (status) => {
    if (status === 'fully_met')    return '<span class="badge-covered">Fully Met</span>';
    if (status === 'partially_met') return '<span class="badge-partial">Partial</span>';
    return '<span class="badge-uncovered">Unmet</span>';
  };

  const rows = coverage.roles.map((r, i) => `
    <tr class="dd-clickable need-row" onclick="toggleNeedExpansion(${i}, event)" title="Click to see AI-matched consultants">
      <td class="col-project"><span class="need-chevron" id="need-chev-${i}">›</span>${r.project || '—'}</td>
      <td class="col-skill">${r.skillSet || '—'}</td>
      <td>${r.level || '—'}</td>
      <td class="col-center">${r.hoursPerWeek ? r.hoursPerWeek + 'h' : '—'}</td>
      <td class="col-center">${fmtDate(r.startDate)}</td>
      <td class="col-center">${fmtDate(r.endDate)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>
    <tr class="need-expansion-row hidden" id="need-exp-${i}">
      <td colspan="7" class="need-expansion-cell">
        <div class="need-match-panel" id="need-match-panel-${i}">
          <div class="need-match-loading">Finding matches…</div>
        </div>
      </td>
    </tr>
  `).join('');

  tableEl.innerHTML = `
    <table>
      <thead><tr>
        <th>Project</th><th>Skill</th><th>Level</th>
        <th class="col-center">Hrs/Wk</th>
        <th class="col-center">Start</th>
        <th class="col-center">End</th>
        <th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── AI Recommendations: Expandable Row Logic ─────────────────────

function toggleNeedExpansion(roleIdx, event) {
  if (event) event.stopPropagation();
  const row  = document.getElementById(`need-exp-${roleIdx}`);
  const chev = document.getElementById(`need-chev-${roleIdx}`);
  if (!row) return;

  const isOpen = !row.classList.contains('hidden');
  if (isOpen) {
    row.classList.add('hidden');
    _needs.expanded.delete(roleIdx);
    if (chev) chev.classList.remove('open');
    return;
  }

  row.classList.remove('hidden');
  _needs.expanded.add(roleIdx);
  if (chev) chev.classList.add('open');

  if (_needs.loadState === 'loaded') {
    renderNeedMatchPanel(roleIdx);
  } else if (_needs.loadState === 'idle') {
    _needs.loadState = 'loading';
    fetch('/api/recommendations')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        _needs.recommendations = data.needs;
        _needs.loadState = 'loaded';
        _needs.expanded.forEach(idx => renderNeedMatchPanel(idx));
      })
      .catch(err => {
        _needs.loadState = 'error';
        _needs.expanded.forEach(idx => {
          const panel = document.getElementById(`need-match-panel-${idx}`);
          if (panel) panel.innerHTML = `<div class="need-match-error">Failed to load: ${_esc(err.message)}</div>`;
        });
      });
  }
  // If 'loading': panel already shows "Finding matches…" — will render when fetch completes
}

function renderNeedMatchPanel(roleIdx) {
  const panel = document.getElementById(`need-match-panel-${roleIdx}`);
  if (!panel || !_needs.recommendations) return;

  const needData = _needs.recommendations[roleIdx];
  if (!needData) {
    panel.innerHTML = '<div class="need-match-empty">No match data available.</div>';
    return;
  }

  const { need, matches } = needData;
  const hoursNeeded = Number(need.hoursPerWeek) || 45;

  if (!matches || matches.length === 0) {
    panel.innerHTML = '<div class="need-match-empty">No available consultants match this need.</div>';
    return;
  }

  const acceptedNames = new Set(
    _needs.pending.filter(p => p.needIdx === roleIdx).map(p => p.consultant.employeeName)
  );

  const cards = matches.map((m, mi) => {
    const isAccepted  = acceptedNames.has(m.employeeName);
    const badgeClass  = m.availableHours >= hoursNeeded        ? 'badge-avail-green'
                      : m.availableHours >= hoursNeeded - 10   ? 'badge-avail-yellow'
                      : 'badge-avail-coral';
    return `
      <div class="match-card">
        <div class="match-card-info">
          <div class="match-card-name">${_esc(m.employeeName)}</div>
          <div class="match-card-meta">${_esc(m.level)} · ${_esc(m.skillSet)}</div>
          <div class="match-card-reasoning">${_esc(m.reasoning || '')}</div>
        </div>
        <div class="match-card-right">
          <span class="match-avail-badge ${badgeClass}">${m.availableHours}h avail</span>
          <span class="match-util">${m.currentUtilization}% utilized</span>
          ${isAccepted
            ? '<button class="match-accept-btn accepted" disabled>Accepted</button>'
            : `<button class="match-accept-btn" onclick="acceptMatch(${roleIdx}, ${mi}, event)">Accept</button>`
          }
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `<div class="match-cards-container">${cards}</div>`;
}

function acceptMatch(needIdx, matchIdx, event) {
  if (event) event.stopPropagation();
  if (!_needs.recommendations) return;
  const needData = _needs.recommendations[needIdx];
  if (!needData) return;
  const match = needData.matches[matchIdx];
  if (!match) return;

  const already = _needs.pending.some(
    p => p.needIdx === needIdx && p.consultant.employeeName === match.employeeName
  );
  if (already) return;

  _needs.pending.push({ needIdx, need: needData.need, consultant: match });
  updateNeedsPendingBar();
  renderNeedMatchPanel(needIdx);
}

function removeFromNeedsPending(idx, event) {
  if (event) event.stopPropagation();
  const item = _needs.pending[idx];
  _needs.pending.splice(idx, 1);
  updateNeedsPendingBar();
  if (item && _needs.expanded.has(item.needIdx)) renderNeedMatchPanel(item.needIdx);
}

function updateNeedsPendingBar() {
  const bar     = document.getElementById('needsPendingBar');
  const countEl = document.getElementById('needsPendingCount');
  const itemsEl = document.getElementById('needsPendingItems');
  if (!bar || !countEl || !itemsEl) return;

  const n = _needs.pending.length;
  if (n === 0) { bar.classList.add('hidden'); return; }

  bar.classList.remove('hidden');
  countEl.textContent  = `${n} assignment${n !== 1 ? 's' : ''} pending`;
  countEl.style.color  = '';
  itemsEl.innerHTML = _needs.pending.map((p, i) => `
    <span class="pending-item">
      <span class="pending-item-text">${_esc(p.consultant.employeeName)} → ${_esc(p.need.projectName)}</span>
      <button class="pending-item-remove" onclick="removeFromNeedsPending(${i}, event)" title="Remove">✕</button>
    </span>
  `).join('');
}

function clearNeedsPending() {
  _needs.pending = [];
  updateNeedsPendingBar();
  _needs.expanded.forEach(idx => renderNeedMatchPanel(idx));
}

async function saveAllAssignments() {
  const saveBtn = document.getElementById('needsSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  const changes = _needs.pending.map(p => ({
    type:         'add',
    employeeName: p.consultant.employeeName,
    project:      p.need.projectName,
    skillSet:     p.consultant.skillSet,
    startDate:    p.need.startDate,
    endDate:      p.need.endDate,
    hoursPerWeek: Number(p.need.hoursPerWeek),
  }));

  try {
    const res  = await fetch('/api/supply/update', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ changes }),
    });
    const data = await res.json();
    if (res.status === 423) {
      const countEl = document.getElementById('needsPendingCount');
      if (countEl) { countEl.textContent = data.error; countEl.style.color = 'var(--coral)'; }
      return;
    }
    if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);

    const savedCount = _needs.pending.length;
    _needs.pending = [];
    updateNeedsPendingBar();
    await loadDashboard();

    // Brief success flash
    const bar     = document.getElementById('needsPendingBar');
    const countEl = document.getElementById('needsPendingCount');
    if (bar && countEl) {
      bar.classList.remove('hidden');
      countEl.textContent = `${savedCount} assignment${savedCount !== 1 ? 's' : ''} saved`;
      countEl.style.color = 'var(--mint)';
      setTimeout(() => { bar.classList.add('hidden'); countEl.style.color = ''; }, 3000);
    }
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save All'; }
  }
}

// ── Bench Report ──────────────────────────────────────────────────
function renderBenchReport(benchReport) {
  const el    = document.getElementById('benchContent');
  const badge = document.getElementById('benchBadge');
  if (!el && !badge) return; // bench card removed from DOM

  if (!benchReport || !benchReport.length) {
    if (badge) { badge.textContent = 'No one on bench'; badge.className = 'chart-badge ok'; }
    if (el) el.innerHTML = `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="18" stroke="#e2e8f0" stroke-width="2"/>
          <path d="M14 20l4 4 8-8" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <p>All employees are currently booked.</p>
      </div>`;
    return;
  }

  const totalBench = benchReport.reduce((s, g) => s + g.employees.length, 0);
  if (badge) { badge.textContent = `${totalBench} employee${totalBench !== 1 ? 's' : ''}`; badge.className = 'chart-badge warn'; }
  if (!el) return;

  el.innerHTML = benchReport.map(group => {
    const empRows = group.employees.map(emp => {
      const initials = emp.name
        ? emp.name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
        : '?';
      const barPct = Math.min(100, Math.round((emp.recentWeekHours / 45) * 100));
      const barColor = emp.recentWeekHours === 0 ? '#FFB3B3' : '#FFF3A3';
      const safeName = (emp.name || '').replace(/'/g, "\\'");
      return `
        <div class="bench-employee dd-clickable" onclick="drillBench('${safeName}')" title="Click for booking detail">
          <div class="bench-avatar">${initials}</div>
          <div class="bench-emp-info">
            <div class="bench-emp-name">${emp.name}</div>
            <div class="bench-emp-sub">${emp.recentWeekHours}h this week</div>
          </div>
          <div class="bench-hours">
            <div class="bench-hours-value" style="color:${barColor}">${emp.recentWeekHours}h</div>
            <div class="bench-hours-label">this week</div>
            <div class="bench-bar-wrap">
              <div class="bench-bar-fill" style="width:${barPct}%;background:${barColor}"></div>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="bench-group">
        <div class="bench-group-label">${group.skillSet}</div>
        ${empRows}
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════
// ── Drilldown Modal ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function openDrilldown(title, html) {
  document.getElementById('drilldownTitle').textContent = title;
  document.getElementById('drilldownBody').innerHTML    = html;
  document.getElementById('drilldownOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDrilldown() {
  document.getElementById('drilldownOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('drilldownOverlay')) closeDrilldown();
}

// ── Drilldown 1: Utilization by Level ─────────────────────────────
function drillUtilization(level) {
  const levelMap = {};
  for (const emp of rawData.employees) levelMap[emp.employeeName] = emp.level;

  const empAverages = buildEmpAverages();

  const empsAtLevel = rawData.employees.filter(e => e.level === level);
  if (!empsAtLevel.length) {
    openDrilldown(`${level} — Utilization Detail`,
      '<p class="dd-empty">No employees found at this level.</p>');
    return;
  }

  const rows = empsAtLevel.map(emp => {
    const info = empAverages[emp.employeeName];
    if (!info) {
      return `<tr>
        <td>${emp.employeeName}</td>
        <td>—</td>
        <td><span class="dd-badge status-bench">Bench</span></td>
        <td>—</td>
        <td>—</td>
      </tr>`;
    }
    const stat     = utilStatus(info.avg);
    const projects = info.projects.join(', ') || '—';
    return `<tr>
      <td>${emp.employeeName}</td>
      <td>${info.avg}h/wk</td>
      <td><span class="dd-badge ${stat.cls}">${stat.label}</span></td>
      <td style="font-size:12px;color:#8892B0">${projects}</td>
      <td>${info.skillSet || '—'}</td>
    </tr>`;
  }).join('');

  openDrilldown(`${level} — Utilization Detail`, `
    <table class="dd-table">
      <thead><tr>
        <th>Employee</th><th>Avg Hours</th><th>Status</th><th>Projects</th><th>Skill Set</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

// ── Drilldown 2: Bench Employee Booking Detail ────────────────────
function drillBench(employeeName) {
  const rows = rawData.supply.filter(r => r.employeeName === employeeName);
  if (!rows.length) {
    openDrilldown(`${employeeName} — Booking Detail`,
      '<p class="dd-empty">No supply data found for this employee.</p>');
    return;
  }

  const weekKeys = Object.keys(rows[0].weeklyHours);

  const tableRows = weekKeys.map(wk => {
    const breakdown = rows
      .map(r => ({ project: r.projectAssigned || '—', hrs: r.weeklyHours[wk] || 0 }))
      .filter(p => p.hrs > 0);
    const total = breakdown.reduce((s, p) => s + p.hrs, 0);
    const stat  = utilStatus(total);
    const proj  = breakdown.length
      ? breakdown.map(p => `${p.project} (${p.hrs}h)`).join(', ')
      : '<span style="color:#8892B0">No bookings</span>';
    return `<tr>
      <td>${fmtWeek(wk)}</td>
      <td style="font-size:12px">${proj}</td>
      <td><b>${total}h</b></td>
      <td><span class="dd-badge ${stat.cls}">${stat.label}</span></td>
    </tr>`;
  }).join('');

  openDrilldown(`${employeeName} — Booking Detail`, `
    <table class="dd-table">
      <thead><tr>
        <th>Week</th><th>Project Breakdown</th><th>Total Hours</th><th>Status</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>`);
}

// ── Drilldown 3: Cliffs Roll-off Detail ───────────────────────────
function drillCliff(weekIndex) {
  const cliffs  = rawData.cliffs;
  const thisWkObj = cliffs[weekIndex];
  const prevWkObj = cliffs[weekIndex - 1];
  if (!thisWkObj) return;

  const label   = fmtWeek(thisWkObj.week);
  const thisWk  = thisWkObj.week;
  const prevWk  = prevWkObj ? prevWkObj.week : null;

  // Per-employee hours this week and last week
  const thisHrs = {}, prevHrs = {}, empInfo = {};
  for (const row of rawData.supply) {
    const n = row.employeeName;
    thisHrs[n] = (thisHrs[n] || 0) + (row.weeklyHours[thisWk] || 0);
    if (prevWk) prevHrs[n] = (prevHrs[n] || 0) + (row.weeklyHours[prevWk] || 0);
    if (!empInfo[n]) empInfo[n] = { skillSet: row.skillSet, projects: new Set() };
    if (row.projectAssigned && (row.weeklyHours[prevWk] || 0) > 0)
      empInfo[n].projects.add(row.projectAssigned);
  }

  const levelMap = {};
  for (const emp of rawData.employees) levelMap[emp.employeeName] = emp.level;

  if (!prevWk) {
    openDrilldown(`Week ending ${label} — Roll-off Detail`,
      '<p class="dd-empty">No previous week available for comparison.</p>');
    return;
  }

  const rollOffs = Object.entries(thisHrs)
    .filter(([n, h]) => (prevHrs[n] || 0) > 0 && h < (prevHrs[n] || 0) - 10)
    .map(([n, h]) => ({
      name: n,
      prev: prevHrs[n] || 0,
      curr: h,
      drop: (prevHrs[n] || 0) - h,
      avail: Math.max(0, 45 - h),
      level: levelMap[n] || '—',
      skillSet: empInfo[n]?.skillSet || '—',
      projects: [...(empInfo[n]?.projects || [])].join(', ') || '—',
    }))
    .sort((a, b) => b.drop - a.drop);

  if (!rollOffs.length) {
    openDrilldown(`Week ending ${label} — Roll-off Detail`,
      '<p class="dd-empty">No significant roll-offs detected for this week.</p>');
    return;
  }

  const tableRows = rollOffs.map(r => `<tr>
    <td>${r.name}</td>
    <td style="font-size:12px;color:#8892B0">${r.projects}</td>
    <td>${r.prev}h → ${r.curr}h <span style="color:#FFB3B3;font-size:11px">−${r.drop}h</span></td>
    <td>${r.level}</td>
    <td>${r.skillSet}</td>
    <td style="color:#A8E6CF;font-weight:600">${r.avail}h</td>
  </tr>`).join('');

  openDrilldown(`Week ending ${label} — Roll-off Detail`, `
    <table class="dd-table">
      <thead><tr>
        <th>Employee</th><th>Rolling Off From</th><th>Hours Change</th>
        <th>Level</th><th>Skill Set</th><th>Available</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>`);
}

// ── Drilldown 4: Needs Coverage — Role Detail ─────────────────────
function drillCoverage(roleIdx) {
  const role = rawData.coverageRoles[roleIdx];
  if (!role) return;

  const statusLabel = {
    fully_met:    '<span class="badge-covered" style="font-size:13px;padding:4px 12px">Fully Met</span>',
    partially_met: '<span style="background:#FFF3A3;color:#7a6500;padding:4px 12px;border-radius:10px;font-size:13px;font-weight:600">Partially Met</span>',
    unmet:        '<span class="badge-uncovered" style="font-size:13px;padding:4px 12px">Unmet</span>',
  }[role.status] || '—';

  const roleCard = `
    <div class="dd-role-card">
      <div class="dd-role-row"><span>Status</span><b>${statusLabel}</b></div>
      <div class="dd-role-row"><span>Project</span><b>${role.project || '—'}</b></div>
      <div class="dd-role-row"><span>Level Needed</span><b>${role.level || '—'}</b></div>
      <div class="dd-role-row"><span>Skill Set</span><b>${role.skillSet || '—'}</b></div>
      <div class="dd-role-row"><span>Dates</span><b>${role.startDate || '—'} – ${role.endDate || '—'}</b></div>
      <div class="dd-role-row"><span>Hours Per Week</span><b>${role.hoursPerWeek || '—'}h/wk</b></div>
    </div>`;

  let matchSection = '';
  if (role.bestMatch) {
    const bm = role.bestMatch;
    const coverageText = role.status === 'fully_met'
      ? `Covers all ${bm.totalWeeks} weeks in range`
      : `Covers ${bm.availableWeeks} of ${bm.totalWeeks} weeks at required ${role.hoursPerWeek}h/wk`;
    matchSection = `
      <h4 class="dd-section-title">Best Match</h4>
      <table class="dd-table">
        <thead><tr><th>Employee</th><th>Coverage</th></tr></thead>
        <tbody><tr class="dd-best-match">
          <td>${bm.employeeName} <span class="dd-badge status-full" style="margin-left:6px">Best Match</span></td>
          <td style="color:#A8E6CF;font-weight:600">${coverageText}</td>
        </tr></tbody>
      </table>`;
  } else {
    const reason = `No ${role.level} with ${role.skillSet} available at ${role.hoursPerWeek}h/wk`;
    matchSection = `<p class="dd-empty" style="color:#FFB3B3">${reason}</p>`;
  }

  openDrilldown(
    `${role.level || '—'} — ${role.skillSet || '—'}`,
    roleCard + matchSection
  );
}

// ══════════════════════════════════════════════════════════════════
// ── KPI Card Drilldowns ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

const LEVEL_ORDER = ['Partner/MD', 'Senior Manager', 'Manager', 'Senior Consultant', 'Consultant', 'Analyst'];

// ── KPI Drilldown 1: Total Headcount ──────────────────────────────
function drillHeadcount() {
  if (!rawData.employees.length) {
    openDrilldown('All Employees — Headcount Detail',
      '<p class="dd-empty">No employee data loaded yet.</p>');
    return;
  }

  const empAverages = buildEmpAverages();
  const sorted = [...rawData.employees].sort(
    (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)
  );

  const rows = sorted.map(emp => {
    const info = empAverages[emp.employeeName];
    const avg  = info ? info.avg : 0;
    const stat = utilStatus(avg);
    const projects = info ? (info.projects.join(', ') || '—') : '—';
    const skillSet = info ? (info.skillSet || '—') : '—';
    return `<tr>
      <td>${emp.employeeName}</td>
      <td style="color:#8892B0;font-size:12px">${emp.level}</td>
      <td style="font-size:12px">${skillSet}</td>
      <td>${avg}h/wk</td>
      <td><span class="dd-badge ${stat.cls}">${stat.label}</span></td>
      <td style="font-size:12px;color:#8892B0">${projects}</td>
    </tr>`;
  }).join('');

  openDrilldown(`All Employees — Headcount Detail (${sorted.length})`, `
    <table class="dd-table">
      <thead><tr>
        <th>Employee</th><th>Level</th><th>Skill Set</th>
        <th>Avg Hours</th><th>Status</th><th>Active Projects</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

// ── KPI Drilldown 2: Avg Utilization ─────────────────────────────
function drillUtilizationKPI() {
  if (!rawData.supply.length) {
    openDrilldown('Utilization Breakdown — All Employees',
      '<p class="dd-empty">No supply data loaded yet.</p>');
    return;
  }

  const levelMap   = {};
  for (const emp of rawData.employees) levelMap[emp.employeeName] = emp.level;

  // Get the two most recent week keys for trend
  const weekKeys = rawData.supply.length ? Object.keys(rawData.supply[0].weeklyHours) : [];
  const lastWk   = weekKeys[weekKeys.length - 1];
  const prevWk   = weekKeys[weekKeys.length - 2];

  // Per-employee week totals
  const thisWkHrs = {}, prevWkHrs = {};
  for (const row of rawData.supply) {
    const n = row.employeeName;
    thisWkHrs[n] = (thisWkHrs[n] || 0) + (row.weeklyHours[lastWk] || 0);
    if (prevWk) prevWkHrs[n] = (prevWkHrs[n] || 0) + (row.weeklyHours[prevWk] || 0);
  }

  const empAverages = buildEmpAverages();
  const allEmps = Object.entries(empAverages)
    .map(([name, info]) => ({
      name,
      level:    levelMap[name] || '—',
      avg:      info.avg,
      utilPct:  Math.round((info.avg / 45) * 100),
      stat:     utilStatus(info.avg),
      thisWk:   thisWkHrs[name] || 0,
      prevWk:   prevWk ? (prevWkHrs[name] || 0) : null,
    }))
    .sort((a, b) => b.utilPct - a.utilPct);

  const totalAvg = allEmps.length
    ? Math.round(allEmps.reduce((s, e) => s + e.utilPct, 0) / allEmps.length)
    : 0;

  const rows = allEmps.map(e => {
    let trend = '';
    if (e.prevWk !== null) {
      const delta = e.thisWk - e.prevWk;
      if (delta > 0)       trend = `<span style="color:#A8E6CF;font-size:11px">▲ +${delta}h</span>`;
      else if (delta < 0)  trend = `<span style="color:#FFB3B3;font-size:11px">▼ ${delta}h</span>`;
      else                 trend = `<span style="color:#8892B0;font-size:11px">— 0h</span>`;
    }
    return `<tr>
      <td>${e.name}</td>
      <td style="color:#8892B0;font-size:12px">${e.level}</td>
      <td>${e.avg}h/wk</td>
      <td><b>${e.utilPct}%</b></td>
      <td><span class="dd-badge ${e.stat.cls}">${e.stat.label}</span></td>
      <td>${trend}</td>
    </tr>`;
  }).join('');

  const summary = `<tr style="border-top:1px solid #2E3250;font-weight:600">
    <td colspan="3" style="color:#8892B0;padding-top:12px">Overall Average</td>
    <td style="padding-top:12px"><b>${totalAvg}%</b></td>
    <td colspan="2"></td>
  </tr>`;

  openDrilldown('Utilization Breakdown — All Employees', `
    <table class="dd-table">
      <thead><tr>
        <th>Employee</th><th>Level</th><th>Avg Hours</th>
        <th>Util %</th><th>Status</th><th>Trend vs Last Wk</th>
      </tr></thead>
      <tbody>${rows}${summary}</tbody>
    </table>`);
}

// ── KPI Drilldown 3: On Bench ────────────────────────────────────
function drillBenchKPI() {
  if (!rawData.supply.length) {
    openDrilldown('Bench Report — Available Resources',
      '<p class="dd-empty">No supply data loaded yet.</p>');
    return;
  }

  const levelMap = {};
  for (const emp of rawData.employees) levelMap[emp.employeeName] = emp.level;

  const weekKeys = rawData.supply.length ? Object.keys(rawData.supply[0].weeklyHours) : [];

  // Per-employee per-week totals
  const empWeekTotals = {};
  const empSkillSet   = {};
  for (const row of rawData.supply) {
    const n = row.employeeName;
    if (!empWeekTotals[n]) empWeekTotals[n] = {};
    empSkillSet[n] = row.skillSet;
    for (const [wk, hrs] of Object.entries(row.weeklyHours))
      empWeekTotals[n][wk] = (empWeekTotals[n][wk] || 0) + (hrs || 0);
  }

  // Consecutive low weeks (< 10h, counting back from most recent)
  function consecutiveLow(name) {
    let count = 0;
    for (let i = weekKeys.length - 1; i >= 0; i--) {
      if ((empWeekTotals[name]?.[weekKeys[i]] || 0) < 10) count++;
      else break;
    }
    return count;
  }

  // Last project where employee had hours
  function lastProject(name) {
    for (let i = weekKeys.length - 1; i >= 0; i--) {
      const wk = weekKeys[i];
      const active = rawData.supply.find(
        r => r.employeeName === name && (r.weeklyHours[wk] || 0) > 0
      );
      if (active) return active.projectAssigned || '—';
    }
    return 'No history';
  }

  // Filter to employees with current week < 10h
  const lastWk = weekKeys[weekKeys.length - 1];
  const benched = Object.entries(empWeekTotals)
    .filter(([n]) => (empWeekTotals[n][lastWk] || 0) < 10)
    .map(([n]) => ({
      name:        n,
      level:       levelMap[n] || '—',
      skillSet:    empSkillSet[n] || '—',
      currentHrs:  empWeekTotals[n][lastWk] || 0,
      consecutive: consecutiveLow(n),
      lastProject: lastProject(n),
    }))
    .sort((a, b) => b.consecutive - a.consecutive || a.currentHrs - b.currentHrs);

  if (!benched.length) {
    openDrilldown('Bench Report — Available Resources',
      '<p class="dd-empty">No employees with low hours this week.</p>');
    return;
  }

  const rows = benched.map(e => {
    const highlight = e.consecutive >= 2 ? 'style="background:rgba(255,179,179,0.08)"' : '';
    const warnIcon  = e.consecutive >= 2
      ? '<span style="color:#FFB3B3;margin-left:4px;font-size:11px">●</span>' : '';
    return `<tr ${highlight}>
      <td>${e.name}${warnIcon}</td>
      <td style="color:#8892B0;font-size:12px">${e.level}</td>
      <td style="font-size:12px">${e.skillSet}</td>
      <td style="color:${e.currentHrs === 0 ? '#FFB3B3' : '#FFF3A3'};font-weight:600">${e.currentHrs}h</td>
      <td>${e.consecutive} wk${e.consecutive !== 1 ? 's' : ''}</td>
      <td style="font-size:12px;color:#8892B0">${e.lastProject}</td>
    </tr>`;
  }).join('');

  const legend = benched.some(e => e.consecutive >= 2)
    ? '<p style="font-size:11px;color:#FFB3B3;margin-bottom:12px">● Benched 2+ consecutive weeks</p>'
    : '';

  openDrilldown(`Bench Report — Available Resources (${benched.length})`,
    legend + `
    <table class="dd-table">
      <thead><tr>
        <th>Employee</th><th>Level</th><th>Skill Set</th>
        <th>This Week</th><th>Consecutive</th><th>Last Active Project</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

// ── KPI Drilldown 4: Open Demand Roles ───────────────────────────
function drillDemandKPI() {
  const roles = rawData.coverageRoles;
  if (!roles.length) {
    openDrilldown('Open Projects — All Roles',
      '<p class="dd-empty">No project data loaded yet.</p>');
    return;
  }

  const statusBadge = (status) => {
    if (status === 'fully_met')    return '<span class="dd-badge status-full">Fully Met</span>';
    if (status === 'partially_met') return '<span class="dd-badge status-under">Partially Met</span>';
    return '<span class="dd-badge status-bench">Unmet</span>';
  };

  const rows = roles.map((role, i) => {
    const bm = role.bestMatch;
    let matchCell = '—';
    if (bm) {
      const weeks = role.status === 'fully_met'
        ? `all ${bm.totalWeeks} wks`
        : `${bm.availableWeeks}/${bm.totalWeeks} wks`;
      matchCell = `${bm.employeeName} <span style="font-size:11px;color:#8892B0">(${weeks})</span>`;
    } else {
      matchCell = `<span style="font-size:11px;color:#FFB3B3">No ${role.level} with ${role.skillSet}</span>`;
    }
    const rowStyle = role.status === 'fully_met'
      ? 'style="background:rgba(168,230,207,0.05)"'
      : role.status === 'unmet' ? 'style="background:rgba(255,179,179,0.05)"' : '';
    return `<tr ${rowStyle} class="dd-clickable" onclick="drillCoverage(${i})" title="Click for detail">
      <td style="font-size:12px">${role.project || '—'}</td>
      <td style="color:#8892B0;font-size:12px">${role.level || '—'}</td>
      <td style="font-size:12px">${role.skillSet || '—'}</td>
      <td style="font-size:11px;color:#8892B0">${role.startDate || '—'} – ${role.endDate || '—'}</td>
      <td style="font-size:12px">${role.hoursPerWeek || '—'}h/wk</td>
      <td>${statusBadge(role.status)}</td>
      <td style="font-size:12px">${matchCell}</td>
    </tr>`;
  }).join('');

  const fullyMet    = roles.filter(r => r.status === 'fully_met').length;
  const partiallyMet = roles.filter(r => r.status === 'partially_met').length;
  const unmet       = roles.filter(r => r.status === 'unmet').length;

  const summary = `
    <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      <span class="dd-badge status-full">Fully Met: ${fullyMet}</span>
      <span class="dd-badge status-under" style="background:#FFF3A380;color:#7a6500">Partially Met: ${partiallyMet}</span>
      <span class="dd-badge status-bench">Unmet: ${unmet}</span>
    </div>`;

  openDrilldown(`Open Projects — All Roles (${roles.length})`,
    summary + `
    <table class="dd-table">
      <thead><tr>
        <th>Project</th><th>Level</th><th>Skill Set</th><th>Dates</th><th>Hrs/Wk</th><th>Status</th><th>Best Match</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

// ── Ask Claude — Dynamic Suggested Questions ──────────────────────
const STATIC_FALLBACK_QUESTIONS = [
  'Who has the most available capacity this week?',
  'Which projects have unmet staffing needs?',
  'Who is rolling off a project in the next 2 weeks?',
  'What is our current overall utilization rate?',
  'Which employees are overbooked right now?',
];

async function loadSuggestedQuestions() {
  // Show skeleton while loading
  const container = document.getElementById('suggestedChips');
  if (!container) return;
  const loading = document.getElementById('chipsLoading');
  if (loading) loading.style.display = 'flex';
  // Remove any previously rendered chips
  container.querySelectorAll('.suggestion-chip').forEach(el => el.remove());

  try {
    const res = await fetch('/api/suggested-questions', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.questions) || !data.questions.length) throw new Error('empty');
    renderChips(data.questions);
  } catch (_) {
    renderChips(STATIC_FALLBACK_QUESTIONS);
  }
}

function renderChips(questions) {
  const container = document.getElementById('suggestedChips');
  if (!container) return;
  const loading = document.getElementById('chipsLoading');
  if (loading) loading.style.display = 'none';
  container.querySelectorAll('.suggestion-chip').forEach(el => el.remove());
  for (const q of questions) {
    const btn = document.createElement('button');
    btn.className = 'suggestion-chip';
    btn.textContent = q;
    btn.addEventListener('click', () => setQuestion(btn));
    container.appendChild(btn);
  }
}

// ── Ask Claude ────────────────────────────────────────────────────
function setQuestion(chipEl) {
  document.getElementById('askInput').value = chipEl.textContent.trim();
  document.getElementById('askInput').focus();
}

function handleAskKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitQuestion();
  }
}

async function submitQuestion() {
  const input    = document.getElementById('askInput');
  const question = input.value.trim();
  if (!question) { input.focus(); return; }

  const btn     = document.getElementById('askSubmitBtn');
  const btnText = document.getElementById('askBtnText');
  const spinner = document.getElementById('askBtnSpinner');
  const resCard = document.getElementById('askResponseCard');
  const resBody = document.getElementById('askResponseBody');
  const errEl   = document.getElementById('askError');
  const errText = document.getElementById('askErrorText');

  btn.disabled = true;
  btnText.textContent = 'Thinking…';
  spinner.classList.remove('hidden');
  resCard.classList.add('hidden');
  errEl.classList.add('hidden');

  try {
    const url = `/api/ask?question=${encodeURIComponent(question)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    resBody.innerHTML = marked.parse(data.answer || '');
    resCard.classList.remove('hidden');

  } catch (err) {
    errText.textContent = err.message || 'Could not get a response. Check server logs.';
    errEl.classList.remove('hidden');
    console.error('[Ask Claude]', err);
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Ask Claude';
    spinner.classList.add('hidden');
  }
}

function clearResponse() {
  document.getElementById('askResponseCard').classList.add('hidden');
  document.getElementById('askError').classList.add('hidden');
  document.getElementById('askInput').value = '';
  document.getElementById('askInput').focus();
}

// ── Total-row cell click: tooltip + auto-expand ───────────────────
let _empTotalTipEl = null;
let _empTotalTipTimer = null;
let _empTotalDismissHandler = null;

function empTotalCellClick(evt, cell) {
  if (!_hmCanEdit()) return; // only editable roles see tooltip/expand
  evt.stopPropagation();

  // Auto-expand if not already expanded
  const empName = cell.dataset.emp;
  if (empName && !_hmExpanded.has(empName)) {
    toggleHmExpand(empName);
  }

  // Create or reuse popover element
  if (!_empTotalTipEl) {
    _empTotalTipEl = document.createElement('div');
    _empTotalTipEl.id = 'empTotalTip';
    _empTotalTipEl.style.cssText =
      'position:fixed;z-index:9999;background:#1A1D27;color:#fff;' +
      'border:1px solid #3A3D4A;border-radius:6px;font-size:12px;' +
      'padding:6px 10px;pointer-events:none;white-space:nowrap;display:none;';
    _empTotalTipEl.textContent = 'Total is calculated \u2014 edit the rows below';
    document.body.appendChild(_empTotalTipEl);
  }

  // Position above the clicked cell
  const rect = cell.getBoundingClientRect();
  _empTotalTipEl.style.display = 'block';
  // Measure after display to get width
  const tipW = _empTotalTipEl.offsetWidth;
  const left = Math.min(rect.left + rect.width / 2 - tipW / 2, window.innerWidth - tipW - 8);
  const top  = rect.top - _empTotalTipEl.offsetHeight - 6;
  _empTotalTipEl.style.left = Math.max(8, left) + 'px';
  _empTotalTipEl.style.top  = Math.max(8, top) + 'px';

  // Clear any running dismiss timer / handler
  clearTimeout(_empTotalTipTimer);
  if (_empTotalDismissHandler) {
    document.removeEventListener('click', _empTotalDismissHandler, true);
    _empTotalDismissHandler = null;
  }

  // Dismiss on outside click
  _empTotalDismissHandler = function() {
    _empTotalTipEl.style.display = 'none';
    clearTimeout(_empTotalTipTimer);
    document.removeEventListener('click', _empTotalDismissHandler, true);
    _empTotalDismissHandler = null;
  };
  // Use setTimeout so this click doesn't immediately trigger the handler
  setTimeout(() => {
    document.addEventListener('click', _empTotalDismissHandler, true);
  }, 0);

  // Auto-dismiss after 2000ms
  _empTotalTipTimer = setTimeout(() => {
    if (_empTotalTipEl) _empTotalTipEl.style.display = 'none';
    if (_empTotalDismissHandler) {
      document.removeEventListener('click', _empTotalDismissHandler, true);
      _empTotalDismissHandler = null;
    }
  }, 2000);
}

// ── Cell click handlers ───────────────────────────────────────────
function hmCellClick(empName, weekIdx) {
  if (event && event.target && event.target.closest('[data-cell-type="emp-total"]')) return;
  if (!_hmCanEdit()) return;  // guard: total/rollup rows must never reach here
  _editActiveCell = { empName, weekIdx, project: null };
  _buildVsAllRows();
  _vsRenderVisible();
  setTimeout(() => {
    const input = document.querySelector('.hm-cell-editing input');
    if (input) { input.focus(); input.select(); }
  }, 0);
}

function hmSubCellClick(empName, weekIdx, project) {
  if (event && event.target && event.target.closest('[data-cell-type="emp-total"]')) return;
  if (!_hmCanEdit()) return;  // guard: only project-level sub-cells should call this
  _editActiveCell = { empName, weekIdx, project };
  _buildVsAllRows();
  _vsRenderVisible();
  setTimeout(() => {
    const input = document.querySelector('.hm-cell-editing input');
    if (input) { input.focus(); input.select(); }
  }, 0);
}

// ── Commit a cell edit ────────────────────────────────────────────
function hmCellBlur(input) {
  if (!_editActiveCell) return;
  const empName  = input.dataset.emp;
  const weekIdx  = parseInt(input.dataset.idx);
  const project  = input.dataset.proj || null;
  const newVal   = Math.max(0, Math.min(100, Number(input.value) || 0));
  const weekLabel = _vsData ? _vsData.weeks[weekIdx] : null;
  if (!weekLabel) { _editActiveCell = null; return; }

  if (project) {
    // Sub-row edit: project-level change
    const key = `${empName}||${weekLabel}||${project}`;
    _pendingStaffing.set(key, newVal);
  } else {
    // Total-row edit: distribute proportionally across existing projects
    const emp = _vsData && _vsData.employees.find(e => e.name === empName);
    const origProjs = (emp && emp.weeklyProjects[weekIdx]) || [];
    const origTotal = (emp && emp.weeklyHours[weekIdx]) || 0;

    if (origProjs.length === 0 || origTotal === 0) {
      // No existing projects — create Unassigned entry
      _pendingStaffing.set(`${empName}||${weekLabel}||Unassigned`, newVal);
    } else if (newVal === 0) {
      for (const p of origProjs) _pendingStaffing.set(`${empName}||${weekLabel}||${p.project}`, 0);
    } else {
      // Scale proportionally
      const scale = newVal / origTotal;
      let remaining = newVal;
      for (let j = 0; j < origProjs.length; j++) {
        const p   = origProjs[j];
        const hrs = j === origProjs.length - 1
          ? remaining
          : Math.round(p.hours * scale);
        _pendingStaffing.set(`${empName}||${weekLabel}||${p.project}`, hrs);
        remaining -= hrs;
      }
    }
  }

  _editActiveCell = null;
  _buildVsAllRows();
  _vsRenderVisible();
  updateHmSaveBar();
}

function hmCellKeydown(event, input) {
  if (event.key === 'Escape') {
    _editActiveCell = null;
    _buildVsAllRows();
    _vsRenderVisible();
    return;
  }
  if (event.key === 'Tab' || event.key === 'Enter') {
    event.preventDefault();
    const weekIdx = parseInt(input.dataset.idx);
    const empName = input.dataset.emp;
    const project = input.dataset.proj || null;
    hmCellBlur(input); // commit first

    if (event.key === 'Tab') {
      const maxWeek = (_vsData ? _vsData.weeks.length : 1) - 1;
      const nextIdx = event.shiftKey ? weekIdx - 1 : weekIdx + 1;
      if (nextIdx >= 0 && nextIdx <= maxWeek) {
        _editActiveCell = { empName, weekIdx: nextIdx, project };
        _buildVsAllRows();
        _vsRenderVisible();
        setTimeout(() => {
          const ni = document.querySelector('.hm-cell-editing input');
          if (ni) { ni.focus(); ni.select(); }
        }, 0);
      }
    }
    // Enter: just commit; for "move down" we'd need employee ordering, skip for simplicity
  }
}

// ── Quick Fill ────────────────────────────────────────────────────
function applyQuickFill() {
  const empName = document.getElementById('qfEmployee')?.value?.trim();
  const project = document.getElementById('qfProject')?.value?.trim();
  const fromVal = document.getElementById('qfFrom')?.value;
  const toVal   = document.getElementById('qfTo')?.value;
  const hours   = Math.max(0, Math.min(100, Number(document.getElementById('qfHours')?.value) || 0));

  if (!empName || !project || !fromVal || !toVal) {
    showToast('Please fill in Employee, Project, From, and To fields.', 'error');
    return;
  }

  const fromDate = new Date(fromVal + 'T00:00:00');
  const toDate   = new Date(toVal   + 'T00:00:00');
  if (fromDate > toDate) { showToast('From date must be before To date.', 'error'); return; }

  if (!_vsData) { showToast('Heatmap data not loaded yet.', 'error'); return; }

  const year = new Date().getFullYear();
  let count = 0;
  for (const weekLabel of _vsData.weeks) {
    // weekLabel is "M/D" — parse to Date
    const m = weekLabel.match(/(\d+)\/(\d+)/);
    if (!m) continue;
    const wkDate = new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
    if (wkDate >= fromDate && wkDate <= toDate) {
      _pendingStaffing.set(`${empName}||${weekLabel}||${project}`, hours);
      count++;
    }
  }

  if (count === 0) {
    showToast('No heatmap weeks fall within the selected date range.', 'error');
    return;
  }

  _buildVsAllRows();
  _vsRenderVisible();
  updateHmSaveBar();
}

// ── Save / Cancel bar ─────────────────────────────────────────────
function updateHmSaveBar() {
  const bar   = document.getElementById('hmSaveBar');
  const count = document.getElementById('hmSaveCount');
  if (!bar || !count) return;
  const n = _pendingStaffing.size;
  if (n === 0) {
    bar.classList.add('hidden');
  } else {
    bar.classList.remove('hidden');
    count.textContent = `${n} unsaved change${n === 1 ? '' : 's'}`;
  }
}

async function saveStaffingChanges() {
  const btn = document.getElementById('hmSaveBtnEl');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const changes = [];
  for (const [key, hours] of _pendingStaffing) {
    const parts = key.split('||');
    changes.push({ employeeName: parts[0], weekLabel: parts[1], project: parts[2], hours });
  }

  try {
    const res  = await fetch('/api/save-staffing', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ changes }),
    });
    const data = await res.json();
    if (res.status === 423) {
      const countEl = document.getElementById('hmSaveCount');
      if (countEl) { countEl.textContent = data.error; countEl.style.color = '#FFB3B3'; }
      return;
    }
    if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);

    _pendingStaffing.clear();
    _editActiveCell = null;
    updateHmSaveBar();
    await loadDashboard();
  } catch (err) {
    showToast(`Save failed: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

function cancelStaffingChanges() {
  _pendingStaffing.clear();
  _editActiveCell = null;
  _buildVsAllRows();
  _vsRenderVisible();
  updateHmSaveBar();
}

function _esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── User Management ───────────────────────────────────────────────

const UM_ROLE_LABELS = {
  admin:            'Admin',
  resource_manager: 'Resource Manager',
  project_manager:  'Project Manager',
  executive:        'Executive',
  consultant:       'Consultant',
  finance:          'Finance',
  recruiter:        'Recruiter',
};

const UM_ROLE_COLORS = {
  admin:            '#C9B8FF',
  resource_manager: '#A8C7FA',
  project_manager:  '#A8E6CF',
  executive:        '#FFF3A3',
  consultant:       '#FFD6B3',
  finance:          '#B3E5FC',
  recruiter:        '#F8BBD9',
};

function umFmtDate(iso) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function umPill(color, text) {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;color:#0F1117;background:${color}">${text}</span>`;
}

let _deactivatedExpanded = false;

async function loadUsers() {
  const tbody   = document.getElementById('userTableBody');
  const emptyEl = document.getElementById('userTableEmpty');
  const deactEl = document.getElementById('deactivatedSection');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="padding:32px 20px;text-align:center;color:#8892B0;font-size:13px">Loading…</td></tr>`;
  emptyEl.classList.add('hidden');
  if (deactEl) deactEl.innerHTML = '';

  let users;
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    users = await res.json();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:32px 20px;text-align:center;color:#FCA5A5;font-size:13px">Failed to load users: ${_esc(err.message)}</td></tr>`;
    return;
  }

  const activeUsers      = users.filter(u => u.status !== 'deactivated');
  const deactivatedUsers = users.filter(u => u.status === 'deactivated');

  if (!activeUsers.length && !deactivatedUsers.length) {
    tbody.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  tbody.innerHTML = activeUsers.length
    ? activeUsers.map(u => _renderActiveRow(u)).join('')
    : `<tr><td colspan="7" style="padding:32px 20px;text-align:center;color:#8892B0;font-size:13px">No active users — invite someone above</td></tr>`;

  if (deactEl) _renderDeactivatedSection(deactEl, deactivatedUsers);
}

function _renderActiveRow(u) {
  const roleColor  = UM_ROLE_COLORS[u.role] || '#8892B0';
  const roleLabel  = UM_ROLE_LABELS[u.role] || (u.role || '—');
  const isInvited  = u.status === 'invited';

  const roleOptions = Object.entries(UM_ROLE_LABELS)
    .map(([val, label]) => `<option value="${val}"${u.role === val ? ' selected' : ''}>${label}</option>`)
    .join('');

  const statusPill = isInvited
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#F59E0B;background:#451A03;border:1px solid rgba(245,158,11,0.3)">Invited</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#10B981;background:#052E16;border:1px solid rgba(16,185,129,0.3)">Active</span>`;

  const lastLoginCell = isInvited
    ? `<span style="color:#6B6F76;font-style:italic;font-size:12px">Never logged in</span>`
    : `<span style="color:#8892B0;font-size:12px">${umFmtDate(u.last_sign_in_at)}</span>`;

  const roleSelect = isInvited
    ? `<select disabled style="padding:5px 8px;background:#0F1117;border:1px solid rgba(255,255,255,.06);border-radius:6px;color:#4A4D5A;font-size:12px;font-family:inherit;cursor:not-allowed;outline:none;opacity:0.5">${roleOptions}</select>`
    : `<select onchange="changeUserRole('${_esc(u.id)}', this.value, this)" style="padding:5px 8px;background:#0F1117;border:1px solid rgba(255,255,255,.1);border-radius:6px;color:#CBD5E0;font-size:12px;font-family:inherit;cursor:pointer;outline:none">${roleOptions}</select>`;

  const actionBtns = isInvited
    ? `<button onclick="resendInvite('${_esc(u.id)}')"
         style="padding:5px 10px;background:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#9CA3AF;font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background='transparent'">Resend Invite</button>
       <button onclick="cancelInvite('${_esc(u.id)}')"
         style="padding:5px 10px;background:transparent;border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:#EF4444;font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(239,68,68,.06)'" onmouseout="this.style.background='transparent'">Cancel Invite</button>`
    : `<button onclick="deactivateUser('${_esc(u.id)}')"
         style="padding:5px 10px;background:rgba(252,165,165,.12);border:1px solid rgba(252,165,165,.25);border-radius:6px;color:#FCA5A5;font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(252,165,165,.22)'" onmouseout="this.style.background='rgba(252,165,165,.12)'">Deactivate</button>`;

  return `<tr style="border-bottom:1px solid rgba(255,255,255,.05);${isInvited ? 'opacity:0.75;' : ''}">
    <td style="padding:13px 20px;color:#E2E8F0;font-weight:500;white-space:nowrap">${_esc(u.name)}</td>
    <td style="padding:13px 16px;color:#8892B0;font-size:12px">${_esc(u.email)}</td>
    <td style="padding:13px 16px">${umPill(roleColor, _esc(roleLabel))}</td>
    <td style="padding:13px 16px">${statusPill}</td>
    <td style="padding:13px 16px;white-space:nowrap">${lastLoginCell}</td>
    <td style="padding:13px 16px;color:#8892B0;font-size:12px;white-space:nowrap">${umFmtDate(u.created_at)}</td>
    <td style="padding:13px 20px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${roleSelect}
        ${actionBtns}
      </div>
    </td>
  </tr>`;
}

function _renderDeactivatedSection(container, users) {
  _deactivatedExpanded = users.length === 0;
  const countBadge = users.length > 0 ? ` (${users.length})` : '';

  const rowsHtml = users.length === 0
    ? `<div style="padding:24px;text-align:center;color:#4A4D5A;font-size:13px">No deactivated users</div>`
    : `<div class="chart-card" style="padding:0;overflow:hidden;margin-top:8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tbody>${users.map(u => _renderDeactivatedRow(u)).join('')}</tbody>
        </table>
      </div>`;

  container.innerHTML = `
    <div style="margin-top:16px">
      <div onclick="toggleDeactivatedSection()"
           style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;padding:4px 0">
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.06)"></div>
        <span style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#4A4D5A;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap">
          <span id="deactivatedArrow" style="font-size:9px">${_deactivatedExpanded ? '▼' : '▶'}</span>
          Deactivated Users${countBadge}
        </span>
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.06)"></div>
      </div>
      <div id="deactivatedContent" style="overflow:hidden;${_deactivatedExpanded ? '' : 'display:none'}">
        ${rowsHtml}
      </div>
    </div>`;

}

function toggleDeactivatedSection() {
  _deactivatedExpanded = !_deactivatedExpanded;
  const content = document.getElementById('deactivatedContent');
  const arrow   = document.getElementById('deactivatedArrow');
  if (!content || !arrow) return;
  content.style.display = _deactivatedExpanded ? '' : 'none';
  arrow.textContent = _deactivatedExpanded ? '▼' : '▶';
}

function _renderDeactivatedRow(u) {
  const roleColor  = UM_ROLE_COLORS[u.role] || '#8892B0';
  const roleLabel  = UM_ROLE_LABELS[u.role] || (u.role || '—');
  const statusPill = `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#6B6F76;background:#1A1D27;border:1px solid rgba(255,255,255,0.1)">Deactivated</span>`;

  return `<tr style="border-bottom:1px solid rgba(255,255,255,.04);opacity:0.45">
    <td style="padding:13px 20px;color:#E2E8F0;font-weight:500;white-space:nowrap">${_esc(u.name)}</td>
    <td style="padding:13px 16px;color:#8892B0;font-size:12px">${_esc(u.email)}</td>
    <td style="padding:13px 16px">${umPill(roleColor, _esc(roleLabel))}</td>
    <td style="padding:13px 16px">${statusPill}</td>
    <td style="padding:13px 16px;color:#8892B0;font-size:12px;white-space:nowrap">${umFmtDate(u.last_sign_in_at)}</td>
    <td style="padding:13px 16px;color:#8892B0;font-size:12px;white-space:nowrap">${umFmtDate(u.created_at)}</td>
    <td style="padding:13px 20px">
      <button onclick="reactivateUser('${_esc(u.id)}')"
        style="padding:5px 10px;background:rgba(168,230,207,.12);border:1px solid rgba(168,230,207,.25);border-radius:6px;color:#A8E6CF;font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap"
        onmouseover="this.style.background='rgba(168,230,207,.22)'" onmouseout="this.style.background='rgba(168,230,207,.12)'">Reactivate</button>
    </td>
  </tr>`;
}

async function changeUserRole(userId, newRole, selectEl) {
  const prevRole = Array.from(selectEl.options).find(o => o.defaultSelected)?.value
                || selectEl.dataset.prev
                || newRole;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ role: newRole }),
    });

    if (!res.ok) {
      showToast('Failed to update role.', 'error');
      selectEl.value = prevRole;
      return;
    }

    showToast(`Role updated to ${UM_ROLE_LABELS[newRole] || newRole}.`);
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function deactivateUser(userId) {
  if (!confirm('Deactivate this user? They will lose access immediately.')) return;

  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/deactivate`, { method: 'PATCH' });
    if (!res.ok) { showToast('Failed to deactivate user.'); return; }
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function reactivateUser(userId) {
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/reactivate`, { method: 'PATCH' });
    if (!res.ok) { showToast('Failed to reactivate user.'); return; }
    showToast('User reactivated successfully.', 'success');
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function resendInvite(userId) {
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/resend-invite`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to resend invite.');
      return;
    }
    showToast('Invite resent successfully.');
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function cancelInvite(userId) {
  if (!confirm('Cancel this invite? The pending account will be permanently deleted.')) return;
  try {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/invite`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Failed to cancel invite.');
      return;
    }
    showToast('Invite cancelled.');
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

function openInviteModal() {
  document.getElementById('inviteModal').classList.remove('hidden');
}

function closeInviteModal() {
  const modal = document.getElementById('inviteModal');
  modal.classList.add('hidden');
  document.getElementById('inviteForm').reset();
  document.getElementById('tempPasswordGroup').classList.add('hidden');
  document.getElementById('inviteError').classList.add('hidden');
  const btn = document.getElementById('inviteSubmitBtn');
  btn.textContent = 'Send Invite';
  btn.disabled = false;
}

function handleInviteOverlayClick(e) {
  if (e.target === document.getElementById('inviteModal')) closeInviteModal();
}

function updateDeliveryMethod(value) {
  const group = document.getElementById('tempPasswordGroup');
  const btn   = document.getElementById('inviteSubmitBtn');
  if (value === 'password') {
    group.classList.remove('hidden');
    btn.textContent = 'Create User';
  } else {
    group.classList.add('hidden');
    btn.textContent = 'Send Invite';
  }
}

async function submitInvite(e) {
  e.preventDefault();
  const form   = document.getElementById('inviteForm');
  const errEl  = document.getElementById('inviteError');
  errEl.classList.add('hidden');

  const name           = form.elements.name.value.trim();
  const email          = form.elements.email.value.trim();
  const role           = form.elements.role.value;
  const deliveryMethod = form.elements.deliveryMethod.value;
  const tempPassword   = form.elements.tempPassword?.value.trim() || '';

  if (!name || !email || !role) {
    errEl.textContent = 'Name, email, and role are required.';
    errEl.classList.remove('hidden');
    return;
  }
  if (deliveryMethod === 'password' && !tempPassword) {
    errEl.textContent = 'A temporary password is required.';
    errEl.classList.remove('hidden');
    return;
  }
  if (deliveryMethod === 'password') {
    const pwRe = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/;
    if (!pwRe.test(tempPassword)) {
      errEl.textContent = 'Password must be at least 12 characters and include an uppercase letter, a lowercase letter, a number, and a special character.';
      errEl.classList.remove('hidden');
      return;
    }
  }

  const btn = document.getElementById('inviteSubmitBtn');
  btn.disabled    = true;
  btn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/admin/users/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, role, deliveryMethod, tempPassword }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Failed to create user.';
      errEl.classList.remove('hidden');
      btn.disabled    = false;
      btn.textContent = deliveryMethod === 'password' ? 'Create User' : 'Send Invite';
      return;
    }

    closeInviteModal();
    showToast(`${email} ${deliveryMethod === 'invite' ? 'invited' : 'created'} successfully.`);
    loadUsers();
  } catch (err) {
    errEl.textContent = err.message || 'Network error.';
    errEl.classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = deliveryMethod === 'password' ? 'Create User' : 'Send Invite';
  }
}

// ── Auth ──────────────────────────────────────────────────────────
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
  window.location.replace('login.html');
}

// ── Boot ──────────────────────────────────────────────────────────
(async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (res.status === 401) { window.location.replace('login.html'); return; }
    const me = await res.json();
    currentUserRole         = me.role || null;
    currentUserCanViewRates = !!me.canViewRates;
  } catch (e) { window.location.replace('login.html'); return; }

  // ── Role-based tab gating ──────────────────────────────────────
  const role    = currentUserRole;
  const hideTab = name => {
    const el = document.querySelector(`.nav-item[data-tab="${name}"]`);
    if (el) el.style.display = 'none';
  };

  if (role === 'executive')  { hideTab('staffing'); hideTab('needs'); }
  if (role === 'consultant') { hideTab('overview');  hideTab('ask'); }
  if (role === 'finance')    { hideTab('ask'); }
  if (role === 'recruiter')  { hideTab('overview'); hideTab('staffing'); hideTab('ask'); }
  if (role !== 'admin')      { hideTab('settings'); }

  loadDashboard();

  // Redirect to first accessible tab if the default (overview) is hidden
  const activeTabName = document.querySelector('.nav-item.active')?.dataset.tab;
  if (role === 'executive' && (activeTabName === 'staffing' || activeTabName === 'needs')) {
    navigateTo('overview');
  }
  if (role === 'consultant' && (activeTabName === 'overview' || activeTabName === 'ask' || activeTabName === 'settings')) {
    navigateTo('staffing');
  }
  if (role === 'recruiter') {
    navigateTo('needs');
  }
})();
