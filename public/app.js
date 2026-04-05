/* ── Staffing Intelligence — Frontend App ──────────────────────── */

'use strict';

// ── Central fetch wrapper — redirects to login on 401 before any local handler runs ──
async function apiFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    window.location.href = '/login.html';
    return new Promise(() => {}); // never resolves; prevents caller from handling the response
  }
  return res;
}

// ── Current user role (set after auth check, used for role-based gating) ──
let currentUserRole         = null;
let currentUserCanViewRates = false;

// ── Inline edit state ─────────────────────────────────────────────
let _editActiveCell = null;   // { empName, weekIdx, project } or null
let _addProjEmp = null;       // empName being targeted by the Add Project modal
let _editConsultantId = null;     // consultant id open in the profile editor
let _needsClientFilter = null;    // active donut segment filter: client name string | null
let _collapsedNeedsClients = new Set(); // client names collapsed on the Needs tab
let _bulkAssignNeedId  = null;    // need id currently open in the bulk-assign modal
let _editConsultantStatus = null; // status of the consultant open in the profile editor
let _cpIsDirty = false;            // tracks unsaved changes in profile editor
let _cpSnapshot = null;            // original field values for revert
let _cpAbortController = null;     // abort signal for dirty-tracking listeners
let _settingsActivePanel = null;   // 'users' | 'consultants' — active Settings sub-nav panel
let _cmdSelIdx = -1;               // command palette: currently selected result index
let _cmdItems  = [];               // command palette: flat array of { action } for keyboard nav
let _cmdExpandedGroups = new Set(); // command palette: group labels expanded beyond CAP
let _cmdLastGroups     = [];        // command palette: last rendered groups (for expand re-render)
let _cmdConsultantMeta = null;      // command palette: lazy-loaded { [id]: { industry, country } }
let _cmdActionMode     = false;     // command palette: true when query starts with ">"
let _umUsers = [];                 // cached user list for user-edit modal
const _pendingStaffing = new Map(); // key = `${empName}||${weekLabel}||${project}` → hours

// ── Tracks which employee rows are expanded in the heatmap ────────
const _hmExpanded = new Set();

// ── Fix Chart.js resolution on high-DPI / Retina displays ─────────
Chart.defaults.devicePixelRatio = window.devicePixelRatio || 2;

// ── Tab switching ─────────────────────────────────────────────────
document.querySelectorAll('.nav-item:not(.nav-item--disabled)').forEach(btn => {
  btn.addEventListener('click', async () => {
    await apiFetch('/api/auth/me');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
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
    // Reload active panel each time Settings tab is opened
    if (tab === 'settings') {
      const defaultPanel = 'consultants';
      switchSettingsPanel(_settingsActivePanel || defaultPanel);
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
// Alt+R — in-app data refresh. Alt+R is not reserved by any browser.
// (Ctrl+R and Ctrl+Shift+R are browser-reserved page-reload shortcuts.)
document.addEventListener('keydown', e => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.key === 'r') {
    e.preventDefault();
    e.stopPropagation();
    loadDashboard();
    return;
  }
}, true); // capture phase keeps it before any other listener

document.addEventListener('keydown', e => {
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
  if (e.key === 'Escape') { closeCmdPalette(); closeDrilldown(); closeShortcutGuide(); closeAddProjectModal(); closeConsultantProfileEditor(); closeBulkAssignModal(); closeInviteModal(); return; }
  if (e.ctrlKey || e.metaKey) {
    if (e.altKey && e.key === 'r') { e.preventDefault(); loadDashboard(); return; }
    if (e.key === '1') { e.preventDefault(); navigateTo('overview');  return; }
    if (e.key === '2') { e.preventDefault(); navigateTo('staffing'); return; }
    if (e.key === '3') { e.preventDefault(); navigateTo('needs');    return; }
    if (e.key === '4') { e.preventDefault(); navigateTo('ask');      return; }
    if (e.key === '5') { e.preventDefault(); navigateTo('settings'); return; }
    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      const _cpo = document.getElementById('cmdPaletteOverlay');
      if (_cpo && _cpo.classList.contains('active')) { document.getElementById('cmdPaletteInput')?.focus(); }
      else { openCmdPalette(); }
      return;
    }
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleSidebar(); return; }
  }
  if (e.key === '?' && !inInput) { e.preventDefault(); toggleShortcutGuide(); }
  if (e.key === '/' && !inInput) { e.preventDefault(); openCmdPalette(); }
});

// ── Keyboard shortcut guide ───────────────────────────────────────
function openShortcutGuide()   { document.getElementById('shortcutOverlay').classList.add('active'); }
function closeShortcutGuide()  { const el = document.getElementById('shortcutOverlay'); if (el) el.classList.remove('active'); }
function toggleShortcutGuide() { const el = document.getElementById('shortcutOverlay'); if (el) el.classList.toggle('active'); }
function handleShortcutOverlayClick(e) { if (e.target === e.currentTarget) closeShortcutGuide(); }

// ── Header: Date Range Selector ───────────────────────────────────
// Commented out Session 14 — week selector removed from nav.
// To be rebuilt properly as part of historical snapshots
// feature (Phase 2). See GitHub issue #[new issue number].
//
// window.selectedDateRange = { type: 'current', weekOffset: 0 };
//
// (function initDateRange() {
//   function getWeekEndDate(offsetWeeks) {
//     const today = new Date();
//     const daysToSat = (6 - today.getDay() + 7) % 7;
//     const sat = new Date(today);
//     sat.setDate(today.getDate() + daysToSat + offsetWeeks * 7);
//     return sat;
//   }
//
//   const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
//   function formatWeekLabel(date) {
//     return `Week of ${MONTHS[date.getMonth()]} ${date.getDate()}`;
//   }
//
//   const labelBtn  = document.getElementById('dateRangeLabel');
//   const dropdown  = document.getElementById('dateRangeDropdown');
//   const prevBtn   = document.getElementById('dateRangePrev');
//   const nextBtn   = document.getElementById('dateRangeNext');
//
//   if (labelBtn) labelBtn.textContent = formatWeekLabel(getWeekEndDate(0));
//
//   function applyWeekOffset() {
//     window.selectedDateRange.type = 'custom';
//     if (labelBtn) labelBtn.textContent = formatWeekLabel(getWeekEndDate(window.selectedDateRange.weekOffset));
//     document.dispatchEvent(new CustomEvent('dateRangeChanged', { detail: { ...window.selectedDateRange } }));
//   }
//
//   if (labelBtn) {
//     labelBtn.addEventListener('click', e => {
//       e.stopPropagation();
//       if (dropdown) dropdown.classList.toggle('hidden');
//     });
//   }
//
//   document.querySelectorAll('.hdr-date-option').forEach(btn => {
//     btn.addEventListener('click', () => {
//       const range = btn.dataset.range;
//       window.selectedDateRange.type = range;
//       window.selectedDateRange.weekOffset = 0;
//       const labels = { current: 'Current Week', next2: 'Next 2 Weeks', next4: 'Next 4 Weeks', month: 'This Month' };
//       if (labelBtn) labelBtn.textContent = labels[range] || 'Current Week';
//       if (dropdown) dropdown.classList.add('hidden');
//       document.dispatchEvent(new CustomEvent('dateRangeChanged', { detail: { ...window.selectedDateRange } }));
//     });
//   });
//
//   if (prevBtn) prevBtn.addEventListener('click', () => { window.selectedDateRange.weekOffset--; applyWeekOffset(); });
//   if (nextBtn) nextBtn.addEventListener('click', () => { window.selectedDateRange.weekOffset++; applyWeekOffset(); });
//
//   document.addEventListener('click', () => { if (dropdown) dropdown.classList.add('hidden'); });
// })();


// ── Search navigator: scroll to employee row in heatmap ──────────
function navigateToEmployee(name) {
  navigateTo('staffing');
  // Wait for tab paint + virtual scroll to be ready
  setTimeout(() => {
    if (!_vsData) return;
    const rowIdx = _vsAllRows.findIndex(r => r.type === 'emp' && r.emp.name === name);
    if (rowIdx === -1) return;
    let y = 0;
    for (let i = 0; i < rowIdx; i++) y += _vsAllRows[i].height;
    const scrollWrap = document.querySelector('.hm-scroll-wrap');
    if (!scrollWrap) return;
    scrollWrap.scrollLeft = 0; // ensure name column is visible
    scrollWrap.scrollTop  = y;
    _vsRenderVisible();
    requestAnimationFrame(() => {
      const td = Array.from(document.querySelectorAll('td.hm-name-cell'))
        .find(el => el.dataset.emp === name);
      if (!td) return;
      const tr = td.closest('tr');
      flashHeatmapRow(tr);
      // For editors: expand row and focus the first under-utilised week (<45h)
      if (_hmCanEdit()) {
        const emp = _vsData && _vsData.employees.find(e => e.name === name);
        if (emp) {
          const underIdx = emp.weeklyHours.findIndex(h => h < 45);
          const weekIdx  = underIdx !== -1 ? underIdx : 0;
          if (!_hmExpanded.has(emp.name)) {
            toggleHmExpand(emp.name, weekIdx);
          } else {
            const allProjs = [...new Set(emp.weeklyProjects.flat().map(p => p.project))];
            if (allProjs.length) {
              _editActiveCell = { empName: emp.name, weekIdx, project: allProjs[0] };
              _buildVsAllRows();
              _vsRenderVisible();
              setTimeout(() => { const ni = document.querySelector('.hm-cell-editing input'); if (ni) { ni.focus(); ni.select(); } }, 0);
            }
          }
        }
      }
    });
  }, 120);
}

// ── Search navigator: expand project sub-rows and scroll to them ──
function navigateToProject(projName) {
  if (!_vsData) return;
  const empsWithProj = _vsData.employees.filter(emp =>
    (emp.weeklyProjects || []).some(wk => (wk || []).some(p => p.project === projName))
  );
  if (!empsWithProj.length) return;
  // Expand all employees assigned to this project so sub-rows appear
  for (const emp of empsWithProj) _hmExpanded.add(emp.name);
  _buildVsAllRows();
  navigateTo('staffing');
  setTimeout(() => {
    _vsRenderVisible();
    const targetEmp = empsWithProj[0];
    const rowIdx = _vsAllRows.findIndex(
      r => r.type === 'sub' && r.emp.name === targetEmp.name && r.projName === projName
    );
    if (rowIdx === -1) return;
    let y = 0;
    for (let i = 0; i < rowIdx; i++) y += _vsAllRows[i].height;
    y = Math.max(0, y - VS_H_EMP); // nudge up so parent emp row is visible
    const scrollWrap = document.querySelector('.hm-scroll-wrap');
    if (!scrollWrap) return;
    scrollWrap.scrollLeft = 0; // ensure name column is visible
    scrollWrap.scrollTop  = y;
    _vsRenderVisible();
    requestAnimationFrame(() => {
      document.querySelectorAll('tr.hm-sub-row').forEach(tr => {
        const hasProj = Array.from(tr.querySelectorAll('td.hm-sub-cell'))
          .some(el => el.dataset.proj === projName);
        if (hasProj) flashHeatmapRow(tr);
      });
    });
  }, 120);
}

// ── Flash a heatmap row: amber left-border + glow on name cell ────
// Animates border/shadow instead of background so inline cell colors don't overpower it
function flashHeatmapRow(tr) {
  if (!tr) return;
  const nameCell = tr.querySelector('td:first-child');
  if (!nameCell) return;
  const origBorderLeft = nameCell.style.borderLeft;
  const origBoxShadow  = nameCell.style.boxShadow;
  const origTransition = nameCell.style.transition;
  // Instant-on: amber left border + inset glow
  nameCell.style.transition  = '';
  nameCell.style.borderLeft  = '3px solid #FACC15';
  nameCell.style.boxShadow   = 'inset 3px 0 12px rgba(250,204,21,0.4)';
  // Hold 600ms then fade both out over 1.5s
  setTimeout(() => {
    nameCell.style.transition     = 'border-color 1.5s ease-out, box-shadow 1.5s ease-out';
    nameCell.style.borderLeftColor = 'rgba(250,204,21,0)';
    nameCell.style.boxShadow      = 'inset 3px 0 12px rgba(250,204,21,0)';
    // Restore original state after fade completes
    setTimeout(() => {
      nameCell.style.transition  = origTransition;
      nameCell.style.borderLeft  = origBorderLeft;
      nameCell.style.boxShadow   = origBoxShadow;
    }, 1500);
  }, 600);
}

// ── Header: Notification Bell ─────────────────────────────────────
function closeBellDropdown() {
  const dd = document.getElementById('bellDropdown');
  if (dd) dd.classList.add('hidden');
}

function updateBellBadge() {
  const badge     = document.getElementById('bellBadge');
  const alertList = document.getElementById('bellAlertList');
  if (!badge || !alertList) return;

  const openCount = ((rawData.openNeeds || {}).roles || []).length;

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

  const total = openCount + overbookedCount;

  // If data hasn't loaded yet keep the hardcoded fallback badge visible
  if (((rawData.openNeeds || {}).roles || []).length === 0 && rawData.supply.length === 0) return;

  badge.textContent = String(total);
  badge.style.display = total > 0 ? '' : 'none';

  let html = '';
  if (openCount > 0) {
    html += `<div class="hdr-alert-item">
      <span class="hdr-alert-icon">⚠️</span>
      <span class="hdr-alert-text">${openCount} open staffing need${openCount !== 1 ? 's' : ''}</span>
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

// ── Utilization status helper ─────────────────────────────────────
function utilStatus(hours) {
  if (hours > 45)   return { label: 'Overallocated', cls: 'status-overalloc' };
  if (hours === 45) return { label: 'Utilized',      cls: 'status-full' };
  if (hours > 10)   return { label: 'Available',     cls: 'status-under' };
  return              { label: 'Bench',              cls: 'status-bench' };
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
      apiFetch('/api/dashboard'),
      apiFetch('/api/supply'),
      apiFetch('/api/employees'),
      apiFetch('/api/heatmap'),
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
    rawData.openNeeds     = data.openNeeds;
    rawData.heatmap       = heatmapRes.ok   ? JSON.parse(heatmapText)   : null;
    rawData._meta         = data._meta      || {};

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
    renderCoverageChart(data.openNeeds);
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
  // True hours-based utilization: total booked hours ÷ (45 × consultants × 12 weeks)
  // Computed server-side in /api/dashboard using rolling 12-week window
  const avgUtil = data.overallUtilizationPct !== undefined ? data.overallUtilizationPct : 0;
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

  // ── Card 2: Utilization % ────────────────────────────────────────
  const utilEl = document.getElementById('overviewUtil');
  if (utilEl) utilEl.textContent = headcount ? String(avgUtil) : '—';

  const utilSecondary = document.getElementById('overviewUtilSecondary');
  if (utilSecondary && headcount) {
    const wTotalHrs = data.windowTotalHours !== undefined ? Math.round(data.windowTotalHours) : null;
    const wCap      = data.windowCapacity   !== undefined ? Math.round(data.windowCapacity)   : null;
    const windowN = (wCap !== null && headcount > 0) ? Math.round(wCap / (45 * headcount)) : null;
    utilSecondary.textContent = (wTotalHrs !== null && wCap !== null)
      ? `${wTotalHrs}h booked of ${wCap}h available over ${windowN} weeks`
      : `${bookedCount} of ${headcount} booked`;
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

  // ── Card 1: Available Capacity % ────────────────────────────────
  const wTotalHrs = data.windowTotalHours !== undefined ? Math.round(data.windowTotalHours) : null;
  const wCap      = data.windowCapacity   !== undefined ? Math.round(data.windowCapacity)   : null;
  const windowN   = (wCap !== null && headcount > 0) ? Math.round(wCap / (45 * headcount)) : null;
  const unbooked  = (wCap !== null && wTotalHrs !== null) ? wCap - wTotalHrs : null;
  const availPct  = (wCap !== null && wTotalHrs !== null && wCap > 0)
    ? Math.round((wCap - wTotalHrs) / wCap * 100) : null;

  const availEl = document.getElementById('overviewAvailHours');
  if (availEl) availEl.textContent = availPct !== null ? String(availPct) : '—';

  const availSecondary = document.getElementById('overviewAvailSecondary');
  if (availSecondary && unbooked !== null && wCap !== null) {
    availSecondary.textContent = `${unbooked}h unbooked of ${wCap}h available over ${windowN} weeks`;
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

  // ── Card 3: Open Needs ───────────────────────────────────────────
  const openRolesOv = (rawData.openNeeds && rawData.openNeeds.roles) || [];
  const totalRoles  = openRolesOv.length;
  const unmetEl = document.getElementById('overviewUnmet');
  if (unmetEl) unmetEl.textContent = String(totalRoles);

  const needsSecondary = document.getElementById('overviewNeedsSecondary');
  if (needsSecondary) {
    const clientCount = new Set(openRolesOv.map(r => r.client).filter(Boolean)).size;
    needsSecondary.textContent = totalRoles > 0
      ? `across ${clientCount} client${clientCount !== 1 ? 's' : ''}`
      : 'no open needs';
  }

  const unmetTrendEl = document.getElementById('overviewUnmetTrend');
  if (unmetTrendEl) {
    if (totalRoles > 0) {
      const todayOv = new Date(); todayOv.setHours(0,0,0,0);
      const urgentCount = openRolesOv.filter(r => {
        if (!r.startDate) return false;
        const p = String(r.startDate).split('/');
        if (p.length < 3) return false;
        const d = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
        return (d - todayOv) / 86400000 <= 14;
      }).length;
      if (urgentCount > 0) {
        unmetTrendEl.textContent = `⚠ ${urgentCount} urgent (starting ≤2 wks)`;
        unmetTrendEl.className = 'ov-card-trend warn';
      } else {
        unmetTrendEl.textContent = `${totalRoles} need${totalRoles !== 1 ? 's' : ''} to fill`;
        unmetTrendEl.className = 'ov-card-trend';
      }
    } else {
      unmetTrendEl.textContent = '✓ All needs covered';
      unmetTrendEl.className = 'ov-card-trend ok';
    }
  }

  // ── Card 4: On Bench ─────────────────────────────────────────────
  const benchCount = (data.benchReport || []).reduce((s, g) => s + g.employees.length, 0);
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
  renderOverallocated(rawData.heatmap);
}

// ── Upcoming Availability (Row 2 left) ────────────────────────────
const LEVEL_ORDER_OV = ['Partner/MD', 'Senior Manager', 'Manager', 'Senior Consultant', 'Consultant', 'Analyst'];

function renderLevelBreakdown(heatmapData) {
  const el = document.getElementById('ovLevelBreakdown');
  if (!el) return;
  const byLevel = {};

  // Rolling window: use rawData._meta.weekKeyToDate for correct ISO date parsing.
  // heatmapData.weeks uses short "M/D" strings — new Date("3/28") returns Invalid Date,
  // making windowIndices empty and bookedHours=0 → all bars show 100%.
  const weekKeys = rawData.supply.length ? Object.keys(rawData.supply[0].weeklyHours) : [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const windowWeeks = weekKeys.filter(wk => {
    const d = rawData._meta.weekKeyToDate[wk];
    return d && new Date(d) >= today;
  }).slice(0, 12);
  const windowWeekCount = windowWeeks.length || 1;

  // Headcounts from Employee Master (one record per person)
  for (const emp of rawData.employees) {
    if (!byLevel[emp.level]) byLevel[emp.level] = { bookedHours: 0, count: 0 };
    byLevel[emp.level].count++;
  }
  // Booked hours from supply rows using week key strings (not numeric indices)
  for (const row of rawData.supply) {
    const level = row.level || 'Unknown';
    if (!byLevel[level]) byLevel[level] = { bookedHours: 0, count: 0 };
    for (const wk of windowWeeks) {
      byLevel[level].bookedHours += row.weeklyHours[wk] || 0;
    }
  }

  // Debug: log per-level availability metrics
  for (const [levelName, d] of Object.entries(byLevel)) {
    const totalAvailableHours = 45 * d.count * windowWeekCount;
    const availabilityPct = totalAvailableHours > 0
      ? Math.round((totalAvailableHours - d.bookedHours) / totalAvailableHours * 100)
      : 0;
  }

  // Only render levels that have employees in the current data
  const rows = LEVEL_ORDER_OV
    .filter(l => byLevel[l])
    .map(l => {
      const { bookedHours, count } = byLevel[l];
      const totalAvail = 45 * count * windowWeekCount;
      const availPct = totalAvail > 0 ? Math.round((totalAvail - bookedHours) / totalAvail * 100) : 0;
      return { level: l, count, availPct };
    });

  el.innerHTML = rows.map((r, i) => {
    // High availability = green (good), moderate = yellow, low = red (concerning)
    const color = r.availPct >= 50 ? '#A8E6CF' : r.availPct >= 20 ? '#FFF3A3' : '#FFB3B3';
    const barWidth = Math.min(r.availPct, 100);
    const rowBg = i % 2 === 0 ? '#1A1D27' : '#16192A';
    return `<div class="ov-level-row-wrap">
      <div class="ov-level-row dd-clickable" data-level="${_esc(r.level)}" style="background:${rowBg}" title="Click for ${r.level} availability breakdown">
        <span class="ov-level-name">${r.level}</span>
        <span class="ov-level-count">(${r.count})</span>
        <div class="ov-level-bar-track">
          <div class="ov-level-bar-fill" style="width:${barWidth}%;background:${color}"></div>
        </div>
        <span class="ov-level-pct" style="color:${color}">${r.availPct}%</span>
      </div>
    </div>`;
  }).join('');

  if (el._overallocHandler) el.removeEventListener('click', el._overallocHandler);
  el._overallocHandler = function(e) {
    const levelRow = e.target.closest('.ov-level-row[data-level]');
    if (levelRow) drillUtilization(levelRow.dataset.level);
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
    <div class="ov-project-row dd-clickable" style="cursor:pointer" onclick="navigateToProject('${_esc(project)}')" title="Click to view in Resource Allocation tab">
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

  // Update panel header to show true total count
  const panel = el.closest('.ov-panel');
  if (panel) {
    const titleSpan = panel.querySelector('.ov-panel-title');
    if (titleSpan) titleSpan.textContent = `⏰ Rolling Off Soon (${results.length})`;
  }

  // Show up to 4 rows; append "View all (N)" link if more exist
  const rowsHtml = results.slice(0, 4).map(r => {
    const bc = r.urgency === 'coral' ? '#FFB3B3' : '#FFF3A3';
    return `<div class="ov-cliff-item dd-clickable" style="border-left-color:${bc}" data-name="${_esc(r.name)}" onclick="drillRollingOff(this.dataset.name)" title="Click for availability details">
      <div class="ov-cliff-name">${r.name}</div>
      <div class="ov-cliff-meta">${r.level || '—'}${r.skillSet ? ' · ' + r.skillSet : ''}</div>
      <div class="ov-cliff-detail">
        <span style="color:${bc};font-size:11px">Wk ending ${r.weekLabel}</span>
        <span class="ov-cliff-hours">${r.fromH}h → ${r.toH}h</span>
      </div>
    </div>`;
  }).join('');

  const viewAllHtml = results.length > 4
    ? `<div style="text-align:center;padding:6px 0 2px"><a style="color:#F97316;font-size:12px;cursor:pointer;text-decoration:none;font-weight:500" onclick="drillAllRollingOff()">View all (${results.length}) →</a></div>`
    : '';

  el.innerHTML = rowsHtml + viewAllHtml;
}

// ── Rolling Off Soon — action-oriented drilldown (#141) ───────────
function drillRollingOff(empName) {
  const hm = rawData.heatmap;
  if (!hm) return;
  const emp = hm.employees.find(e => e.name === empName);
  if (!emp) return;

  // Build rolling 12-week window.
  // hm.weeks uses short "M/D" labels; weekKeyToDate keys are "Week ending M/D" — must prepend prefix.
  const weeks = hm.weeks || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const windowIndices = weeks
    .map((wk, i) => ({ wk, i }))
    .filter(({ wk }) => {
      const d = rawData._meta.weekKeyToDate['Week ending ' + wk];
      return d && new Date(d) >= today;
    })
    .slice(0, 12);

  // First available: first week in rolling window where total booked hours drop below 45h
  windowIndices.forEach(({ wk, i }) => {
    const hrs = emp.weeklyHours[i] || 0;
  });
  const firstAvailEntry = windowIndices.find(({ i }) => (emp.weeklyHours[i] || 0) < 45);
  let firstAvailHtml;
  if (firstAvailEntry) {
    const isoDate = rawData._meta.weekKeyToDate['Week ending ' + firstAvailEntry.wk];
    const d = new Date(isoDate + 'T00:00:00');
    const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const hrs = emp.weeklyHours[firstAvailEntry.i] || 0;
    firstAvailHtml = `
      <div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.25);border-radius:10px;padding:14px 18px;margin-bottom:20px">
        <div style="font-size:11px;color:#8892B0;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">First Available</div>
        <div style="font-size:20px;font-weight:700;color:#4ADE80">Wk ending ${dateLabel}</div>
        <div style="font-size:12px;color:#8892B0;margin-top:2px">${hrs}h booked that week</div>
      </div>`;
  } else {
    firstAvailHtml = `
      <div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:10px;padding:14px 18px;margin-bottom:20px">
        <div style="font-size:12px;color:#F87171">Fully booked for the next 12 weeks</div>
      </div>`;
  }

  // Current projects rolling off: present in week 0 with hours, compare to week 1
  const w0Projs = (emp.weeklyProjects[0] || []).filter(p => p.hours > 0);
  const w1Projs = emp.weeklyProjects[1] || [];
  const projectRows = w0Projs.length
    ? w0Projs.map(p => {
        const nextHrs = (w1Projs.find(q => q.project === p.project) || {}).hours || 0;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
          <span style="color:#CDD9F5;font-size:13px">${_esc(p.project)}</span>
          <span style="color:#8892B0;font-size:12px;font-weight:600">${p.hours}h → ${nextHrs}h</span>
        </div>`;
      }).join('')
    : '<div style="color:#8892B0;font-size:13px;padding:8px 0">No active projects this week</div>';

  // CTA: close modal → navigate to staffing tab → scroll + flash heatmap row
  const ctaBtn = `<button
    data-name="${_esc(empName)}" onclick="closeDrilldown();_rollingOffNavigate(this.dataset.name)"
    style="margin-top:24px;width:100%;padding:11px 0;background:#3B82F6;border:none;border-radius:9px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:0.01em"
    onmouseover="this.style.background='#2563EB'"
    onmouseout="this.style.background='#3B82F6'">Change Assignment</button>`;

  const title = `${empName}${emp.level ? ' · ' + emp.level : ''}${emp.skillSet ? ' · ' + emp.skillSet : ''}`;
  openDrilldown(title, `
    ${firstAvailHtml}
    <div>
      <div style="font-size:11px;color:#8892B0;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">Current Projects Rolling Off</div>
      ${projectRows}
    </div>
    ${ctaBtn}`);
}

// ── Rolling Off Soon — view-all grouped drilldown (#155) ──────────
function drillAllRollingOff() {
  const hm = rawData.heatmap;
  if (!hm) {
    openDrilldown('Rolling Off Soon', '<p class="dd-empty">No heatmap data loaded yet.</p>');
    return;
  }
  const weeks = hm.weeks || [];
  const results = [];
  for (const emp of hm.employees) {
    const w0 = emp.weeklyHours[0] || 0;
    const w1 = emp.weeklyHours[1] || 0;
    const w2 = emp.weeklyHours[2] || 0;
    if (w0 < 20) continue;
    if (w0 - w1 >= 20) {
      results.push({ name: emp.name, level: emp.level || '—', skillSet: emp.skillSet || '',
        fromH: w0, toH: w1, weekLabel: weeks[1] || 'next week', urgency: 'coral', drop: w0 - w1 });
    } else if (w0 - w2 >= 20) {
      results.push({ name: emp.name, level: emp.level || '—', skillSet: emp.skillSet || '',
        fromH: w0, toH: w2, weekLabel: weeks[2] || 'week 3', urgency: 'yellow', drop: w0 - w2 });
    }
  }
  results.sort((a, b) => a.urgency === b.urgency ? b.drop - a.drop : a.urgency === 'coral' ? -1 : 1);

  if (!results.length) {
    openDrilldown('Rolling Off Soon', '<p class="dd-empty">No major roll-offs in the next 2 weeks.</p>');
    return;
  }

  const groupedRows = buildGroupedRows(results, e => e.level, e => {
    const urgencyColor = e.urgency === 'coral' ? '#FFB3B3' : '#FFF3A3';
    return `<tr>
      <td><a style="color:#CDD9F5;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2)" onclick="closeDrilldown();drillRollingOff('${_esc(e.name)}')">${_esc(e.name)}</a></td>
      <td style="color:#8892B0;font-size:12px">${_esc(e.level)}</td>
      <td style="color:#8892B0;font-size:12px">${_esc(e.skillSet) || '—'}</td>
      <td style="color:${urgencyColor};font-size:12px">${_esc(e.weekLabel)}</td>
      <td style="background:rgba(255,179,179,0.08);color:${urgencyColor};font-weight:600;border-left:2px solid ${urgencyColor}">${e.fromH}h → ${e.toH}h</td>
      <td><button onclick="event.stopPropagation();closeDrilldown();_rollingOffNavigate('${_esc(e.name)}')" style="padding:4px 10px;background:#3B82F6;border:none;border-radius:6px;color:#fff;font-size:11px;cursor:pointer;font-family:inherit">Change Assignment</button></td>
    </tr>`;
  }, 6, true);

  openDrilldown(`Rolling Off Soon (${results.length})`, `
    <div style="padding:0 0 8px">
      <button onclick="ddToggleExpandAll(this)" style="padding:4px 10px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#CDD9F5;font-size:11px;cursor:pointer;font-family:inherit">\u229F Collapse all</button>
    </div>
    <table class="dd-table">
      <thead><tr>
        <th>Employee</th><th>Level</th><th>Skill Set</th><th>Roll-off Week</th><th>Hours Change</th><th></th>
      </tr></thead>
      <tbody>${groupedRows}</tbody>
    </table>`);
}

// Navigate to staffing tab + scroll to employee row + CSS amber flash (#141)
function _rollingOffNavigate(name) {
  navigateToEmployee(name);
  setTimeout(() => {
    const td = Array.from(document.querySelectorAll('td.hm-name-cell'))
      .find(el => el.dataset.emp === name);
    if (!td) return;
    const tr = td.closest('tr');
    tr.classList.add('hm-row-flash-amber');
    setTimeout(() => tr.classList.remove('hm-row-flash-amber'), 3000);
  }, 500);
}

// Navigate to staffing tab + scroll to first overallocated week + amber flash (#142)
function _overallocatedNavigate(name) {
  closeDrilldown();
  navigateToEmployee(name);
  setTimeout(() => {
    const td = Array.from(document.querySelectorAll('td.hm-name-cell'))
      .find(el => el.dataset.emp === name);
    if (!td) {
      console.warn('[_overallocatedNavigate] row not found for:', name);
      return;
    }
    const tr = td.closest('tr');
    tr.classList.add('hm-row-flash-amber');
    setTimeout(() => tr.classList.remove('hm-row-flash-amber'), 3000);

    // Scroll horizontally to first overallocated cell
    const idxCells = Array.from(tr.querySelectorAll('td[data-idx]'));
    const firstOver = idxCells.find(td => parseInt(td.textContent, 10) > 45);
    if (firstOver) {
      firstOver.scrollIntoView({ inline: 'center', behavior: 'smooth' });
    }
  }, 500);
}

// ── Overallocated Resources (Row 2 right bottom) ─────────────────────────
function renderOverallocated(heatmapData) {
  const el = document.getElementById('ovNeedsAttention');
  if (!el) return;
  if (!heatmapData || !heatmapData.employees) {
    el.innerHTML = '<div class="ov-empty ok">✓ No overallocated consultants</div>'; return;
  }
  const weeks = heatmapData.weeks || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const windowIndices = weeks
    .map((wk, i) => ({ wk, i }))
    .filter(({ wk }) => {
      const d = rawData._meta.weekKeyToDate['Week ending ' + wk];
      return d && new Date(d) >= today;
    })
    .slice(0, 12);

  const overallocated = [];
  for (const emp of heatmapData.employees) {
    const overWeeks = windowIndices
      .filter(({ i }) => (emp.weeklyHours[i] || 0) > 45)
      .map(({ wk, i }) => ({ wk, hrs: emp.weeklyHours[i] }));
    if (!overWeeks.length) continue;
    const worstWeek = overWeeks.reduce((a, b) => b.hrs > a.hrs ? b : a);
    overallocated.push({ name: emp.name, level: emp.level, skillSet: emp.skillSet, overWeeks, worstWeek });
  }
  overallocated.sort((a, b) => b.worstWeek.hrs - a.worstWeek.hrs);

  if (!overallocated.length) {
    el.innerHTML = '<div class="ov-empty ok">✓ No overallocated consultants</div>'; return;
  }

  // T2/T3: Update panel header count to always reflect true total
  const panel = el.closest('.ov-panel');
  if (panel) {
    const titleSpan = panel.querySelector('.ov-panel-title');
    if (titleSpan) titleSpan.textContent = `⚠ Overallocated Resources (${overallocated.length})`;
  }

  // T2/T3: Show up to 4 rows; append "View all (N)" link if more exist
  const rowsHtml = overallocated.slice(0, 4).map(r =>
    `<div class="ov-cliff-item dd-clickable" style="border-left-color:#F97316" onclick="drillOverallocated()" title="Click for overallocation details">
      <div class="ov-cliff-name">${r.name}</div>
      <div class="ov-cliff-meta">${r.level || '—'}${r.skillSet ? ' · ' + r.skillSet : ''}</div>
      <div class="ov-cliff-detail">
        <span style="color:#F97316;font-size:11px">Peak: Wk ending ${r.worstWeek.wk}</span>
        <span class="ov-cliff-hours">${r.worstWeek.hrs}h</span>
      </div>
    </div>`
  ).join('');

  const viewAllHtml = overallocated.length > 4
    ? `<div style="text-align:center;padding:6px 0 2px"><a style="color:#F97316;font-size:12px;cursor:pointer;text-decoration:none;font-weight:500" onclick="drillOverallocated()">View all (${overallocated.length})</a></div>`
    : '';

  el.innerHTML = rowsHtml + viewAllHtml;
}

function drillOverallocated() {
  const hm = rawData.heatmap;
  if (!hm) {
    openDrilldown('Overallocated Resources', '<p class="dd-empty">No heatmap data loaded yet.</p>');
    return;
  }
  const weeks = hm.weeks || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const windowIndices = weeks
    .map((wk, i) => ({ wk, i }))
    .filter(({ wk }) => {
      const d = rawData._meta.weekKeyToDate['Week ending ' + wk];
      return d && new Date(d) >= today;
    })
    .slice(0, 12);

  const overallocated = [];
  for (const emp of hm.employees) {
    const overWeeks = windowIndices
      .filter(({ i }) => (emp.weeklyHours[i] || 0) > 45)
      .map(({ wk, i }) => ({ wk, hrs: emp.weeklyHours[i] }));
    if (!overWeeks.length) continue;
    const worstWeek = overWeeks.reduce((a, b) => b.hrs > a.hrs ? b : a);
    overallocated.push({ name: emp.name, level: emp.level || '—', skillSet: emp.skillSet || '', overWeeks, worstWeek });
  }
  overallocated.sort((a, b) => b.worstWeek.hrs - a.worstWeek.hrs);

  if (!overallocated.length) {
    openDrilldown('Overallocated Resources', '<p class="dd-empty">No overallocated consultants in the next 12 weeks.</p>');
    return;
  }

  const groupedRows = buildGroupedRows(overallocated, e => e.level, e => {
    const weeksStr = e.overWeeks.map(w => `${w.wk}: ${w.hrs}h`).join(' · ');
    return `<tr>
      <td>${_esc(e.name)}</td>
      <td style="color:#8892B0;font-size:12px">${_esc(e.level)}</td>
      <td style="background:rgba(249,115,22,0.12);color:#F97316;font-weight:600;border-left:2px solid #F97316">${e.worstWeek.hrs}h <span style="font-size:11px;color:#8892B0;font-weight:400">Wk ending ${_esc(e.worstWeek.wk)}</span></td>
      <td style="font-size:11px;color:#8892B0">${_esc(weeksStr)}</td>
      <td><button onclick="event.stopPropagation();closeDrilldown();_overallocatedNavigate('${_esc(e.name)}')" style="padding:4px 10px;background:#3B82F6;border:none;border-radius:6px;color:#fff;font-size:11px;cursor:pointer;font-family:inherit">Change Assignment</button></td>
    </tr>`;
  }, 5, true);

  openDrilldown(`Overallocated Resources (${overallocated.length})`, `
    <div style="padding:0 0 8px">
      <button onclick="ddToggleExpandAll(this)" style="padding:4px 10px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#CDD9F5;font-size:11px;cursor:pointer;font-family:inherit">\u229F Collapse all</button>
    </div>
    <table class="dd-table">
      <thead><tr>
        <th>Employee</th><th>Level</th><th>Worst Week</th><th>Over-45h Weeks</th><th></th>
      </tr></thead>
      <tbody>${groupedRows}</tbody>
    </table>`);
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
  if (hours <= 10)   return 'rgba(239,68,68,0.08)';    // 0–10h — red: severely underutilized
  if (hours <= 44)   return 'rgba(250,204,21,0.07)';   // 11–44h — yellow: partially utilized
  if (hours === 45)  return 'rgba(16,185,129,0.07)';   // 45h — green: perfectly utilized
  return 'rgba(245,158,11,0.07)';                       // 46h+ — amber: overallocated
}

function heatmapCellFg(hours, weekDate) {
  if (hours <= 10) return '#F87171'; // 0–10h — red to draw attention
  return '#E2E8F0';
}

function heatmapCellBorder(hours) {
  if (hours <= 10)   return '#EF4444'; // 0–10h — red: severely underutilized
  if (hours <= 44)   return '#FACC15'; // 11–44h — yellow: partially utilized
  if (hours === 45)  return '#10B981'; // 45h — green: perfectly utilized
  return '#F97316';                    // 46h+ — orange: overallocated
}

function heatmapCellClass(hours) {
  if (hours <= 10)   return 'hm-bench';
  if (hours <= 44)   return 'hm-partial';
  if (hours === 45)  return 'hm-utilized';
  return 'hm-over';
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
    const st  = h0 === 0 ? 'BENCH — fully available' : h0 <= 34 ? 'AVAILABLE — has capacity' : h0 <= 45 ? 'UTILIZED — fully staffed' : 'OVERALLOCATED — exceeds capacity';
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
      const _empFg  = isPending ? '#F59E0B' : '';
      const _curCls = i === _hmCurWeek ? ' hm-col-current' : '';
      const _utilCls = isPending ? '' : ` ${heatmapCellClass(displayH)}`;
      return `<td class="hm-cell${isPending ? ' hm-cell-pending' : ''}${_curCls}${_utilCls}"
        style="${_empFg ? `color:${_empFg};` : ''}border-left:${_empBl}"
        data-emp="${sn}" data-idx="${i}" data-tip="${ct}" data-cell-type="emp-total"
        onmousedown="if(_editActiveCell)_editActiveCell=null;"
        onclick="empTotalCellClick(event,this)"
        onmouseenter="showHmTooltip(event,this)"
        onmousemove="positionHmTooltip(event)"
        onmouseleave="hideHmTooltip()">${displayH}</td>`;
    }).join('');
    return `<tr class="hm-emp-row">
      <td class="hm-name-cell" data-emp="${sn}" data-cid="${_esc(emp.id||'')}" data-tip="${tip}"
        onmouseenter="showEmpTip(event,this)"
        onmousemove="moveEmpTip(event)"
        onmouseleave="hideEmpTip()">
        <div class="hm-name-inner" onmousedown="if(_editActiveCell)_editActiveCell=null;">
          <span class="hm-chevron" onclick="toggleHmExpand(this.closest('td').dataset.emp)" title="Expand/collapse">${chv}</span>
          <div class="hm-name-text"${emp.id ? ` onclick="openConsultantProfileEditor(this.closest('td').dataset.cid)" title="Open consultant profile"` : ''}><div class="hm-emp-name">${emp.name}</div></div>
        </div>
        <div class="hm-row-actions">
          <span class="hm-info-icon"
            onclick="event.stopPropagation();drillHeatmapEmployee(this.closest('td').dataset.emp)"
            title="Full booking history">ℹ</span>
          ${_hmCanEdit() ? `<span class="hm-add-proj-btn"
            onclick="event.stopPropagation();openAddProjectModal(this.closest('td').dataset.emp)"
            title="Add project assignment">+</span>` : ''}
        </div>
      </td>${cells}</tr>`;
  }

  if (row.type === 'sub') {
    const { emp, projName } = row;
    const sn = encodeAttr(emp.name);
    const cells = emp.weeklyProjects.map((wkProjs, i) => {
      const match = wkProjs.find(p => p.project === projName);
      const origH = match ? match.hours : 0;

      const weekLabel = _vsData ? _vsData.weeks[i] : '';
      const fillKey   = `${emp.name}||${weekLabel}||${projName}`;
      const pending   = _pendingStaffing.has(fillKey) ? _pendingStaffing.get(fillKey) : null;
      const h         = pending !== null ? pending : origH;

      const isActive = _editActiveCell &&
        _editActiveCell.empName === emp.name && _editActiveCell.weekIdx === i &&
        _editActiveCell.project === projName;
      if (isActive) {
        // Use pending value if one exists so navigating back shows the committed value,
        // not the original server value (which would cause hmCellBlur to delete the pending entry).
        const activeVal = pending !== null ? pending : origH;
        return `<td class="hm-sub-cell hm-cell-editing">
          <input class="hm-cell-input" type="number" min="0" max="100"
            value="${activeVal}" data-original="${origH}" data-emp="${sn}" data-idx="${i}" data-proj="${encodeAttr(projName)}"
            onblur="hmCellBlur(this)"
            onkeydown="hmCellKeydown(event,this)"
            onfocus="this.select()"></td>`;
      }
      const isPending = pending !== null;

      const _subBl = isPending ? '3px solid #F59E0B' : `3px solid ${heatmapCellBorder(h)}`;
      const _subUtilCls = isPending ? '' : ` ${heatmapCellClass(h)}`;

      if (_hmCanEdit()) {
        return `<td class="hm-sub-cell hm-cell-editable${isPending ? ' hm-cell-pending' : ''}${_subUtilCls}"
          style="background:#161820;${isPending ? 'color:#F59E0B;' : ''}border-left:${_subBl}"
          data-emp="${sn}" data-idx="${i}" data-proj="${encodeAttr(projName)}"
          onclick="hmSubCellClick(this)">${h > 0 ? h : '—'}</td>`;
      }
      const _bl = `3px solid ${heatmapCellBorder(h)}`;
      return `<td class="hm-sub-cell${_subUtilCls}" style="background:#161820;border-left:${_bl}">${h > 0 ? h : '—'}</td>`;
    }).join('');
    return `<tr class="hm-sub-row hm-sub-visible">
      <td class="hm-sub-name-cell" data-emp="${sn}">
        <span class="hm-sub-indent">${encodeAttr(projName)}</span>
        <span class="hm-sub-info-icon"
          onclick="event.stopPropagation();drillHeatmapEmployee(this.closest('td').dataset.emp)"
          title="Full booking history">ℹ</span>
      </td>${cells}</tr>`;
  }

  if (row.type === 'total') {
    const cells = row.emp.weeklyHours.map((h, i) => {
      const pendingH = _pendingDisplayTotal(row.emp.name, i);
      const displayH = pendingH !== null ? pendingH : h;
      const isPending = pendingH !== null;
      const _totBl = isPending ? '3px solid #F59E0B' : `3px solid ${heatmapCellBorder(h)}`;
      const _totUtilCls = isPending ? '' : ` ${heatmapCellClass(h)}`;
      return `<td class="hm-sub-cell hm-sub-total-cell${isPending ? ' hm-cell-pending' : ''}${_totUtilCls}" style="background:#161820;${isPending ? 'color:#F59E0B;' : ''}border-left:${_totBl}">${displayH}</td>`;
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
  let bench = 0, avail = 0, utilized = 0, over = 0, totalAvail = 0;
  for (const emp of employees) {
    const h = emp.weeklyHours[0] || 0;
    totalAvail += Math.max(0, 45 - h);
    if (h <= 10) bench++; else if (h <= 44) avail++; else if (h === 45) utilized++; else over++;
  }
  const badge = document.getElementById('heatmapBadge');
  if (badge) { badge.textContent = `${totalAvail}h available this week`; badge.className = 'chart-badge'; }

  _hmCurWeek = _computeCurWeekIdx(weeks);
  const wkThs = weeks.map((w, i) =>
    `<th class="hm-week-th dd-clickable${i === _hmCurWeek ? ' hm-col-current' : ''}" onclick="drillHeatmapWeek(${i})" title="Click for week availability">${w}</th>`
  ).join('');

  const swatches = [
    { color: '#DA291C', label: '0–10h — Underutilized' },
    { color: '#E8A317', label: '11–44h — Partial' },
    { color: '#86BC25', label: '45h — Utilized' },
    { color: '#00A3E0', label: '46h+ — Overbooked' },
  ].map(s => `<div class="hm-swatch-item"><span class="hm-swatch-bar" style="background:${s.color}"></span>${s.label}</div>`).join('');

  container.innerHTML = `
    <div class="hm-controls-row">
      <div class="hm-pill-btns">
        <button id="hmToggleAll" class="hm-pill-btn hm-toggle-expand" onclick="hmToggleAll()">⊞ Expand All</button>
      </div>
    </div>
    <div class="hm-scroll-wrap" onscroll="hmVsScroll()">
      <table class="hm-table">
        <thead><tr><th class="hm-name-th">Employee<span style="float:right;font-size:9px;color:#64748B;font-weight:400;letter-spacing:0.05em">WK ENDING →</span></th>${wkThs}</tr></thead>
        <tbody id="hmTbody"></tbody>
      </table>
    </div>
    <div class="hm-legend">
      <div class="hm-legend-swatches">${swatches}</div>
      <div class="hm-legend-stats">
        <span style="color:#10B981;font-weight:600">${totalAvail}h available this week</span>
        <span style="color:#6B6F76;margin-left:16px">Bench: ${bench} · Available: ${avail} · Utilized: ${utilized} · Overallocated: ${over}</span>
      </div>
      <div class="hm-legend-hint">Hover employee name for details · Click ▶ to expand project breakdown</div>
    </div>`;

  _buildVsAllRows();
  _vsRenderVisible();
  _updateHmPillBtns();
  _updateQuickFillVisibility();
}

// ── Expand / Collapse (virtual-scroll aware) ──────────────────────
function toggleHmExpand(empName, focusWeekIdx = 0) {
  const expanding = !_hmExpanded.has(empName);
  // When collapsing: clear active cell before re-render so blur doesn't trigger a second re-render
  if (!expanding) _editActiveCell = null;
  if (_hmExpanded.has(empName)) _hmExpanded.delete(empName);
  else _hmExpanded.add(empName);
  _buildVsAllRows();
  _vsRenderVisible();
  _updateHmPillBtns();
  _updateQuickFillVisibility();

  // On expand: activate + focus the first editable cell in the target week (#128)
  if (expanding && _hmCanEdit()) {
    const emp = _vsData && _vsData.employees.find(e => e.name === empName);
    if (!emp) return;
    const allProjects = [];
    for (const wkProjs of emp.weeklyProjects)
      for (const p of wkProjs)
        if (!allProjects.includes(p.project)) allProjects.push(p.project);
    if (!allProjects.length) return;
    _editActiveCell = { empName, weekIdx: focusWeekIdx, project: allProjects[0] };
    _buildVsAllRows();
    _vsRenderVisible();
    setTimeout(() => {
      const ni = document.querySelector('.hm-cell-editing input');
      if (ni) { ni.focus(); ni.select(); }
    }, 0);
  }
}

function _updateQuickFillVisibility() {
  const bar = document.getElementById('hmQuickFillBar');
  if (!bar) return;
  if (_hmCanEdit()) {
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

  openDrilldown(`${empName} — Wk ending ${week}`, `
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

  const editBtn = _hmCanEdit() && emp.id
    ? `<button type="button"
         data-cid="${_esc(emp.id)}"
         onclick="closeDrilldown();openConsultantProfileEditor(this.dataset.cid)"
         style="margin-left:auto;padding:5px 14px;background:rgba(168,199,250,0.1);border:1px solid rgba(168,199,250,0.25);border-radius:7px;color:#A8C7FA;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;flex-shrink:0"
         onmouseover="this.style.background='rgba(168,199,250,0.18)'" onmouseout="this.style.background='rgba(168,199,250,0.1)'">Edit Profile</button>`
    : '';

  openDrilldown(`${empName} — Full Booking History`, `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      <div class="dd-stat"><div class="dd-stat-value">${avg}h</div><div class="dd-stat-label">Avg / Week</div></div>
      <div class="dd-stat"><div class="dd-stat-value">${peak}h</div><div class="dd-stat-label">Peak (${peakWeek})</div></div>
      <div class="dd-stat"><div class="dd-stat-value">${benchWks}</div><div class="dd-stat-label">Bench Weeks</div></div>
      ${editBtn}
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

  const allEmps = hm.employees.map(emp => {
    const h = emp.weeklyHours[weekIdx] || 0;
    return { name: emp.name, level: emp.level, skillSet: emp.skillSet, hours: h, avail: Math.max(0, 45 - h) };
  });
  const totalAvail = allEmps.reduce((s, e) => s + e.avail, 0);

  const groupedRows = buildGroupedRows(allEmps, e => e.level, e => {
    const stat = utilStatus(e.hours);
    return `<tr>
      <td>${e.name}</td>
      <td style="font-size:12px;color:#8892B0">${e.skillSet || '—'}</td>
      <td>${e.hours}h</td>
      <td style="color:#A8E6CF;font-weight:600">${e.avail}h free</td>
      <td><span class="dd-badge ${stat.cls}">${stat.label}</span></td>
    </tr>`;
  }, 5);

  openDrilldown(`Wk ending ${week} — Availability Summary`, `
    <div style="margin-bottom:16px"><span style="color:#A8E6CF;font-weight:700;font-size:15px">${totalAvail}h</span> <span style="color:#8892B0">total available across ${hm.employees.length} employees</span></div>
    <table class="dd-table">
      <thead><tr><th>Employee</th><th>Skill Set</th><th>Booked</th><th>Available</th><th>Status</th></tr></thead>
      <tbody>${groupedRows}</tbody>
    </table>`);
}

// ── Needs Tab AI Recommendations State ───────────────────────────
const _needs = {
  recommendations: null,  // cached from /api/recommendations; array matching demand order
  loadState: 'idle',      // 'idle' | 'loading' | 'loaded' | 'error'
  expanded: new Set(),    // set of currently expanded roleIdx
  pending: [],            // [{ needIdx, need, consultant }]
};

// ── Open Needs ────────────────────────────────────────────────────
const NEEDS_CLIENT_COLORS = ['#86BC25', '#00A3E0', '#86EB22', '#A0DCFF', '#005587', '#B7E320'];

function _urgencyBadge(startDate) {
  if (!startDate) return '<span class="urgency-planned">Planned</span>';
  const p = String(startDate).split('/');
  if (p.length < 3) return '<span class="urgency-planned">Planned</span>';
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
  const daysOut = (d - today) / 86400000;
  if (daysOut <= 14) return '<span class="urgency-urgent">Urgent</span>';
  if (daysOut <= 28) return '<span class="urgency-soon">Soon</span>';
  return '<span class="urgency-planned">Planned</span>';
}

function renderCoverageChart(openNeeds) {
  if (charts.coverage) charts.coverage.destroy();
  if (!openNeeds) return;

  // Reset recommendations cache on data refresh (preserve pending)
  _needs.recommendations = null;
  _needs.loadState = 'idle';
  _needs.expanded.clear();
  _needsClientFilter = null;
  _collapsedNeedsClients = new Set();

  const roles = openNeeds.roles || [];
  const total = roles.length;

  const badge = document.getElementById('coverageBadge');
  badge.textContent = total ? `${total} open needs` : 'No open needs';
  badge.className   = 'chart-badge ' + (total === 0 ? 'ok' : 'warn');

  // Build client → count map for donut segments
  const clientCounts = {};
  for (const r of roles) { const c = r.client || 'Unknown'; clientCounts[c] = (clientCounts[c] || 0) + 1; }
  const clientEntries = Object.entries(clientCounts);
  const clientColors  = clientEntries.map((_, i) => NEEDS_CLIENT_COLORS[i % NEEDS_CLIENT_COLORS.length]);

  charts.coverage = new Chart(document.getElementById('chartCoverage'), {
    type: 'doughnut',
    data: {
      labels: clientEntries.map(([c]) => c),
      datasets: [{
        data: total === 0 ? [1] : clientEntries.map(([,n]) => n),
        backgroundColor: total === 0 ? ['#2E3250'] : clientColors,
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: window.devicePixelRatio || 2,
      cutout: '62%',
      animation: { animateRotate: true, animateScale: false },
      onClick(evt, elements) {
        const clicked = elements.length ? clientEntries[elements[0].index][0] : null;
        if (!clicked || _needsClientFilter === clicked) {
          _needsClientFilter = null;
        } else {
          _needsClientFilter = clicked;
        }
        applyNeedsFilter();
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: '#1E2235',
          titleColor: '#FFFFFF',
          bodyColor: '#C9D1D9',
          borderColor: '#3D4466',
          borderWidth: 1,
          cornerRadius: 6,
          padding: 10,
          displayColors: true,
          boxPadding: 4,
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (item) => {
              const count = item.raw;
              return ` ${count} open need${count !== 1 ? 's' : ''}`;
            },
          },
        },
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
    legendEl.innerHTML = clientEntries.map(([client, count], i) =>
      `<div class="cov-legend-item" data-filter-client="${_esc(client)}" style="cursor:pointer" title="Click to filter">
        <span class="cov-legend-dot" style="background:${clientColors[i]}"></span>
        <span class="cov-legend-label">${_esc(client)}</span>
        <span class="cov-legend-count">${count}</span>
      </div>`
    ).join('');
    legendEl.querySelectorAll('.cov-legend-item').forEach(el => {
      el.addEventListener('click', () => {
        const c = el.dataset.filterClient;
        _needsClientFilter = _needsClientFilter === c ? null : c;
        applyNeedsFilter();
      });
    });
  }

  const tableEl = document.getElementById('coverageTable');
  if (!roles.length) {
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

  // Group roles by client, preserving original index for expansion
  const grouped = {};
  roles.forEach((r, i) => {
    const client = r.client || 'Unassigned';
    if (!grouped[client]) grouped[client] = [];
    grouped[client].push({ r, i });
  });
  const sortedClients = Object.keys(grouped).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });
  const urgencyRank = (startDate) => {
    if (!startDate) return 2;
    const p = String(startDate).split('/');
    if (p.length < 3) return 2;
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
    const diffDays = (d - today) / 86400000;
    if (diffDays <= 14) return 0;
    if (diffDays <= 28) return 1;
    return 2;
  };

  // All client sections start collapsed
  sortedClients.forEach(c => _collapsedNeedsClients.add(c));

  let rows = '';
  for (const client of sortedClients) {
    const group = grouped[client];
    group.sort((a, b) => urgencyRank(a.r.startDate) - urgencyRank(b.r.startDate));
    const count = group.length;
    rows += `<tr class="needs-client-header" data-client-group="${_esc(client)}" onclick="toggleNeedsClientGroup(this)" style="cursor:pointer">
      <td colspan="8"><span class="needs-client-chevron" style="margin-right:8px;color:var(--text-muted);font-size:11px">▶</span><span class="needs-client-name">${_esc(client)}</span><span class="needs-client-count">(${count} ${count === 1 ? 'need' : 'needs'})</span></td>
    </tr>`;
    for (const { r, i } of group) {
      const needCtx = JSON.stringify({needId: r._needId || null, projectName: r.project, hoursPerWeek: r.hoursPerWeek, startDate: r.startDate, endDate: r.endDate, levelRequired: r.level}).replace(/"/g,'&quot;');
      const canEditNeed = (_hmCanEdit() || currentUserRole === 'project_manager') && r._needId;
      const editBtn = canEditNeed
        ? `<button class="need-edit-btn" data-needid="${_esc(r._needId)}" onclick="openEditNeedModal(this.dataset.needid,event)">Edit</button>`
        : '';
      const abandonBtn = (_hmCanEdit() && r._needId)
        ? `<button class="need-abandon-btn" data-needid="${_esc(r._needId)}" onclick="abandonNeed(this.dataset.needid,event)">Abandon</button>`
        : '';
      const assignBtn = (_hmCanEdit() && r._needId)
        ? `<button class="need-assign-btn" data-needid="${_esc(r._needId)}" onclick="openBulkAssignModal(this.dataset.needid,event)">&#128101; Assign</button>`
        : '';
      rows += `
      <tr class="dd-clickable need-row" data-client="${_esc(r.client || 'Unassigned')}" data-needid="${_esc(r._needId || '')}" style="display:none" onclick="toggleNeedExpansion(${i}, event)" title="Click to see AI-matched consultants">
        <td class="col-project" style="padding-left:20px"><span class="need-chevron" id="need-chev-${i}">›</span>${r.project || '—'}</td>
        <td class="col-skill">${r.skillSet ? `<span class="skill-pill clickable-pill" data-skill="${_esc(r.skillSet)}" data-need-context="${needCtx}" onclick="onSkillPillClick(this)">${_esc(r.skillSet)}</span>` : '—'}</td>
        <td>${r.level || '—'}</td>
        <td class="col-center">${r.hoursPerWeek ? r.hoursPerWeek + 'h' : '—'}</td>
        <td class="col-center">${fmtDate(r.startDate)}</td>
        <td class="col-center">${fmtDate(r.endDate)}</td>
        <td>${_urgencyBadge(r.startDate)}</td>
        <td class="col-actions">${assignBtn}${editBtn}${abandonBtn}</td>
      </tr>
      <tr class="need-expansion-row hidden" id="need-exp-${i}">
        <td colspan="8" class="need-expansion-cell">
          <div class="need-match-panel" id="need-match-panel-${i}">
            <div class="need-match-loading">Finding matches…</div>
          </div>
        </td>
      </tr>`;
    }
  }

  tableEl.innerHTML = `
    <div style="padding:0 0 10px">
      <button class="needs-expand-collapse-btn" onclick="toggleAllNeedsClients()" style="padding:4px 10px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#CDD9F5;font-size:11px;cursor:pointer;font-family:inherit">Expand All</button>
    </div>
    <table>
      <thead><tr>
        <th>Project</th><th>Skill</th><th>Level</th>
        <th class="col-center">Hrs/Wk</th>
        <th class="col-center">Start</th>
        <th class="col-center">End</th>
        <th>Urgency</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Helper: open skill set modal from a pill element, passing optional need context
function onSkillPillClick(el) {
  const skillName   = el.dataset.skill;
  const needContext = el.dataset.needContext ? JSON.parse(el.dataset.needContext) : null;
  openSkillSetModal(skillName, needContext);
}

// ── Needs donut filter (by client) ───────────────────────────────
function applyNeedsFilter() {
  const chart = charts.coverage;

  // Show/hide need rows (respects both client filter and collapsed state)
  document.querySelectorAll('#coverageTable .need-row').forEach(tr => {
    const match = !_needsClientFilter || tr.dataset.client === _needsClientFilter;
    const collapsed = _collapsedNeedsClients.has(tr.dataset.client);
    const show = match && !collapsed;
    tr.style.display = show ? '' : 'none';
    // Also hide the paired expansion row when not shown
    const exp = tr.nextElementSibling;
    if (exp && exp.classList.contains('need-expansion-row') && !show) {
      exp.classList.add('hidden');
    }
  });
  // Show/hide client header rows
  document.querySelectorAll('#coverageTable .needs-client-header').forEach(tr => {
    const match = !_needsClientFilter || tr.dataset.clientGroup === _needsClientFilter;
    tr.style.display = match ? '' : 'none';
  });

  // Update filter label on legend
  const legendEl = document.getElementById('coverageLegend');
  if (legendEl) {
    legendEl.querySelectorAll('.cov-legend-item').forEach(el => {
      const isActive = _needsClientFilter === el.dataset.filterClient;
      el.style.opacity = _needsClientFilter && !isActive ? '0.4' : '1';
      el.style.fontWeight = isActive ? '600' : '';
    });
  }

  // Outline active chart segment
  if (chart && chart.data && chart.data.datasets[0]) {
    const ds = chart.data.datasets[0];
    const labels = chart.data.labels || [];
    ds.borderColor = labels.map(l => _needsClientFilter === l ? '#FFFFFF' : 'transparent');
    ds.borderWidth = labels.map(l => _needsClientFilter === l ? 3 : 0);
    chart.update('none');
  }
}

// ── Needs tab: collapsible client groups (#198) ───────────────────

function toggleNeedsClientGroup(headerTr) {
  const client = headerTr.dataset.clientGroup;
  const nowCollapsed = !_collapsedNeedsClients.has(client);
  if (nowCollapsed) {
    _collapsedNeedsClients.add(client);
  } else {
    _collapsedNeedsClients.delete(client);
  }
  const chev = headerTr.querySelector('.needs-client-chevron');
  if (chev) chev.textContent = nowCollapsed ? '▶' : '▼';
  document.querySelectorAll('#coverageTable .need-row').forEach(tr => {
    if (tr.dataset.client !== client) return;
    const inFilter = !_needsClientFilter || tr.dataset.client === _needsClientFilter;
    const show = !nowCollapsed && inFilter;
    tr.style.display = show ? '' : 'none';
    const exp = tr.nextElementSibling;
    if (exp && exp.classList.contains('need-expansion-row') && nowCollapsed) {
      exp.classList.add('hidden');
    }
  });
  const tableEl = document.getElementById('coverageTable');
  const headers = tableEl ? tableEl.querySelectorAll('.needs-client-header') : [];
  const allCollapsed = Array.from(headers).every(h => _collapsedNeedsClients.has(h.dataset.clientGroup));
  const btn = tableEl ? tableEl.querySelector('.needs-expand-collapse-btn') : null;
  if (btn) btn.textContent = allCollapsed ? 'Expand All' : 'Collapse All';
}

function toggleAllNeedsClients() {
  const tableEl = document.getElementById('coverageTable');
  if (!tableEl) return;
  const headers = tableEl.querySelectorAll('.needs-client-header');
  const anyExpanded = Array.from(headers).some(h => !_collapsedNeedsClients.has(h.dataset.clientGroup));
  headers.forEach(h => {
    const client = h.dataset.clientGroup;
    if (anyExpanded) {
      _collapsedNeedsClients.add(client);
    } else {
      _collapsedNeedsClients.delete(client);
    }
    const chev = h.querySelector('.needs-client-chevron');
    if (chev) chev.textContent = anyExpanded ? '▶' : '▼';
  });
  applyNeedsFilter();
  const btn = tableEl.querySelector('.needs-expand-collapse-btn');
  if (btn) btn.textContent = anyExpanded ? 'Expand All' : 'Collapse All';
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
    apiFetch('/api/recommendations')
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
    const coveragePct = Math.min(100, Math.round((m.availableHours / hoursNeeded) * 100));
    const badgeClass  = coveragePct >= 100 ? 'badge-avail-green'
                      : coveragePct >= 50  ? 'badge-avail-yellow'
                      : 'badge-avail-coral';
    return `
      <div class="match-card">
        <div class="match-card-info">
          <div class="match-card-name">${_esc(m.employeeName)}</div>
          <div class="match-card-meta">${_esc(m.level)} · ${_esc(m.skillSet)}</div>
          <div class="match-card-reasoning">${_esc(m.reasoning || '')}</div>
        </div>
        <div class="match-card-right">
          <span class="match-avail-badge ${badgeClass}">${m.availableHours}h of ${hoursNeeded}h (${coveragePct}%)</span>
          ${isAccepted
            ? '<button class="match-accept-btn accepted" disabled>Accepted</button>'
            : `<button class="match-accept-btn" onclick="acceptMatch(${roleIdx}, ${mi}, event)">Accept</button>`
          }
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `<div class="match-cards-container">${cards}</div>`;
}

async function acceptMatch(needIdxOrMatch, matchIdx, event) {
  // Direct match object path — called from skill set modal (no recommendations context needed)
  if (needIdxOrMatch !== null && typeof needIdxOrMatch === 'object') {
    const m = needIdxOrMatch;
    await saveAllAssignments([{
      type:         'add',
      employeeName: m.consultantName,
      project:      m.projectName,
      skillSet:     m.skillSet || '',
      startDate:    m.startDate,
      endDate:      m.endDate,
      hoursPerWeek: Number(m.hoursPerWeek),
      needId:       m.needId || null,
    }]);
    return;
  }

  // Original recommendations engine path
  const needIdx = needIdxOrMatch;
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
  await saveAllAssignments();
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

async function abandonNeed(needId, event) {
  if (event) event.stopPropagation();
  if (!confirm('Abandon this need? It will be removed from the pipeline.')) return;
  try {
    const res = await apiFetch(`/api/needs/${encodeURIComponent(needId)}/close`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reason: 'abandoned' }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    showToast('Need abandoned', 'success');
    loadDashboard();
  } catch (e) {
    showToast(`Failed to abandon need: ${e.message}`, 'error');
  }
}

async function saveAllAssignments(overrideChanges) {
  const saveBtn = document.getElementById('needsSaveBtn');
  if (saveBtn && !overrideChanges) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

  const changes = overrideChanges ?? _needs.pending.map(p => ({
    type:         'add',
    employeeName: p.consultant.employeeName,
    project:      p.need.projectName,
    skillSet:     p.consultant.skillSet,
    startDate:    p.need.startDate,
    endDate:      p.need.endDate,
    hoursPerWeek: Number(p.need.hoursPerWeek),
    needId:       p.need._needId || null,
  }));

  try {
    const res  = await apiFetch('/api/supply/update', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ changes }),
    });
    const data = await res.json();
    if (res.status === 423) {
      if (overrideChanges) throw new Error(data.error || 'Assignment locked');
      const countEl = document.getElementById('needsPendingCount');
      if (countEl) { countEl.textContent = data.error; countEl.style.color = 'var(--coral)'; }
      return;
    }
    if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);

    // Show toast if any needs were auto-closed as fully staffed
    if (data.closedNeedIds && data.closedNeedIds.length > 0) {
      showToast('Need fully staffed — closed automatically', 'success');
    }

    if (overrideChanges) {
      // Direct-save path (skill set modal): just refresh dashboard data
      await loadDashboard();
      return;
    }

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
    if (overrideChanges) throw err; // re-throw so skill modal handler can show the toast
    showToast(`Save failed: ${err.message}`, 'error');
  } finally {
    if (saveBtn && !overrideChanges) { saveBtn.disabled = false; saveBtn.textContent = 'Save All'; }
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
// ── Skill Set Modal (#152) ────────────────────────────────────────
async function openSkillSetModal(skillName, needContext = null, source = 'needs') {
  openDrilldown(skillName, '<p class="dd-empty" style="color:#8892B0">Loading…</p>');
  try {
    const res  = await apiFetch(`/api/skill-sets/${encodeURIComponent(skillName)}/consultants`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) {
      openDrilldown(skillName, '<p class="dd-empty">Failed to load consultants.</p>');
      return;
    }
    const countLine = `<p style="font-size:12px;color:#8892B0;padding:0 0 4px 0">${data.length} consultant${data.length !== 1 ? 's' : ''} with this skill</p>`;
    const needLine  = needContext
      ? `<p style="font-size:12px;color:#CDD9F5;padding:0 0 12px 0;opacity:0.8">Resource Allocation for: <strong>${_esc(needContext.projectName)}</strong> · ${needContext.hoursPerWeek}h/wk</p>`
      : '';
    const subtitle  = countLine + needLine;
    if (!data.length) {
      openDrilldown(skillName, subtitle + '<p class="dd-empty">No consultants found with this skill.</p>');
      return;
    }
    const normalized = data.map(c => ({ ...c, level: c.level?.name ?? c.level ?? '—' }));
    const groupedRows = buildGroupedRows(normalized, c => c.level, c => {
      const booked = c.bookedHours || 0;
      const avail  = Math.max(0, 45 - booked);
      const cls    = booked === 0    ? 'hm-bench'
                   : booked <= 10    ? 'hm-bench'
                   : booked < 45     ? 'hm-partial'
                   : booked === 45   ? 'hm-utilized'
                   : 'hm-over';
      const acceptCell = needContext
        ? `<td><button class="match-accept-btn skill-modal-accept-btn" data-emp="${_esc(c.name)}">Accept</button></td>`
        : '';
      return `<tr>
        <td><span class="drill-link" style="color:#CDD9F5;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2)" data-name="${_esc(c.name)}" data-cid="${_esc(c.id || '')}">${_esc(c.name)}</span></td>
        <td style="color:#8892B0;font-size:12px">${_esc(c.level || '—')}</td>
        <td style="color:#8892B0;font-size:12px">${_esc(c.location || '—')}</td>
        <td><span class="dd-avail-badge ${cls}" style="padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${avail}h avail</span></td>
        ${acceptCell}
      </tr>`;
    }, 4, true);
    const actionHeader = needContext ? '<th>Action</th>' : '';
    openDrilldown(skillName, `
      ${subtitle}
      <div style="padding:0 0 8px">
        <button onclick="ddToggleExpandAll(this)" style="padding:4px 10px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#CDD9F5;font-size:11px;cursor:pointer;font-family:inherit">\u229F Collapse all</button>
      </div>
      <table class="dd-table">
        <thead><tr><th>Consultant</th><th>Level</th><th>Location</th><th>This Week</th>${actionHeader}</tr></thead>
        <tbody>${groupedRows}</tbody>
      </table>`);

    // Attach name-click listeners (closure-safe, handles apostrophe names like Delaney O'Neil)
    document.querySelectorAll('#drilldownBody .drill-link').forEach(el => {
      el.addEventListener('click', () => {
        closeDrilldown();
        if (source === 'settings') {
          openConsultantProfileEditor(el.dataset.cid);
        } else {
          navigateToEmployee(el.dataset.name);
        }
      });
    });

    // Attach Accept button handlers when opened from a need pill
    if (needContext) {
      document.querySelectorAll('#drilldownBody .skill-modal-accept-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const consultantName = btn.dataset.emp;
          const c = normalized.find(x => x.name === consultantName);
          btn.disabled = true;
          btn.textContent = '…';
          try {
            await acceptMatch({
              consultantId:  c?.id ?? null,
              consultantName,
              needId:        needContext.needId,
              projectName:   needContext.projectName,
              hoursPerWeek:  needContext.hoursPerWeek,
              startDate:     needContext.startDate,
              endDate:       needContext.endDate,
              levelRequired: needContext.levelRequired,
              skillSet:      skillName,
            });
            btn.textContent = 'Accepted \u2713';
            btn.style.background = '#10b981';
            btn.style.color = '#fff';
            btn.classList.add('accepted');
            setTimeout(() => {
              closeDrilldown();
              navigateTo('staffing');
            }, 800);
          } catch (err) {
            showToast(`Failed to accept: ${err.message}`, 'error');
            btn.disabled = false;
            btn.textContent = 'Accept';
          }
        });
      });
    }
  } catch (err) {
    console.error('[skillModal] error:', err);
    openDrilldown(skillName, '<p class="dd-empty">Error loading data.</p>');
  }
}

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

// Toggle expand/collapse all grouped rows in a drilldown modal (#142 T5)
function ddToggleExpandAll(btn) {
  const body = document.getElementById('drilldownBody');
  const rows = body.querySelectorAll('tr[data-g]');
  const shouldExpand = Array.from(rows).some(r => r.style.display === 'none');
  rows.forEach(r => { r.style.display = shouldExpand ? '' : 'none'; });
  body.querySelectorAll('tr[onclick] .gc').forEach(gc => { gc.textContent = shouldExpand ? '\u25BC' : '\u25BA'; });
  btn.textContent = shouldExpand ? '\u229F Collapse all' : '\u229E Expand all';
}

// ── Drilldown 1: Utilization by Level ─────────────────────────────
function drillUtilization(level) {
  const levelMap = {};
  for (const emp of rawData.employees) levelMap[emp.employeeName] = emp.level;

  const empAverages = buildEmpAverages();

  const empsAtLevel = rawData.employees.filter(e => e.level === level);
  if (!empsAtLevel.length) {
    openDrilldown(`${level} — Availability Detail`,
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

  openDrilldown(`${level} — Availability Detail`, `
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

// ── Drilldown 4: Open Need — Role Detail ─────────────────────────
function drillCoverage(roleIdx) {
  const role = ((rawData.openNeeds || {}).roles || [])[roleIdx];
  if (!role) return;

  const roleCard = `
    <div class="dd-role-card">
      <div class="dd-role-row"><span>Urgency</span><b>${_urgencyBadge(role.startDate)}</b></div>
      <div class="dd-role-row"><span>Client</span><b>${role.client || '—'}</b></div>
      <div class="dd-role-row"><span>Project</span><b>${role.project || '—'}</b></div>
      <div class="dd-role-row"><span>Level Needed</span><b>${role.level || '—'}</b></div>
      <div class="dd-role-row"><span>Skill Set</span><b>${role.skillSet || '—'}</b></div>
      <div class="dd-role-row"><span>Dates</span><b>${role.startDate || '—'} – ${role.endDate || '—'}</b></div>
      <div class="dd-role-row"><span>Hours Per Week</span><b>${role.hoursPerWeek || '—'}h/wk</b></div>
    </div>`;

  openDrilldown(
    `${role.level || '—'} — ${role.skillSet || '—'}`,
    roleCard
  );
}

// ══════════════════════════════════════════════════════════════════
// ── KPI Card Drilldowns ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

const LEVEL_ORDER = ['Partner/MD', 'Senior Manager', 'Manager', 'Senior Consultant', 'Consultant', 'Analyst'];

// ── Grouped rows helper for drilldown consultant lists ────────────
// items: array of data objects
// getLevelFn: item => level string
// renderRowFn: item => '<tr>...</tr>' HTML string
// colCount: number of <td> columns (for header colspan)
// expanded: if true, groups start open (default false = collapsed)
// Returns tbody HTML with collapsible level groups.
function buildGroupedRows(items, getLevelFn, renderRowFn, colCount, expanded = false) {
  const groups = {};
  for (const item of items) {
    const lvl = getLevelFn(item);
    const key = LEVEL_ORDER.indexOf(lvl) >= 0 ? lvl : '__other__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  const pfx = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let gi = 0, html = '';
  for (const level of [...LEVEL_ORDER, '__other__']) {
    const grp = groups[level];
    if (!grp || !grp.length) continue;
    const label = level === '__other__' ? 'Other' : level;
    const gid = pfx + gi++;
    const arrow = expanded ? '\u25BC' : '\u25BA';
    html += `<tr onclick="(function(hdr){var rs=hdr.parentNode.querySelectorAll('[data-g=${gid}]');var open=rs[0]&&rs[0].style.display!='none';rs.forEach(function(r){r.style.display=open?'none':'';});hdr.querySelector('.gc').textContent=open?'\u25BA':'\u25BC';})(this)" style="background:var(--surface2,#2E3250);cursor:pointer"><td colspan="${colCount}" style="padding:6px 12px;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-secondary,#8892B0)"><span class="gc">${arrow}</span>&nbsp;${label} (${grp.length})</td></tr>`;
    for (const item of grp) {
      let row = renderRowFn(item);
      row = row.replace(/<tr(\s[^>]*)?>/, (m, attrs) => {
        const a = attrs || '';
        const sm = a.match(/style="([^"]*)"/);
        const rest = a.replace(/\s*style="[^"]*"/, '').trim();
        const existing = sm ? sm[1].trim() : '';
        if (expanded) {
          return `<tr${rest ? ' ' + rest : ''} data-g="${gid}"${existing ? ` style="${existing}"` : ''}>`;
        }
        const s = existing ? existing + ';display:none' : 'display:none';
        return `<tr${rest ? ' ' + rest : ''} data-g="${gid}" style="${s}">`;
      });
      html += row;
    }
  }
  return html;
}

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

  const groupedRows = buildGroupedRows(sorted, e => e.level, emp => {
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
  }, 6, true);

  openDrilldown(`All Employees — Headcount Detail (${sorted.length})`, `
    <div style="padding:0 0 8px">
      <button onclick="ddToggleExpandAll(this)" style="padding:4px 10px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#CDD9F5;font-size:11px;cursor:pointer;font-family:inherit">\u229F Collapse all</button>
    </div>
    <table class="dd-table">
      <thead><tr>
        <th>Employee</th><th>Level</th><th>Skill Set</th>
        <th>Avg Hours</th><th>Status</th><th>Active Projects</th>
      </tr></thead>
      <tbody>${groupedRows}</tbody>
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

  // Build rolling window (current week forward, max 12) — use weekKeyToDate map from meta.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const windowWeeks = weekKeys.filter(wk => {
    const d = rawData._meta.weekKeyToDate[wk];
    return d && new Date(d) >= today;
  }).slice(0, 12);
  const windowWeekCount  = windowWeeks.length;
  const consultantCount  = allEmps.length;
  const weekCount        = windowWeeks.length;
  const totalWindowHrs   = Object.values(empAverages).reduce((s, info) =>
    s + windowWeeks.reduce((a, wk) => a + (info.weekTotals[wk] || 0), 0), 0);
  const totalAvg = consultantCount
    ? Math.round((totalWindowHrs / (45 * consultantCount * windowWeekCount)) * 100)
    : 0;

  const groupedRows = buildGroupedRows(allEmps, e => e.level, e => {
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
  }, 6, true);

  const summary = `<tr style="border-top:1px solid #2E3250;font-weight:600">
    <td colspan="3" style="color:#8892B0;padding-top:12px">Overall Average</td>
    <td style="padding-top:12px"><b>${totalAvg}%</b></td>
    <td colspan="2"></td>
  </tr>`;

  openDrilldown('Utilization Breakdown — All Employees', `
    <div style="padding:0 0 8px">
      <button onclick="ddToggleExpandAll(this)" style="padding:4px 10px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#CDD9F5;font-size:11px;cursor:pointer;font-family:inherit">\u229F Collapse all</button>
    </div>
    <table class="dd-table">
      <thead><tr>
        <th>Employee</th><th>Level</th><th>Avg Hours</th>
        <th>Util %</th><th>Status</th><th>Trend vs Last Wk</th>
      </tr></thead>
      <tbody>${groupedRows}${summary}</tbody>
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

  const groupedRows = buildGroupedRows(benched, e => e.level, e => {
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
  }, 6, true);

  const legend = benched.some(e => e.consecutive >= 2)
    ? '<p style="font-size:11px;color:#FFB3B3;margin-bottom:12px">● Benched 2+ consecutive weeks</p>'
    : '';

  openDrilldown(`Bench Report — Available Resources (${benched.length})`,
    legend + `
    <div style="padding:0 0 8px">
      <button onclick="ddToggleExpandAll(this)" style="padding:4px 10px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#CDD9F5;font-size:11px;cursor:pointer;font-family:inherit">\u229F Collapse all</button>
    </div>
    <table class="dd-table">
      <thead><tr>
        <th>Employee</th><th>Level</th><th>Skill Set</th>
        <th>This Week</th><th>Consecutive</th><th>Last Active Project</th>
      </tr></thead>
      <tbody>${groupedRows}</tbody>
    </table>`);
}

// ── KPI Drilldown 4: Open Needs — grouped by project (#197) ──────
function drillDemandKPI() {
  const roles = (rawData.openNeeds || {}).roles || [];
  if (!roles.length) {
    openDrilldown('Open Needs', '<p class="dd-empty">No open needs.</p>');
    return;
  }

  // Group by project, sort alphabetically
  const byProject = {};
  roles.forEach((role, i) => {
    const proj = role.project || 'Unassigned';
    if (!byProject[proj]) byProject[proj] = [];
    byProject[proj].push({ role, i });
  });
  const sortedProjects = Object.keys(byProject).sort((a, b) => {
    if (a === 'Unassigned') return 1;
    if (b === 'Unassigned') return -1;
    return a.localeCompare(b);
  });

  const pfx = 'ddneed' + Date.now().toString(36);
  let gi = 0, rows = '';
  for (const proj of sortedProjects) {
    const group = byProject[proj];
    const gid   = pfx + gi++;
    rows += `<tr onclick="(function(h){var rs=h.parentNode.querySelectorAll('[data-g=${gid}]');var open=rs[0]&&rs[0].style.display!='none';rs.forEach(function(r){r.style.display=open?'none':'';});h.querySelector('.gc').textContent=open?'\u25BA':'\u25BC';})(this)" style="background:var(--surface2,#2E3250);cursor:pointer">
      <td colspan="6" style="padding:8px 12px;font-weight:600;font-size:13px;color:var(--text-primary)"><span class="gc">\u25BA</span>&nbsp;${_esc(proj)}&nbsp;<span style="font-weight:400;color:var(--text-muted);font-size:11px">(${group.length})</span></td>
    </tr>`;
    for (const { role, i } of group) {
      rows += `<tr class="dd-clickable" data-g="${gid}" style="display:none" onclick="drillCoverage(${i})" title="Click for detail">
        <td style="font-size:12px;padding-left:24px">${_esc(role.level || '—')}</td>
        <td style="font-size:12px">${_esc(role.skillSet || '—')}</td>
        <td style="font-size:12px;text-align:center">${role.hoursPerWeek ? role.hoursPerWeek + 'h/wk' : '—'}</td>
        <td style="font-size:11px;color:#8892B0;text-align:center">${_esc(role.startDate || '—')}</td>
        <td style="font-size:11px;color:#8892B0;text-align:center">${_esc(role.endDate || '—')}</td>
        <td>${_urgencyBadge(role.startDate)}</td>
      </tr>`;
    }
  }

  openDrilldown(`Open Needs (${roles.length})`,
    `<div style="padding:0 0 8px">
      <button onclick="ddToggleExpandAll(this)" style="padding:4px 10px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#CDD9F5;font-size:11px;cursor:pointer;font-family:inherit">\u229E Expand all</button>
    </div>
    <table class="dd-table">
      <thead><tr>
        <th>Level</th><th>Skill Set</th>
        <th style="text-align:center">Hrs/Wk</th>
        <th style="text-align:center">Start</th>
        <th style="text-align:center">End</th>
        <th>Urgency</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

// ── Ask Claude — Dynamic Suggested Questions ──────────────────────
const STATIC_FALLBACK_QUESTIONS = [
  'Who has the most available capacity this week?',
  'Which projects have open staffing needs?',
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
    const res = await apiFetch('/api/suggested-questions', { method: 'POST' });
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
    const res = await apiFetch(url);
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
  if (!_hmCanEdit()) {
    // Non-edit roles (executive, project_manager): open cell drilldown
    drillHeatmapCell(cell.dataset.emp, parseInt(cell.dataset.idx) || 0);
    return;
  }
  evt.stopPropagation();

  // Auto-expand (or focus correct week if already expanded)
  const empName = cell.dataset.emp;
  const clickedWeekIdx = parseInt(cell.dataset.idx) || 0;
  if (empName) {
    if (!_hmExpanded.has(empName)) {
      toggleHmExpand(empName, clickedWeekIdx);
    } else if (_hmCanEdit()) {
      // Already expanded — just focus the first project cell in the clicked week
      const emp = _vsData && _vsData.employees.find(e => e.name === empName);
      if (emp) {
        const allProjects = [];
        for (const wkProjs of emp.weeklyProjects)
          for (const p of wkProjs)
            if (!allProjects.includes(p.project)) allProjects.push(p.project);
        if (allProjects.length) {
          _editActiveCell = { empName, weekIdx: clickedWeekIdx, project: allProjects[0] };
          _buildVsAllRows();
          _vsRenderVisible();
          setTimeout(() => {
            const ni = document.querySelector('.hm-cell-editing input');
            if (ni) { ni.focus(); ni.select(); }
          }, 0);
        }
      }
    }
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

function hmSubCellClick(el) {
  if (!_hmCanEdit()) return;  // guard: only project-level sub-cells should call this
  const empName = el.dataset.emp;
  const weekIdx = parseInt(el.dataset.idx);
  const project = el.dataset.proj;
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
    const emp = _vsData && _vsData.employees.find(e => e.name === empName);
    const origMatch = ((emp && emp.weeklyProjects[weekIdx]) || []).find(p => p.project === project);
    const origVal = origMatch ? origMatch.hours : 0;
    if (newVal === origVal) {
      _pendingStaffing.delete(key); // no change — keep/restore clean state
    } else {
      _pendingStaffing.set(key, newVal);
    }
  } else {
    // Total-row edit: distribute proportionally across existing projects
    const emp = _vsData && _vsData.employees.find(e => e.name === empName);
    const origProjs = (emp && emp.weeklyProjects[weekIdx]) || [];
    const origTotal = (emp && emp.weeklyHours[weekIdx]) || 0;

    if (newVal === origTotal) {
      // No change to total — do not dirty any project entries
    } else if (origProjs.length === 0 || origTotal === 0) {
      // No existing projects — create Unassigned entry
      if (newVal > 0) _pendingStaffing.set(`${empName}||${weekLabel}||Unassigned`, newVal);
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
    // Cancel edit — restore original server value, clear any pending change for this cell
    const _escWeekIdx = parseInt(input.dataset.idx);
    const _escEmpName = input.dataset.emp;
    const _escProject = input.dataset.proj || null;
    const _escWeekLabel = _vsData ? _vsData.weeks[_escWeekIdx] : null;
    if (_escProject && _escWeekLabel) {
      _pendingStaffing.delete(`${_escEmpName}||${_escWeekLabel}||${_escProject}`);
    }
    _editActiveCell = null;
    _buildVsAllRows();
    _vsRenderVisible();
    return;
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    const weekIdx = parseInt(input.dataset.idx);
    const empName = input.dataset.emp;
    const project = input.dataset.proj || null;
    hmCellBlur(input); // commit first
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
    return;
  }
  // ArrowLeft/Right = navigate to previous/next week column (commit first)
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    const weekIdx = parseInt(input.dataset.idx);
    const empName = input.dataset.emp;
    const project = input.dataset.proj || null;
    hmCellBlur(input); // commit pending changes map before navigating
    const maxWeek = (_vsData ? _vsData.weeks.length : 1) - 1;
    const nextIdx = event.key === 'ArrowLeft' ? weekIdx - 1 : weekIdx + 1;
    if (nextIdx >= 0 && nextIdx <= maxWeek) {
      _editActiveCell = { empName, weekIdx: nextIdx, project };
      _buildVsAllRows();
      _vsRenderVisible();
      setTimeout(() => {
        const ni = document.querySelector('.hm-cell-editing input');
        if (ni) { ni.focus(); ni.select(); }
      }, 0);
    }
    return;
  }
  // Enter = move down (same column, next row); ArrowDown/Up = move within column
  if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); // prevent number input spin on arrow keys
    const weekIdx = parseInt(input.dataset.idx);
    const empName = input.dataset.emp;
    const project = input.dataset.proj || null;
    if (!project) { if (event.key === 'Enter') hmCellBlur(input); return; } // total row — commit on Enter, no navigation
    const goDown = event.key !== 'ArrowUp';

    // Returns ordered project list for any employee (same order as sub-rows)
    const empProjects = emp => {
      const ps = [];
      for (const wkProjs of emp.weeklyProjects)
        for (const p of wkProjs)
          if (!ps.includes(p.project)) ps.push(p.project);
      return ps;
    };

    // Returns all heatmap employees in display order (mirrors _buildVsAllRows)
    const orderedEmps = () => {
      const byLevel = {};
      for (const e of (_vsData ? _vsData.employees : [])) {
        if (!byLevel[e.level]) byLevel[e.level] = [];
        byLevel[e.level].push(e);
      }
      const out = [];
      for (const level of LEVEL_ORDER) for (const e of (byLevel[level] || [])) out.push(e);
      return out;
    };

    const emp = _vsData && _vsData.employees.find(e => e.name === empName);
    if (!emp) return;
    const allProjects = empProjects(emp);
    const curIdx = allProjects.indexOf(project);
    if (curIdx === -1) return;
    const nextProjIdx = goDown ? curIdx + 1 : curIdx - 1;

    if (nextProjIdx >= 0 && nextProjIdx < allProjects.length) {
      // Within same consultant — move to next/prev project row
      hmCellBlur(input);
      _editActiveCell = { empName, weekIdx, project: allProjects[nextProjIdx] };
      _buildVsAllRows();
      _vsRenderVisible();
      setTimeout(() => { const ni = document.querySelector('.hm-cell-editing input'); if (ni) { ni.focus(); ni.select(); } }, 0);
      return;
    }

    // At consultant boundary — cross to adjacent consultant
    const emps = orderedEmps();
    const empIdx = emps.findIndex(e => e.name === empName);
    if (empIdx === -1) { if (event.key === 'Enter') hmCellBlur(input); return; }
    const targetEmpIdx = goDown ? empIdx + 1 : empIdx - 1;
    if (targetEmpIdx < 0 || targetEmpIdx >= emps.length) {
      // Absolute boundary: Enter commits + blurs; arrows do nothing
      if (event.key === 'Enter') hmCellBlur(input);
      return;
    }
    // Skip past collapsed employees (no projects) to find first expanded one
    let _nextEmpIdx = targetEmpIdx;
    while (_nextEmpIdx >= 0 && _nextEmpIdx < emps.length && !empProjects(emps[_nextEmpIdx]).length) {
      _nextEmpIdx = goDown ? _nextEmpIdx + 1 : _nextEmpIdx - 1;
    }
    if (_nextEmpIdx < 0 || _nextEmpIdx >= emps.length) {
      // No expanded employee found in that direction — commit and blur cleanly
      if (event.key === 'Enter') hmCellBlur(input);
      return;
    }
    const targetEmp = emps[_nextEmpIdx];
    const targetProjects = empProjects(targetEmp);
    if (!targetProjects.length) {
      // Still empty after loop (shouldn't happen) — blur cleanly on Enter
      if (event.key === 'Enter') hmCellBlur(input);
      return;
    }
    // targetEmp is already expanded (empProjects returned non-empty); ensure set membership
    if (!_hmExpanded.has(targetEmp.name)) _hmExpanded.add(targetEmp.name);
    hmCellBlur(input);
    _editActiveCell = {
      empName: targetEmp.name,
      weekIdx,
      project: goDown ? targetProjects[0] : targetProjects[targetProjects.length - 1]
    };
    _buildVsAllRows();
    _vsRenderVisible();
    // Poll for the active-cell input to appear (virtual scroll may not have rendered it yet)
    let _navAttempts = 0;
    const _navPoll = setInterval(() => {
      const nameTd = document.querySelector(`td.hm-sub-name-cell[data-emp="${CSS.escape(targetEmp.name)}"]`);
      const cell = nameTd && nameTd.closest('tr').querySelector('.hm-cell-editing input');
      if (cell) { cell.focus(); cell.select(); clearInterval(_navPoll); return; }
      if (++_navAttempts >= 20) clearInterval(_navPoll);
    }, 50);
  }
}

// ── Quick Fill ────────────────────────────────────────────────────
// Employee, Project, From date, To date, and hours are all required.
// Always writes via POST /api/save-staffing (API path); never touches _pendingStaffing.
// After a successful write the heatmap refreshes and all fields are cleared.
async function applyQuickFill() {
  const empFilter  = document.getElementById('qfEmployee')?.value?.trim() || null;
  const projFilter = document.getElementById('qfProject')?.value?.trim() || null;
  const fromVal    = document.getElementById('qfFrom')?.value || null;
  const toVal      = document.getElementById('qfTo')?.value || null;
  const hoursRaw   = document.getElementById('qfHours')?.value;
  const hours      = Math.max(0, Math.min(100, Number(hoursRaw) || 0));

  if (!_vsData) { showToast('Heatmap data not loaded yet.', 'error'); return; }
  if (hoursRaw === '' || hoursRaw === null || hoursRaw === undefined) {
    showToast('Enter hours per week before applying Quick Fill.', 'error');
    return;
  }
  if (!empFilter || !projFilter) {
    showToast('Select an employee and enter a project before applying Quick Fill.', 'error');
    return;
  }
  if (!fromVal || !toVal) {
    showToast('Select a date range before applying Quick Fill.', 'error');
    return;
  }

  let fromDate = new Date(fromVal + 'T00:00:00');
  let toDate   = new Date(toVal   + 'T00:00:00');
  if (fromDate > toDate) {
    showToast('From date must be before To date.', 'error');
    return;
  }

  const year = new Date().getFullYear();

  // Build one entry per heatmap week that falls within the selected date range
  const changes = [];
  for (let weekIdx = 0; weekIdx < _vsData.weeks.length; weekIdx++) {
    const weekLabel = _vsData.weeks[weekIdx];
    const m = weekLabel.match(/(\d+)\/(\d+)/);
    if (!m) continue;
    const wkDate = new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
    if (wkDate < fromDate) continue;
    if (wkDate > toDate)   continue;
    changes.push({ employeeName: empFilter, weekLabel, project: projFilter, hours });
  }

  if (!changes.length) {
    showToast('No heatmap weeks fall within the selected date range.', 'error');
    return;
  }

  try {
    const res = await apiFetch('/api/save-staffing', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ changes }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);
    await loadDashboard();
    const n = changes.length;
    showToast(`Quick Fill: assigned ${empFilter} to ${projFilter} for ${n} week${n === 1 ? '' : 's'}.`, 'success');
    // Clear all Quick Fill fields so the bar is ready for the next entry
    const qfEmp = document.getElementById('qfEmployee');
    if (qfEmp) qfEmp.value = '';
    const qfProj = document.getElementById('qfProject');
    if (qfProj) qfProj.value = '';
    const qfFrom = document.getElementById('qfFrom');
    if (qfFrom) qfFrom.value = '';
    const qfTo = document.getElementById('qfTo');
    if (qfTo) qfTo.value = '';
    const qfHours = document.getElementById('qfHours');
    if (qfHours) qfHours.value = '';
  } catch (err) {
    showToast(`Quick Fill failed: ${err.message}`, 'error');
  }
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
    const res = await apiFetch('/api/save-staffing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
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
    showToast('Changes saved successfully', 'success', 5000);
    await new Promise(resolve => setTimeout(resolve, 1500));
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
  admin:            '#86BC25',
  resource_manager: '#00A3E0',
  project_manager:  '#E8A317',
  executive:        '#A0DCFF',
  consultant:       'rgba(255,255,255,0.5)',
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
let _inactiveConsultantsExpanded = false;

// ── Settings sub-nav ──────────────────────────────────────────────
function switchSettingsPanel(panel) {
  _settingsActivePanel = panel;
  document.querySelectorAll('.settings-subnav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.panel === panel);
  });
  const panelMap = { users: 'settingsPanelUsers', consultants: 'settingsPanelConsultants', sandbox: 'settingsPanelSandbox' };
  for (const [key, id] of Object.entries(panelMap)) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', key !== panel);
  }
  if (panel === 'users' && currentUserRole === 'admin') loadUsers();
  if (panel === 'consultants' && _hmCanEdit()) loadConsultantsPanel();
}

// ── Sandbox reset ─────────────────────────────────────────────────
async function resetSandbox() {
  if (!confirm('Are you sure? This will erase all data and re-seed.')) return;
  const btn = document.getElementById('resetSandboxBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Resetting…'; }
  try {
    const res = await apiFetch('/api/admin/reset-sandbox', { method: 'POST' });
    if (res.status === 403) {
      showToast('Cannot reset production environment', 'error');
      return;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      showToast(d.error || 'Reset failed', 'error');
      return;
    }
    showToast('Sandbox reset complete', 'success');
    setTimeout(() => location.reload(), 1500);
  } catch (err) {
    showToast('Reset failed: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Reset sandbox'; }
  }
}

// ── Settings panels: shared group header row ──────────────────────
function _renderSettingsGroupHeader(label, count, colSpan) {
  return `<tr style="background:rgba(255,255,255,0.025)">
    <td colspan="${colSpan}" style="padding:7px 20px 5px;font-size:11px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:#8892B0;border-bottom:1px solid rgba(255,255,255,0.06)">${_esc(label)}&ensp;<span style="font-weight:400;opacity:0.6">${count}</span></td>
  </tr>`;
}

// ── Consultants Management Panel (#126) ───────────────────────────
async function loadConsultantsPanel() {
  const tbody   = document.getElementById('consultantTableBody');
  const emptyEl = document.getElementById('consultantTableEmpty');
  const inactEl = document.getElementById('inactiveConsultantsSection');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="padding:32px 20px;text-align:center;color:#8892B0;font-size:13px">Loading…</td></tr>`;
  if (emptyEl) emptyEl.classList.add('hidden');
  if (inactEl) inactEl.innerHTML = '';

  let consultants;
  try {
    const res = await apiFetch('/api/consultants');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    consultants = await res.json();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:32px 20px;text-align:center;color:#FCA5A5;font-size:13px">Failed to load consultants: ${_esc(err.message)}</td></tr>`;
    return;
  }

  const active   = consultants.filter(c => c.is_active !== false);
  const inactive = consultants.filter(c => c.is_active === false);

  if (!active.length && !inactive.length) {
    tbody.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }

  if (active.length) {
    const byLevel = {};
    for (const c of active) {
      const key = LEVEL_ORDER.indexOf(c.level) >= 0 ? c.level : '__other__';
      if (!byLevel[key]) byLevel[key] = [];
      byLevel[key].push(c);
    }
    let html = '';
    for (const lvl of [...LEVEL_ORDER, '__other__']) {
      const grp = byLevel[lvl];
      if (!grp || !grp.length) continue;
      html += _renderSettingsGroupHeader(lvl === '__other__' ? 'Other' : lvl, grp.length, 6);
      html += grp.map(c => _renderConsultantRow(c)).join('');
    }
    tbody.innerHTML = html;
  } else {
    tbody.innerHTML = `<tr><td colspan="6" style="padding:32px 20px;text-align:center;color:#8892B0;font-size:13px">No active consultants</td></tr>`;
  }

  if (inactEl) _renderInactiveConsultantsSection(inactEl, inactive);
}

function _renderConsultantRow(c) {
  const levelCell    = c.level    ? `<span style="color:#C9B8FF;font-size:12px">${_esc(c.level)}</span>`    : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const skills       = Array.isArray(c.skillSets) ? c.skillSets : (c.primarySkillSet ? [{ name: c.primarySkillSet, type: 'Technology' }] : []);
  const skillPills   = skills.map(s => {
    const label = typeof s === 'string' ? s : s.name;
    return `<span class="skill-pill clickable-pill" data-skill="${_esc(label)}" onclick="openSkillSetModal(this.dataset.skill, null, 'settings')">${_esc(label)}</span>`;
  });
  const skillCell    = skillPills.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${skillPills.join('')}</div>` : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const locationCell = c.location ? `<span style="color:#8892B0;font-size:12px">${_esc(c.location)}</span>` : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const statusPill   = `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#10B981;background:#052E16;border:1px solid rgba(16,185,129,0.3)">Active</span>`;

  const nameCell = c.id
    ? `<span class="settings-name-link" data-cid="${_esc(c.id)}" onclick="openConsultantProfileEditor(this.dataset.cid)"
         style="color:#E2E8F0;cursor:pointer;font-weight:500"
         onmouseover="this.style.color='#A8C7FA';this.style.textDecoration='underline'"
         onmouseout="this.style.color='#E2E8F0';this.style.textDecoration='none'">${_esc(c.name)}</span>`
    : `<span style="color:#E2E8F0;font-weight:500">${_esc(c.name)}</span>`;

  const deactBtn = c.id
    ? `<button data-cid="${_esc(c.id)}" data-name="${_esc(c.name)}" onclick="deactivateConsultant(this.dataset.cid,this.dataset.name)"
         style="height:32px;padding:0 12px;background:rgba(252,165,165,.12);border:1px solid rgba(252,165,165,.25);border-radius:6px;color:#FCA5A5;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(252,165,165,.22)'" onmouseout="this.style.background='rgba(252,165,165,.12)'">Deactivate</button>`
    : '';

  return `<tr data-cid="${_esc(c.id)}" style="border-bottom:1px solid rgba(255,255,255,.05)">
    <td style="padding:13px 20px;white-space:nowrap">${nameCell}</td>
    <td style="padding:13px 16px">${levelCell}</td>
    <td style="padding:13px 16px">${skillCell}</td>
    <td style="padding:13px 16px">${locationCell}</td>
    <td style="padding:13px 16px">${statusPill}</td>
    <td style="padding:13px 20px">${deactBtn}</td>
  </tr>`;
}

function _renderInactiveConsultantsSection(container, consultants) {
  _inactiveConsultantsExpanded = false;
  const countBadge = consultants.length > 0 ? ` (${consultants.length})` : '';

  const rowsHtml = consultants.length === 0
    ? `<div style="padding:24px;text-align:center;color:#4A4D5A;font-size:13px">No inactive consultants</div>`
    : `<div class="chart-card" style="padding:0;overflow:hidden;margin-top:8px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tbody>${consultants.map(c => _renderInactiveConsultantRow(c)).join('')}</tbody>
        </table>
      </div>`;

  container.innerHTML = `
    <div style="margin-top:16px">
      <div onclick="toggleInactiveConsultants()"
           style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;padding:4px 0">
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.06)"></div>
        <span style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#4A4D5A;text-transform:uppercase;letter-spacing:0.08em;white-space:nowrap">
          <span id="inactiveConsultantsArrow" style="font-size:9px">${_inactiveConsultantsExpanded ? '▼' : '▶'}</span>
          Inactive Consultants${countBadge}
        </span>
        <div style="flex:1;height:1px;background:rgba(255,255,255,0.06)"></div>
      </div>
      <div id="inactiveConsultantsContent" style="overflow:hidden;${_inactiveConsultantsExpanded ? '' : 'display:none'}">
        ${rowsHtml}
      </div>
    </div>`;
}

function toggleInactiveConsultants() {
  _inactiveConsultantsExpanded = !_inactiveConsultantsExpanded;
  const content = document.getElementById('inactiveConsultantsContent');
  const arrow   = document.getElementById('inactiveConsultantsArrow');
  if (!content || !arrow) return;
  content.style.display = _inactiveConsultantsExpanded ? '' : 'none';
  arrow.textContent = _inactiveConsultantsExpanded ? '▼' : '▶';
}

function _renderInactiveConsultantRow(c) {
  const levelCell    = c.level    ? `<span style="color:#C9B8FF;font-size:12px">${_esc(c.level)}</span>`    : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const skills       = Array.isArray(c.skillSets) ? c.skillSets : (c.primarySkillSet ? [{ name: c.primarySkillSet, type: 'Technology' }] : []);
  const skillPills   = skills.map(s => {
    const label = typeof s === 'string' ? s : s.name;
    return `<span class="skill-pill clickable-pill" data-skill="${_esc(label)}" onclick="openSkillSetModal(this.dataset.skill, null, 'settings')">${_esc(label)}</span>`;
  });
  const skillCell    = skillPills.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${skillPills.join('')}</div>` : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const locationCell = c.location ? `<span style="color:#8892B0;font-size:12px">${_esc(c.location)}</span>` : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const statusPill   = `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#6B6F76;background:#1A1D27;border:1px solid rgba(255,255,255,0.1)">Inactive</span>`;

  const nameCell = c.id
    ? `<span class="settings-name-link" data-cid="${_esc(c.id)}" onclick="openConsultantProfileEditor(this.dataset.cid)"
         style="color:#E2E8F0;cursor:pointer;font-weight:500"
         onmouseover="this.style.color='#A8C7FA';this.style.textDecoration='underline'"
         onmouseout="this.style.color='#E2E8F0';this.style.textDecoration='none'">${_esc(c.name)}</span>`
    : `<span style="color:#E2E8F0;font-weight:500">${_esc(c.name)}</span>`;

  const reactBtn = c.id
    ? `<button data-cid="${_esc(c.id)}" data-name="${_esc(c.name)}" onclick="reactivateConsultant(this.dataset.cid,this.dataset.name)"
         style="height:32px;padding:0 12px;background:rgba(168,230,207,.12);border:1px solid rgba(168,230,207,.25);border-radius:6px;color:#A8E6CF;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(168,230,207,.22)'" onmouseout="this.style.background='rgba(168,230,207,.12)'">Reactivate</button>`
    : '';

  return `<tr data-cid="${_esc(c.id)}" style="border-bottom:1px solid rgba(255,255,255,.04);opacity:0.5">
    <td style="padding:13px 20px;white-space:nowrap">${nameCell}</td>
    <td style="padding:13px 16px">${levelCell}</td>
    <td style="padding:13px 16px">${skillCell}</td>
    <td style="padding:13px 16px">${locationCell}</td>
    <td style="padding:13px 16px">${statusPill}</td>
    <td style="padding:13px 20px">${reactBtn}</td>
  </tr>`;
}

async function deactivateConsultant(id, name) {
  if (!confirm(`Deactivate ${name}? They will be removed from scheduling.`)) return;
  try {
    const res = await apiFetch(`/api/consultants/${encodeURIComponent(id)}/deactivate`, { method: 'PATCH' });
    if (!res.ok) { showToast('Failed to deactivate consultant.', 'error'); return; }
    showToast(`${name} deactivated.`);
    loadConsultantsPanel();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function reactivateConsultant(id, name) {
  try {
    const res = await apiFetch(`/api/consultants/${encodeURIComponent(id)}/reactivate`, { method: 'PATCH' });
    if (!res.ok) { showToast('Failed to reactivate consultant.', 'error'); return; }
    showToast(`${name} reactivated.`, 'success');
    loadConsultantsPanel();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

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
    const res = await apiFetch('/api/admin/users');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    users = await res.json();
    _umUsers = users;
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

  if (activeUsers.length) {
    const ROLE_ORDER = ['admin', 'resource_manager', 'project_manager', 'executive'];
    const byRole = {};
    for (const u of activeUsers) {
      const key = ROLE_ORDER.includes(u.role) ? u.role : '__other__';
      if (!byRole[key]) byRole[key] = [];
      byRole[key].push(u);
    }
    let html = '';
    for (const role of [...ROLE_ORDER, '__other__']) {
      const grp = byRole[role];
      if (!grp || !grp.length) continue;
      const label = UM_ROLE_LABELS[role] || (role === '__other__' ? 'Other' : role);
      html += _renderSettingsGroupHeader(label, grp.length, 7);
      html += grp.map(u => _renderActiveRow(u)).join('');
    }
    tbody.innerHTML = html;
  } else {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:32px 20px;text-align:center;color:#8892B0;font-size:13px">No active users — invite someone above</td></tr>`;
  }

  if (deactEl) _renderDeactivatedSection(deactEl, deactivatedUsers);
}

function _renderActiveRow(u) {
  const roleColor  = UM_ROLE_COLORS[u.role] || '#8892B0';
  const roleLabel  = UM_ROLE_LABELS[u.role] || (u.role || '—');
  const isInvited  = u.status === 'pending';

  const roleOptions = Object.entries(UM_ROLE_LABELS)
    .map(([val, label]) => `<option value="${val}"${u.role === val ? ' selected' : ''}>${label}</option>`)
    .join('');

  const statusPill = isInvited
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#F59E0B;background:#451A03;border:1px solid rgba(245,158,11,0.3)">Pending</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#10B981;background:#052E16;border:1px solid rgba(16,185,129,0.3)">Active</span>`;

  const lastLoginCell = isInvited
    ? `<span style="color:#6B6F76;font-style:italic;font-size:12px">Never logged in</span>`
    : `<span style="color:#8892B0;font-size:12px">${umFmtDate(u.last_sign_in_at)}</span>`;

  const roleSelect = isInvited
    ? `<select disabled title="Role cannot be changed until the user accepts their invite" style="padding:4px 8px;background:#0F1117;border:0.5px solid rgba(255,255,255,0.06);border-radius:6px;color:#4A4D5A;font-size:13px;font-family:inherit;cursor:not-allowed;outline:none;opacity:0.5">${roleOptions}</select>`
    : `<select onchange="changeUserRole('${_esc(u.id)}', this.value, this)" style="padding:4px 8px;background:#0F1117;border:0.5px solid rgba(255,255,255,0.15);border-radius:6px;color:#FFFFFF;font-size:13px;font-family:inherit;cursor:pointer;outline:none">${roleOptions}</select>`;

  const actionBtns = isInvited
    ? `<button onclick="resendInvite('${_esc(u.id)}')"
         style="height:32px;padding:0 12px;background:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#9CA3AF;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background='transparent'">Resend Invite</button>
       <button onclick="cancelInvite('${_esc(u.id)}')"
         style="height:32px;padding:0 12px;background:transparent;border:1px solid rgba(239,68,68,0.3);border-radius:6px;color:#EF4444;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(239,68,68,.06)'" onmouseout="this.style.background='transparent'">Cancel Invite</button>`
    : `<button onclick="deactivateUser('${_esc(u.id)}')"
         style="height:32px;padding:0 12px;background:rgba(252,165,165,.12);border:1px solid rgba(252,165,165,.25);border-radius:6px;color:#FCA5A5;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(252,165,165,.22)'" onmouseout="this.style.background='rgba(252,165,165,.12)'">Deactivate</button>`;

  return `<tr style="border-bottom:1px solid rgba(255,255,255,.05);${isInvited ? 'opacity:0.75;' : ''}">
    <td style="padding:13px 20px;font-weight:500;white-space:nowrap"><span class="settings-name-link" data-uid="${_esc(u.id)}" onclick="openUserEditModal(this.dataset.uid)" style="color:#E2E8F0;cursor:pointer" onmouseover="this.style.color='#A8C7FA';this.style.textDecoration='underline'" onmouseout="this.style.color='#E2E8F0';this.style.textDecoration='none'">${_esc(u.name)}</span></td>
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
  _deactivatedExpanded = users.length > 0;
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
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
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
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/deactivate`, { method: 'PATCH' });
    if (!res.ok) { showToast('Failed to deactivate user.'); return; }
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

async function reactivateUser(userId) {
  try {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/reactivate`, { method: 'PATCH' });
    if (!res.ok) { showToast('Failed to reactivate user.'); return; }
    showToast('User reactivated successfully.', 'success');
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// ── User Edit Modal ────────────────────────────────────────────────

function openUserEditModal(userId) {
  const u = _umUsers.find(x => x.id === userId);
  if (!u) return;

  document.getElementById('umTitle').textContent = u.name || u.email || 'User';
  document.getElementById('umEmail').textContent = u.email || '—';

  const isInvited = u.status === 'pending';
  const statusPill = document.getElementById('umStatusPill');
  if (isInvited) {
    statusPill.textContent = 'Pending';
    statusPill.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#F59E0B;background:#451A03;border:1px solid rgba(245,158,11,0.3)';
  } else {
    statusPill.textContent = 'Active';
    statusPill.style.cssText = 'display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#10B981;background:#052E16;border:1px solid rgba(16,185,129,0.3)';
  }

  const roleSel = document.getElementById('umRoleSelect');
  roleSel.innerHTML = Object.entries(UM_ROLE_LABELS)
    .map(([val, label]) => `<option value="${val}"${u.role === val ? ' selected' : ''}>${label}</option>`)
    .join('');
  roleSel.disabled = isInvited;
  roleSel.dataset.uid  = u.id;
  roleSel.dataset.prev = u.role;

  const note = document.getElementById('umRolePendingNote');
  if (note) note.classList.toggle('hidden', !isInvited);

  document.getElementById('userEditModal').classList.remove('hidden');
}

function closeUserEditModal() {
  document.getElementById('userEditModal').classList.add('hidden');
}

async function saveUserEditModal() {
  const roleSel = document.getElementById('umRoleSelect');
  const uid     = roleSel.dataset.uid;
  const newRole = roleSel.value;
  const prevRole = roleSel.dataset.prev;
  if (newRole === prevRole) { closeUserEditModal(); return; }

  const btn = document.getElementById('umSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(uid)}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(`Failed to update role: ${body.error || res.status}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Save';
      return;
    }
    showToast(`Role updated to ${UM_ROLE_LABELS[newRole] || newRole}.`, 'success');
    closeUserEditModal();
    loadUsers();
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

async function resendInvite(userId) {
  try {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/resend-invite`, { method: 'POST' });
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
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/invite`, { method: 'DELETE' });
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

// ── Add Project Modal (#124) ──────────────────────────────────────

async function openAddProjectModal(empName) {
  if (!_vsData || !empName) return;
  _addProjEmp = empName;

  // Fetch active projects from server
  let allProjects = [];
  try {
    const res = await apiFetch('/api/projects');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[addProject] /api/projects returned', res.status, body);
      showToast(`Failed to load projects (${res.status})`, 'error');
      return;
    }
    allProjects = await res.json();
  } catch (e) {
    console.error('[addProject] fetch error', e);
    showToast('Failed to load projects', 'error');
    return;
  }

  // Determine already-assigned projects for this employee across all visible weeks
  const emp = _vsData.employees.find(e => e.name === empName);
  const assignedProjects = new Set();
  if (emp) {
    for (const wkProjs of emp.weeklyProjects)
      for (const p of wkProjs)
        if (p.project && p.project !== 'Unassigned') assignedProjects.add(p.project);
  }

  // Populate project dropdown (exclude already assigned)
  const projSel = document.getElementById('apProject');
  projSel.innerHTML = '<option value="">Select project…</option>';
  const available = allProjects.filter(p => !assignedProjects.has(p.name));
  if (available.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.disabled = true;
    opt.textContent = allProjects.length === 0
      ? 'No active projects found'
      : 'All active projects already assigned';
    projSel.appendChild(opt);
  }
  for (const p of available) {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = `${p.name} (${p.status})`;
    projSel.appendChild(opt);
  }

  // Populate week dropdowns from heatmap weeks
  const weeks = _vsData.weeks;
  const startSel = document.getElementById('apStartWeek');
  const endSel   = document.getElementById('apEndWeek');
  startSel.innerHTML = '';
  endSel.innerHTML   = '';
  for (let i = 0; i < weeks.length; i++) {
    const makeOpt = () => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = `Wk ending ${weeks[i]}`;
      return o;
    };
    startSel.appendChild(makeOpt());
    endSel.appendChild(makeOpt());
  }
  endSel.selectedIndex = weeks.length - 1;

  // Reset other fields
  document.getElementById('apEmpName').textContent = empName;
  document.getElementById('apHours').value = '';
  document.getElementById('apBillable').checked = true;

  document.getElementById('addProjectModal').classList.remove('hidden');
  setTimeout(() => { const s = document.getElementById('apProject'); if (s) s.focus(); }, 50);
}

function closeAddProjectModal() {
  document.getElementById('addProjectModal').classList.add('hidden');
  _addProjEmp = null;
}

async function submitAddProject(event) {
  event.preventDefault();
  if (!_addProjEmp || !_vsData) return;

  const project    = document.getElementById('apProject').value;
  const hoursRaw   = Number(document.getElementById('apHours').value);
  const hours      = Math.max(1, Math.min(45, hoursRaw || 0));
  const startIdx   = parseInt(document.getElementById('apStartWeek').value);
  const endIdx     = parseInt(document.getElementById('apEndWeek').value);
  const isBillable = document.getElementById('apBillable').checked;

  if (!project)          { showToast('Select a project first.', 'error'); return; }
  if (!hoursRaw)         { showToast('Enter hours per week (1–45).', 'error'); return; }
  if (startIdx > endIdx) { showToast('Start week must be before or equal to end week.', 'error'); return; }

  const weeks   = _vsData.weeks;
  const changes = [];
  for (let i = startIdx; i <= endIdx; i++) {
    changes.push({ employeeName: _addProjEmp, weekLabel: weeks[i], project, hours, isBillable });
  }

  const btn = document.getElementById('apSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }

  try {
    const res = await apiFetch('/api/save-staffing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Server error ${res.status}`);
    const empSaved = _addProjEmp;
    closeAddProjectModal();
    showToast(`Added ${project} for ${empSaved} (${changes.length} week${changes.length === 1 ? '' : 's'})`, 'success');
    await loadDashboard();
    // Scroll to and flash the consultant's heatmap row so the user can see where the change landed
    setTimeout(() => {
      if (!_vsAllRows) return;
      const rowIdx = _vsAllRows.findIndex(r => r.type === 'emp' && r.emp.name === empSaved);
      if (rowIdx === -1) return;
      let y = 0;
      for (let i = 0; i < rowIdx; i++) y += _vsAllRows[i].height;
      const scrollWrap = document.querySelector('.hm-scroll-wrap');
      if (scrollWrap) { scrollWrap.scrollLeft = 0; scrollWrap.scrollTop = y; _vsRenderVisible(); }
      requestAnimationFrame(() => {
        const td = Array.from(document.querySelectorAll('td.hm-name-cell')).find(el => el.dataset.emp === empSaved);
        if (td) flashHeatmapRow(td.closest('tr'));
      });
    }, 120);
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Add Assignment'; }
  }
}

// ── Consultant Profile Editor (#119) ─────────────────────────────

async function openConsultantProfileEditor(consultantId, consultantName) {
  if (!consultantId) return;
  _editConsultantId = consultantId;
  _cpIsDirty = false;
  _cpSnapshot = null;
  if (_cpAbortController) { _cpAbortController.abort(); _cpAbortController = null; }
  const strip = document.getElementById('cpDiscardStrip');
  if (strip) strip.classList.add('hidden');

  document.getElementById('cpTitle').textContent = consultantName || 'Consultant Profile';
  document.getElementById('cpSubtitle').textContent = 'Loading…';
  document.getElementById('cpSkillGrid').innerHTML = '';
  document.getElementById('cpSkillEmpty').classList.add('hidden');
  document.getElementById('consultantProfileModal').classList.remove('hidden');

  let profile, industries = [], countries = [];
  try {
    const [res, indRes, cntRes] = await Promise.all([
      apiFetch(`/api/consultants/${encodeURIComponent(consultantId)}`),
      apiFetch('/api/industries'),
      apiFetch('/api/countries'),
    ]);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(`Failed to load profile (${res.status}): ${body.error || ''}`, 'error');
      closeConsultantProfileEditor();
      return;
    }
    profile = await res.json();
    if (indRes.ok) industries = await indRes.json();
    if (cntRes.ok) countries  = await cntRes.json();
  } catch (e) {
    showToast('Failed to load profile', 'error');
    closeConsultantProfileEditor();
    return;
  }

  const { consultant, skillSetIds, levels, allSkillSets } = profile;
  const readOnly = !_hmCanEdit();

  // Title (set from API — avoids special-character issues with onclick-embedded names)
  document.getElementById('cpTitle').textContent = consultant.name || 'Consultant Profile';

  // Subtitle
  document.getElementById('cpSubtitle').textContent = consultant.levelName
    ? `${consultant.levelName}${consultant.location ? ' · ' + consultant.location : ''}`
    : (consultant.location || '');

  // Name
  const nameEl = document.getElementById('cpName');
  nameEl.value = consultant.name || '';
  nameEl.disabled = readOnly;

  // Level dropdown
  const levelSel = document.getElementById('cpLevel');
  levelSel.innerHTML = '<option value="">— no level —</option>';
  for (const l of levels) {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.name;
    if (l.id === consultant.level_id) opt.selected = true;
    levelSel.appendChild(opt);
  }
  levelSel.disabled = readOnly;

  // Location
  const locEl = document.getElementById('cpLocation');
  locEl.value = consultant.location || '';
  locEl.disabled = readOnly;

  // Industry dropdown
  const industryEl = document.getElementById('cpIndustry');
  industryEl.innerHTML = '<option value="">— Select industry —</option>';
  for (const ind of industries) {
    const opt = document.createElement('option');
    opt.value = ind.name;
    opt.textContent = ind.name;
    if (ind.name === consultant.industry) opt.selected = true;
    industryEl.appendChild(opt);
  }
  industryEl.disabled = readOnly;

  // Country dropdown
  const countryEl = document.getElementById('cpCountry');
  countryEl.innerHTML = '<option value="">— Select country —</option>';
  for (const c of countries) {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    if (c.name === consultant.country) opt.selected = true;
    countryEl.appendChild(opt);
  }
  countryEl.disabled = readOnly;

  // Rate overrides (only visible to admin/resource_manager — hidden entirely for others)
  const billEl = document.getElementById('cpBillRate');
  const costEl = document.getElementById('cpCostRate');
  billEl.value = consultant.bill_rate_override != null ? consultant.bill_rate_override : '';
  costEl.value = consultant.cost_rate_override != null ? consultant.cost_rate_override : '';
  billEl.disabled = readOnly;
  costEl.disabled = readOnly;
  // Hide rate fields for roles without rate visibility
  if (!currentUserCanViewRates) {
    billEl.closest('div').style.display = 'none';
    costEl.closest('div').style.display = 'none';
  } else {
    billEl.closest('div').style.display = '';
    costEl.closest('div').style.display = '';
  }

  // Skill set tags
  const selectedIds = new Set(skillSetIds);
  const grid = document.getElementById('cpSkillGrid');
  if (allSkillSets.length === 0) {
    document.getElementById('cpSkillEmpty').classList.remove('hidden');
  } else {
    for (const ss of allSkillSets) {
      const tag = document.createElement('span');
      tag.className = 'cp-skill-tag' +
        (ss.type === 'Practice Area' ? ' type-practice' : '') +
        (selectedIds.has(ss.id) ? ' selected' : '');
      tag.dataset.ssId   = ss.id;
      tag.dataset.skill  = ss.name;
      tag.textContent    = ss.name;
      if (readOnly) {
        tag.style.cursor = 'pointer';
        tag.addEventListener('click', () => openSkillSetModal(tag.dataset.skill, null, 'profile'));
      } else {
        tag.addEventListener('click', () => { tag.classList.toggle('selected'); _cpIsDirty = true; });
      }
      grid.appendChild(tag);
    }
  }

  // Track status for deactivate/reactivate button
  _editConsultantStatus = consultant.status;

  // Linked user account (admin only)
  const linkedUserRow = document.getElementById('cpLinkedUserRow');
  const linkedUserSel = document.getElementById('cpLinkedUser');
  if (currentUserRole === 'admin') {
    linkedUserRow.classList.remove('hidden');
    linkedUserSel.innerHTML = '<option value="">— None —</option>';
    try {
      const usersRes = await apiFetch('/api/admin/users');
      if (usersRes.ok) {
        const users = await usersRes.json();
        for (const u of users) {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = `${u.email} (${u.role || 'no role'})`;
          if (u.id === consultant.user_id) opt.selected = true;
          linkedUserSel.appendChild(opt);
        }
      }
    } catch (_) { /* non-fatal */ }
    linkedUserSel.disabled = readOnly;
  } else {
    linkedUserRow.classList.add('hidden');
  }

  // Snapshot + dirty tracking (editable mode only)
  if (!readOnly) {
    _cpSnapshot = {
      name:     consultant.name || '',
      levelId:  String(consultant.level_id || ''),
      location: consultant.location || '',
      billRate: consultant.bill_rate_override != null ? String(consultant.bill_rate_override) : '',
      costRate: consultant.cost_rate_override != null ? String(consultant.cost_rate_override) : '',
      skillIds: new Set((skillSetIds || []).map(String)),
      userId:   consultant.user_id || '',
    };
    _cpAbortController = new AbortController();
    const { signal } = _cpAbortController;
    const markDirty = () => { _cpIsDirty = true; };
    document.getElementById('cpName').addEventListener('input', markDirty, { signal });
    document.getElementById('cpLevel').addEventListener('change', markDirty, { signal });
    document.getElementById('cpLocation').addEventListener('input', markDirty, { signal });
    document.getElementById('cpBillRate').addEventListener('input', markDirty, { signal });
    document.getElementById('cpCostRate').addEventListener('input', markDirty, { signal });
    if (currentUserRole === 'admin') {
      document.getElementById('cpLinkedUser').addEventListener('change', markDirty, { signal });
    }
  }

  // Wire strip buttons outside the AbortController scope so abort() can't interfere.
  // Discard: close the modal immediately (stopPropagation prevents any backdrop handler firing).
  // Keep editing: hide the strip only.
  document.getElementById('cpDiscardConfirmBtn').onclick = (e) => {
    e.stopPropagation();
    closeConsultantProfileEditor();
  };
  document.getElementById('cpKeepEditingBtn').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('cpDiscardStrip').classList.add('hidden');
  };

  // Show/hide save button; label Discard button appropriately
  if (readOnly) {
    document.getElementById('cpSubmitBtn').style.display = 'none';
    document.getElementById('cpDiscardBtn').textContent = 'Close';
  } else {
    document.getElementById('cpSubmitBtn').style.display = '';
    document.getElementById('cpDiscardBtn').textContent = 'Discard';
  }

  // Deactivate / Reactivate button (editors only)
  const deactBtn = document.getElementById('cpDeactivateBtn');
  if (!readOnly) {
    const isActive = consultant.status !== 'deactivated';
    deactBtn.textContent = isActive ? 'Deactivate' : 'Reactivate';
    deactBtn.style.background    = isActive ? 'rgba(252,165,165,.12)' : 'rgba(168,230,207,.12)';
    deactBtn.style.color         = isActive ? '#FCA5A5'               : '#6EE7B7';
    deactBtn.style.borderColor   = isActive ? 'rgba(252,165,165,.2)'  : 'rgba(110,231,183,.2)';
    deactBtn.onmouseover = () => { deactBtn.style.background = isActive ? 'rgba(252,165,165,.22)' : 'rgba(168,230,207,.22)'; };
    deactBtn.onmouseout  = () => { deactBtn.style.background = isActive ? 'rgba(252,165,165,.12)' : 'rgba(168,230,207,.12)'; };
    deactBtn.classList.remove('hidden');
  } else {
    deactBtn.classList.add('hidden');
  }
}

function closeConsultantProfileEditor() {
  const modal = document.getElementById('consultantProfileModal');
  if (!modal) return;
  // Hide the modal and reset all state BEFORE aborting the controller,
  // so no in-flight handlers can observe a half-reset state.
  modal.classList.add('hidden');
  const strip = document.getElementById('cpDiscardStrip');
  if (strip) strip.classList.add('hidden');
  _editConsultantId = null;
  _editConsultantStatus = null;
  _cpIsDirty = false;
  _cpSnapshot = null;
  // Abort dirty-tracking listeners last — nothing after this point reads them.
  if (_cpAbortController) { _cpAbortController.abort(); _cpAbortController = null; }
}

function handleCpClose() {
  if (!_cpIsDirty) { closeConsultantProfileEditor(); return; }
  document.getElementById('cpDiscardStrip').classList.remove('hidden');
}

function _cpKeepEditing() {
  document.getElementById('cpDiscardStrip').classList.add('hidden');
}

function _cpRevertChanges() {
  closeConsultantProfileEditor();
}

async function toggleConsultantActiveFromModal() {
  if (!_editConsultantId) return;
  const isActive = _editConsultantStatus !== 'deactivated';
  const action   = isActive ? 'deactivate' : 'reactivate';
  const label    = isActive ? 'Deactivate' : 'Reactivate';
  const name     = document.getElementById('cpTitle').textContent;

  if (isActive && !confirm(`Deactivate ${name}? They will be removed from scheduling.`)) return;

  const btn = document.getElementById('cpDeactivateBtn');
  if (btn) { btn.disabled = true; btn.textContent = label + 'ing…'; }

  try {
    const res = await apiFetch(`/api/consultants/${encodeURIComponent(_editConsultantId)}/${action}`, { method: 'PATCH' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(`Failed to ${action} consultant: ${body.error || res.status}`, 'error');
      return;
    }
    const savedId = _editConsultantId;
    showToast(`${name} ${action}d.`, 'success');
    closeConsultantProfileEditor();
    await loadConsultantsPanel();
    const row = document.querySelector(`tr[data-cid="${savedId}"]`);
    if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); flashHeatmapRow(row); }
  } catch (e) {
    showToast(`Failed to ${action} consultant.`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = label; }
  }
}

async function submitConsultantProfile(event) {
  event.preventDefault();
  if (!_editConsultantId) return;

  const name     = document.getElementById('cpName').value.trim();
  const level_id = document.getElementById('cpLevel').value || null;
  const location = document.getElementById('cpLocation').value.trim() || null;
  const industry = document.getElementById('cpIndustry').value.trim() || null;
  const country  = document.getElementById('cpCountry').value.trim() || null;
  const billRaw  = document.getElementById('cpBillRate').value;
  const costRaw  = document.getElementById('cpCostRate').value;
  const bill_rate_override = billRaw !== '' ? parseFloat(billRaw) : null;
  const cost_rate_override = costRaw !== '' ? parseFloat(costRaw) : null;

  const selectedIds = [...document.querySelectorAll('#cpSkillGrid .cp-skill-tag.selected')]
    .map(t => t.dataset.ssId);

  if (!name) { showToast('Name is required.', 'error'); return; }

  const patchBody = { name, level_id, location, industry, country, bill_rate_override, cost_rate_override };
  if (currentUserRole === 'admin') {
    const linkedVal = document.getElementById('cpLinkedUser').value;
    patchBody.user_id = linkedVal || null;
  }

  const btn = document.getElementById('cpSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const [patchRes, skillsRes] = await Promise.all([
      apiFetch(`/api/consultants/${encodeURIComponent(_editConsultantId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      }),
      apiFetch(`/api/consultants/${encodeURIComponent(_editConsultantId)}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillSetIds: selectedIds }),
      }),
    ]);

    const [patchData, skillsData] = await Promise.all([patchRes.json(), skillsRes.json()]);

    if (!patchRes.ok)  throw new Error(patchData.error  || `Profile save failed (${patchRes.status})`);
    if (!skillsRes.ok) throw new Error(skillsData.error || `Skills save failed (${skillsRes.status})`);

    const savedId = _editConsultantId;
    closeConsultantProfileEditor();
    showToast(`Profile updated for ${name}`, 'success');
    await loadDashboard();
    if (document.getElementById('tab-settings')?.classList.contains('active')) {
      await loadConsultantsPanel();
      const row = document.querySelector(`tr[data-cid="${savedId}"]`);
      if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); flashHeatmapRow(row); }
    }
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  }
}

function openInviteModal() {
  document.getElementById('inviteModal').classList.remove('hidden');
}

function closeInviteModal() {
  const modal = document.getElementById('inviteModal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  document.getElementById('inviteForm').reset();
  document.getElementById('inviteError').classList.add('hidden');
  document.getElementById('inviteResult').classList.add('hidden');
  document.getElementById('inviteUrlText').value = '';
  document.getElementById('copyInviteBtn').textContent = 'Copy';
}

function handleInviteOverlayClick(e) {
  if (e.target === document.getElementById('inviteModal')) closeInviteModal();
}

async function submitInvite(e) {
  e.preventDefault();
  const form  = document.getElementById('inviteForm');
  const errEl = document.getElementById('inviteError');
  errEl.classList.add('hidden');

  const display_name = form.elements.name.value.trim();
  const email        = form.elements.email.value.trim();
  const role         = form.elements.role.value;

  if (!display_name || !email || !role) {
    errEl.textContent = 'Name, email, and role are required.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('inviteSubmitBtn');
  btn.disabled    = true;
  btn.textContent = 'Generating…';

  try {
    const res = await apiFetch('/api/admin/users/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, role, display_name }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      errEl.textContent = data.error || 'Failed to generate invite link.';
      errEl.classList.remove('hidden');
      btn.disabled    = false;
      btn.textContent = 'Generate Invite Link';
      return;
    }

    document.getElementById('inviteUrlText').value = data.invite_url;
    document.getElementById('inviteResult').classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = 'Generate Invite Link';
    loadUsers();
  } catch (err) {
    errEl.textContent = err.message || 'Network error.';
    errEl.classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = 'Generate Invite Link';
  }
}

async function copyInviteLink() {
  const url = document.getElementById('inviteUrlText').value;
  const btn = document.getElementById('copyInviteBtn');
  try {
    await navigator.clipboard.writeText(url);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  } catch (_) {
    document.getElementById('inviteUrlText').select();
  }
}

// ── Auth ──────────────────────────────────────────────────────────
async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
  window.location.replace('login.html');
}

// ── Location typeahead ────────────────────────────────────────────
const CP_CITIES = [
  'New York, NY','Los Angeles, CA','Chicago, IL','Houston, TX','Phoenix, AZ',
  'Philadelphia, PA','San Antonio, TX','San Diego, CA','Dallas, TX','San Jose, CA',
  'Austin, TX','Jacksonville, FL','Fort Worth, TX','Columbus, OH','Charlotte, NC',
  'Indianapolis, IN','San Francisco, CA','Seattle, WA','Denver, CO','Nashville, TN',
  'Oklahoma City, OK','El Paso, TX','Washington, DC','Boston, MA','Memphis, TN',
  'Louisville, KY','Portland, OR','Las Vegas, NV','Milwaukee, WI','Albuquerque, NM',
  'Tucson, AZ','Fresno, CA','Sacramento, CA','Mesa, AZ','Kansas City, MO',
  'Atlanta, GA','Omaha, NE','Colorado Springs, CO','Raleigh, NC','Long Beach, CA',
  'Virginia Beach, VA','Minneapolis, MN','Tampa, FL','New Orleans, LA','Arlington, TX',
  'Bakersfield, CA','Honolulu, HI','Anaheim, CA','Aurora, CO','Santa Ana, CA',
];

function initLocationTypeahead() {
  const input = document.getElementById('cpLocation');
  const list  = document.getElementById('cpLocationDropdown');
  if (!input || !list) return;

  let activeIdx = -1;

  function closeDrop() {
    list.style.display = 'none';
    list.innerHTML = '';
    activeIdx = -1;
  }

  function openDrop(matches) {
    list.innerHTML = '';
    activeIdx = -1;
    if (!matches.length) { closeDrop(); return; }
    matches.forEach((city, i) => {
      const li = document.createElement('li');
      li.textContent = city;
      li.dataset.idx = i;
      li.style.cssText = 'padding:8px 12px;cursor:pointer;color:#E2E8F0;font-size:13px;font-family:inherit;white-space:nowrap';
      li.addEventListener('mouseenter', () => setActive(i));
      li.addEventListener('mousedown', e => {
        e.preventDefault(); // keep input focused
        input.value = city;
        closeDrop();
      });
      list.appendChild(li);
    });
    list.style.display = 'block';
  }

  function setActive(idx) {
    const items = list.querySelectorAll('li');
    items.forEach(el => el.style.background = '');
    activeIdx = idx;
    if (idx >= 0 && idx < items.length) {
      items[idx].style.background = 'rgba(168,199,250,.12)';
      items[idx].scrollIntoView({ block: 'nearest' });
    }
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { closeDrop(); return; }
    const matches = CP_CITIES.filter(c => c.toLowerCase().includes(q));
    openDrop(matches);
  });

  input.addEventListener('keydown', e => {
    const items = list.querySelectorAll('li');
    if (list.style.display === 'none' || !items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(Math.min(activeIdx + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIdx >= 0 && activeIdx < items.length) {
        e.preventDefault();
        input.value = items[activeIdx].textContent;
        closeDrop();
      } else {
        closeDrop(); // free-text: keep whatever was typed
      }
    } else if (e.key === 'Escape') {
      closeDrop();
    }
  });

  input.addEventListener('blur', () => {
    // Small delay so mousedown on an item fires before blur hides the list
    setTimeout(closeDrop, 150);
  });
}

// ── Create New Need Modal (#164) ──────────────────────────────────

let _cnStep            = 1;
let _cnNewProjExpanded = false;
let _cnProjects        = [];   // [{id, name, status, clientName, startDate, endDate}]

function openCreateNeedModal() {
  _cnStep            = 1;
  _cnNewProjExpanded = false;

  document.getElementById('cn-step-1').classList.remove('hidden');
  document.getElementById('cn-step-2').classList.add('hidden');
  document.getElementById('cn-new-proj-form').classList.add('hidden');
  document.getElementById('cn-new-proj-toggle-icon').textContent = '＋';
  _cnResetNewProjForm();
  _cnUpdateStepIndicator();
  _cnUpdateFooter();

  document.getElementById('create-need-modal').classList.remove('hidden');
  _cnLoadProjects();
}

function closeCreateNeedModal() {
  document.getElementById('create-need-modal').classList.add('hidden');
  _cnStep              = 1;
  _cnNewProjExpanded   = false;
  _cnProjects          = [];
  _cnRowCounter        = 0;
  _cnSkillSetsCache    = [];
  _cnOpenDropdownRowId = null;
}

async function _cnLoadProjects() {
  const sel = document.getElementById('cn-project-select');
  sel.innerHTML = '<option value="">Loading…</option>';
  try {
    const res = await apiFetch('/api/projects?status=Verbal+Commit,Sold');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _cnProjects = await res.json();
    sel.innerHTML = '<option value="">— select a project —</option>';
    for (const p of _cnProjects) {
      const opt = document.createElement('option');
      opt.value       = p.id;
      opt.textContent = p.name + (p.clientName ? ` (${p.clientName})` : '');
      sel.appendChild(opt);
    }
  } catch (e) {
    _cnProjects = [];
    sel.innerHTML = '<option value="">Failed to load projects</option>';
    showToast('Failed to load projects', 'error');
  }
}

function _cnToggleNewProjectForm() {
  _cnNewProjExpanded = !_cnNewProjExpanded;
  const form = document.getElementById('cn-new-proj-form');
  const icon = document.getElementById('cn-new-proj-toggle-icon');
  if (_cnNewProjExpanded) {
    form.classList.remove('hidden');
    icon.textContent = '−';
    document.getElementById('cn-proj-name').focus();
  } else {
    form.classList.add('hidden');
    icon.textContent = '＋';
    _cnResetNewProjForm();
  }
}

function _cnResetNewProjForm() {
  ['cn-proj-name', 'cn-proj-client', 'cn-proj-probability', 'cn-proj-start', 'cn-proj-end'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const statusEl = document.getElementById('cn-proj-status');
  if (statusEl) statusEl.value = '';
  const errEl = document.getElementById('cn-proj-error');
  if (errEl) errEl.classList.add('hidden');
}

function _cnAutoSetProbability() {
  const probMap = { 'Proposed': 25, 'Verbal Commit': 75, 'Sold': 100 };
  const status  = document.getElementById('cn-proj-status').value;
  if (probMap[status] != null) {
    document.getElementById('cn-proj-probability').value = probMap[status];
  }
}

async function _cnSaveNewProject() {
  const name   = document.getElementById('cn-proj-name').value.trim();
  const client = document.getElementById('cn-proj-client').value.trim();
  const status = document.getElementById('cn-proj-status').value;
  const prob   = document.getElementById('cn-proj-probability').value;
  const start  = document.getElementById('cn-proj-start').value;
  const end    = document.getElementById('cn-proj-end').value;
  const errEl  = document.getElementById('cn-proj-error');

  if (!name)   { errEl.textContent = 'Project name is required.'; errEl.classList.remove('hidden'); return; }
  if (!status) { errEl.textContent = 'Status is required.';       errEl.classList.remove('hidden'); return; }
  errEl.classList.add('hidden');

  const btn = document.getElementById('cn-save-proj-btn');
  btn.disabled    = true;
  btn.textContent = 'Saving…';

  try {
    const res = await apiFetch('/api/projects', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name,
        clientName:  client || null,
        status,
        probability: prob ? Number(prob) : null,
        startDate:   start || null,
        endDate:     end   || null,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    const project = await res.json();

    // Add new project to dropdown and auto-select it
    const sel = document.getElementById('cn-project-select');
    const opt = document.createElement('option');
    opt.value       = project.id;
    opt.textContent = name + (client ? ` (${client})` : '');
    sel.appendChild(opt);
    sel.value = project.id;

    // Mirror into _cnProjects so Step 2 can read the date range.
    // POST /api/projects returns the raw DB row (snake_case), so map to camelCase
    // to match the shape loaded by _cnLoadProjects().
    _cnProjects.push({
      id:         project.id,
      name:       project.name,
      status:     project.status,
      clientName: client || null,
      startDate:  project.start_date || null,
      endDate:    project.end_date   || null,
    });

    // Collapse sub-form
    _cnNewProjExpanded = false;
    document.getElementById('cn-new-proj-form').classList.add('hidden');
    document.getElementById('cn-new-proj-toggle-icon').textContent = '＋';
    _cnResetNewProjForm();

    showToast('Project created', 'success');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Save Project';
  }
}

function _cnNextStep() {
  const projectId = document.getElementById('cn-project-select').value;
  if (!projectId) {
    showToast('Please select a project before continuing.', 'default');
    return;
  }
  _cnStep = 2;
  document.getElementById('cn-step-1').classList.add('hidden');
  document.getElementById('cn-step-2').classList.remove('hidden');
  _cnUpdateStepIndicator();
  _cnUpdateFooter();
  _cnPopulateStep2();
}

function _cnPrevStep() {
  _cnStep = 1;
  document.getElementById('cn-step-2').classList.add('hidden');
  document.getElementById('cn-step-1').classList.remove('hidden');
  _cnUpdateStepIndicator();
  _cnUpdateFooter();
}

function _cnUpdateStepIndicator() {
  const labels = ['Step 1 of 2 — Select Project', 'Step 2 of 2 — Define Needs'];
  document.getElementById('cn-step-indicator').textContent = labels[_cnStep - 1];
}

function _cnUpdateFooter() {
  const backBtn   = document.getElementById('cn-back-btn');
  const cancelBtn = document.getElementById('cn-cancel-btn');
  const nextBtn   = document.getElementById('cn-next-btn');
  const createBtn = document.getElementById('cn-create-btn');
  if (_cnStep === 1) {
    backBtn.classList.add('hidden');
    cancelBtn.classList.remove('hidden');
    nextBtn.classList.remove('hidden');
    createBtn.classList.add('hidden');
  } else {
    backBtn.classList.remove('hidden');
    cancelBtn.classList.add('hidden');
    nextBtn.classList.add('hidden');
    createBtn.classList.remove('hidden');
    _cnUpdateCreateBtnLabel();
  }
}

let _cnRowCounter = 0;
let _cnSkillSetsCache = []; // populated in _cnPopulateStep2
let _cnOpenDropdownRowId = null; // tracks which row's skill dropdown is open

function _cnAddRow() {
  _cnRowCounter++;
  const id = _cnRowCounter;
  const container = document.getElementById('cn-rows');
  const row = document.createElement('div');
  row.id = `cn-row-${id}`;
  row.dataset.rowId = id;
  row.style.cssText = 'display:grid;grid-template-columns:140px 1fr 72px 52px 24px;gap:8px;align-items:center';

  const inputStyle = 'width:100%;padding:7px 10px;background:#0F1117;border:1px solid rgba(255,255,255,.1);border-radius:7px;color:#E2E8F0;font-size:12px;font-family:inherit;outline:none;box-sizing:border-box';
  const selectStyle = inputStyle + ';appearance:none;cursor:pointer';

  // Build skill pills HTML for the dropdown panel
  const skillPillsHtml = _cnSkillSetsCache.map(ss =>
    `<span class="cp-skill-tag${ss.type === 'Practice Area' ? ' type-practice' : ''}" data-ss-id="${ss.id}" data-ss-name="${ss.name}" style="cursor:pointer;font-size:11px">${ss.name}</span>`
  ).join('');

  row.innerHTML = `
    <select data-field="level" style="${selectStyle};font-size:12px"
      onfocus="this.style.borderColor='#A8C7FA'" onblur="this.style.borderColor='rgba(255,255,255,.1)'">
      <option value="">— level —</option>
      <option value="Partner/Principal/Managing Director">Partner / MD</option>
      <option value="Senior Manager">Sr Manager</option>
      <option value="Manager">Manager</option>
      <option value="Senior Consultant">Sr Consultant</option>
      <option value="Consultant">Consultant</option>
      <option value="Analyst">Analyst</option>
    </select>
    <div class="cn-ms-wrapper" style="min-width:0;position:relative">
      <div class="cn-ms-trigger" onclick="_cnToggleSkillDropdown(${id})" style="width:100%;padding:7px 10px;background:#0F1117;border:1px solid rgba(255,255,255,.1);border-radius:7px;color:#E2E8F0;font-size:12px;font-family:inherit;cursor:pointer;text-align:left;box-sizing:border-box;height:34px;display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;overflow:hidden">
        <span class="cn-ms-placeholder">Select skills…</span>
      </div>
      <div class="cn-ms-panel" style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;background:#0F1117;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:8px;z-index:50;flex-wrap:wrap;gap:5px;max-height:140px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.4)" data-field="skill-panel">
        ${skillPillsHtml}
      </div>
    </div>
    <input data-field="hours" type="number" min="1" max="45" placeholder="40" style="${inputStyle};font-size:12px"
      onfocus="this.style.borderColor='#A8C7FA'" onblur="this.style.borderColor='rgba(255,255,255,.1)'"
      oninput="_cnUpdateCreateBtnLabel()">
    <input data-field="qty" type="number" min="1" max="10" value="1" style="${inputStyle};text-align:center;font-size:12px"
      onfocus="this.style.borderColor='#A8C7FA'" onblur="this.style.borderColor='rgba(255,255,255,.1)'"
      oninput="_cnUpdateCreateBtnLabel()">
    <button type="button" onclick="_cnRemoveRow(${id})"
      style="background:none;border:none;color:#4A5168;font-size:14px;cursor:pointer;padding:0;line-height:1;border-radius:4px"
      onmouseover="this.style.color='#F87171'" onmouseout="this.style.color='#4A5168'"
      title="Remove row">✕</button>
  `;

  container.appendChild(row);

  // Attach click handlers to skill pills
  const panel = row.querySelector('[data-field="skill-panel"]');
  panel.querySelectorAll('.cp-skill-tag').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      pill.classList.toggle('selected');
      _cnUpdateTriggerLabel(id);
    });
  });

  _cnUpdateRemoveButtons();
  _cnUpdateCreateBtnLabel();
}

function _cnToggleSkillDropdown(rowId) {
  const row = document.getElementById(`cn-row-${rowId}`);
  if (!row) return;
  const panel = row.querySelector('[data-field="skill-panel"]');
  const isOpen = panel.style.display !== 'none';

  // Close any other open dropdown first
  if (_cnOpenDropdownRowId && _cnOpenDropdownRowId !== rowId) {
    const prevRow = document.getElementById(`cn-row-${_cnOpenDropdownRowId}`);
    if (prevRow) {
      const prevPanel = prevRow.querySelector('[data-field="skill-panel"]');
      if (prevPanel) prevPanel.style.display = 'none';
    }
  }

  if (isOpen) {
    panel.style.display = 'none';
    _cnOpenDropdownRowId = null;
  } else {
    panel.style.display = 'flex';
    _cnOpenDropdownRowId = rowId;
  }
}

function _cnUpdateTriggerLabel(rowId) {
  const row = document.getElementById(`cn-row-${rowId}`);
  if (!row) return;
  const trigger = row.querySelector('.cn-ms-trigger');
  const selected = [...row.querySelectorAll('[data-field="skill-panel"] .cp-skill-tag.selected')];

  if (selected.length === 0) {
    trigger.innerHTML = '<span class="cn-ms-placeholder">Select skills…</span>';
    return;
  }

  // Show up to 1 tag inline, then "+N more"
  const maxShow = 1;
  let html = '';
  for (let i = 0; i < Math.min(selected.length, maxShow); i++) {
    html += `<span class="cn-ms-tag">${selected[i].dataset.ssName}</span>`;
  }
  if (selected.length > maxShow) {
    html += `<span class="cn-ms-more">+${selected.length - maxShow}</span>`;
  }
  trigger.innerHTML = html;
}

function _cnRemoveRow(id) {
  const row = document.getElementById(`cn-row-${id}`);
  if (row) row.remove();
  _cnUpdateRemoveButtons();
  _cnUpdateCreateBtnLabel();
}

function _cnUpdateRemoveButtons() {
  const rows = document.querySelectorAll('#cn-rows > div');
  rows.forEach(row => {
    const btn = row.querySelector('button');
    if (btn) {
      btn.style.visibility = rows.length <= 1 ? 'hidden' : 'visible';
    }
  });
}

function _cnGetTotalNeedCount() {
  let total = 0;
  document.querySelectorAll('#cn-rows > div').forEach(row => {
    const qtyInput = row.querySelector('[data-field="qty"]');
    const qty = Math.max(1, Math.min(10, parseInt(qtyInput?.value) || 1));
    total += qty;
  });
  return total;
}

function _cnUpdateCreateBtnLabel() {
  const btn = document.getElementById('cn-create-btn');
  if (!btn) return;
  const n = _cnGetTotalNeedCount();
  btn.textContent = `Create ${n} need${n !== 1 ? 's' : ''}`;
}

function _cnStep2ClickOutside(e) {
  if (_cnOpenDropdownRowId && !e.target.closest('.cn-ms-wrapper')) {
    const row = document.getElementById(`cn-row-${_cnOpenDropdownRowId}`);
    if (row) {
      const panel = row.querySelector('[data-field="skill-panel"]');
      if (panel) panel.style.display = 'none';
    }
    _cnOpenDropdownRowId = null;
  }
}

function _cnPopulateStep2() {
  const cnSP = _sdpMap['cn-start-date'];
  const cnEP = _sdpMap['cn-end-date'];
  if (cnSP) cnSP.setDate('');
  if (cnEP) cnEP.setDate('');
  document.getElementById('cn-step2-error').classList.add('hidden');

  const projectId = document.getElementById('cn-project-select').value;
  const proj = _cnProjects.find(p => String(p.id) === String(projectId));
  const todayIso = StaffingDatePicker.smartDefault();
  if (proj) {
    // Start date: later of project start or today, snapped to Saturday
    const projStart = proj.startDate || null;
    const effectiveStart = (projStart && projStart > todayIso) ? projStart : todayIso;
    const startSnapped = StaffingDatePicker.toIso(StaffingDatePicker.snapSat(StaffingDatePicker.fromIso(effectiveStart)));
    if (cnSP) cnSP.setDate(startSnapped);

    // End date: use project end if it's in the future; otherwise start + 4 weeks
    if (proj.endDate && proj.endDate >= todayIso) {
      if (cnEP) cnEP.setDate(proj.endDate);
    } else {
      const fallback = StaffingDatePicker.fromIso(startSnapped);
      fallback.setDate(fallback.getDate() + 28);
      if (cnEP) cnEP.setDate(StaffingDatePicker.toIso(fallback));
    }
  } else if (cnSP) {
    cnSP.setDate(todayIso);
  }

  // Show selected project name on Step 2
  const projLabel = document.getElementById('cn-step2-project-label');
  if (projLabel && proj) {
    const clientPrefix = proj.clientName ? proj.clientName + ' — ' : '';
    projLabel.textContent = clientPrefix + (proj.name || '');
    projLabel.style.display = 'block';
  } else if (projLabel) {
    projLabel.style.display = 'none';
  }

  const skillSets = rawData._meta?.skillSets || [];
  _cnSkillSetsCache = [...skillSets].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'Practice Area' ? -1 : 1;
  });

  const rowsContainer = document.getElementById('cn-rows');
  rowsContainer.innerHTML = '';
  _cnRowCounter = 0;
  _cnOpenDropdownRowId = null;
  _cnAddRow();

  // Close skill dropdowns when clicking inside step 2 but outside a wrapper
  const step2El = document.getElementById('cn-step-2');
  step2El.removeEventListener('click', _cnStep2ClickOutside);
  step2El.addEventListener('click', _cnStep2ClickOutside);

  // Also close when clicking on the modal overlay areas (dates, footer, etc.)
  const modalInner = document.getElementById('create-need-modal')?.querySelector(':scope > div');
  if (modalInner) {
    modalInner.removeEventListener('click', _cnStep2ClickOutside);
    modalInner.addEventListener('click', _cnStep2ClickOutside);
  }
}

async function _cnSubmit() {
  const projectId = document.getElementById('cn-project-select').value;
  const startDate = document.getElementById('cn-start-date').dataset.iso || '';
  const endDate   = document.getElementById('cn-end-date').dataset.iso   || '';
  const errEl     = document.getElementById('cn-step2-error');

  const showErr = msg => { errEl.textContent = msg; errEl.classList.remove('hidden'); };
  errEl.classList.add('hidden');

  // Validate shared date fields
  if (!startDate || !endDate) { showErr('Start date and end date are required.'); return; }
  if (startDate > endDate)    { showErr('Start date must be before end date.'); return; }

  const proj = _cnProjects.find(p => String(p.id) === String(projectId));
  if (proj) {
    if (proj.startDate && startDate < proj.startDate) {
      showErr(`Start date cannot be before the project start (${proj.startDate}).`); return;
    }
    if (proj.endDate && endDate > proj.endDate) {
      showErr(`End date cannot be after the project end (${proj.endDate}).`); return;
    }
  }

  // Collect and validate rows
  const rows = [];
  const rowEls = document.querySelectorAll('#cn-rows > div');
  for (let i = 0; i < rowEls.length; i++) {
    const level = rowEls[i].querySelector('[data-field="level"]').value;
    const hours = rowEls[i].querySelector('[data-field="hours"]').value;
    const qty   = parseInt(rowEls[i].querySelector('[data-field="qty"]').value) || 1;
    const skillSetIds = [...rowEls[i].querySelectorAll('[data-field="skill-panel"] .cp-skill-tag.selected')]
      .map(t => t.dataset.ssId);

    if (!level) { showErr(`Row ${i + 1}: Please select a level.`); return; }
    if (skillSetIds.length === 0) { showErr(`Row ${i + 1}: Please select at least one skill.`); return; }
    if (!hours || Number(hours) < 1 || Number(hours) > 45) {
      showErr(`Row ${i + 1}: Hours per week must be between 1 and 45.`); return;
    }
    if (qty < 1 || qty > 10) { showErr(`Row ${i + 1}: Quantity must be between 1 and 10.`); return; }
    rows.push({ level, hoursPerWeek: Number(hours), qty: Math.min(10, Math.max(1, qty)), skillSetIds });
  }

  if (rows.length === 0) { showErr('Add at least one need row.'); return; }

  const totalNeeds = rows.reduce((s, r) => s + r.qty, 0);
  const createBtn = document.getElementById('cn-create-btn');
  createBtn.disabled    = true;
  createBtn.textContent = `Creating ${totalNeeds} need${totalNeeds !== 1 ? 's' : ''}…`;

  try {
    let created = 0;
    for (const row of rows) {
      for (let q = 0; q < row.qty; q++) {
        const res = await apiFetch('/api/needs', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            projectId,
            level: row.level,
            skillSetIds: row.skillSetIds,
            hoursPerWeek: row.hoursPerWeek,
            startDate,
            endDate,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        created++;
        createBtn.textContent = `Creating… (${created}/${totalNeeds})`;
      }
    }

    showToast(`${created} need${created !== 1 ? 's' : ''} created`, 'success');
    closeCreateNeedModal();
    loadDashboard();
  } catch (e) {
    showErr(e.message);
  } finally {
    createBtn.disabled = false;
    _cnUpdateCreateBtnLabel();
  }
}

// ── Edit Need Modal (#173) ────────────────────────────────────────

let _enNeedId = null;  // ID of the need currently being edited

// Convert "MM/DD/YYYY" display date → "YYYY-MM-DD" for <input type="date">
function _displayDateToIso(s) {
  if (!s) return '';
  const parts = String(s).split('/');
  if (parts.length < 3) return '';
  const [m, d, y] = parts;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function openEditNeedModal(needId, event) {
  if (event) event.stopPropagation();
  const need = ((rawData.openNeeds || {}).roles || []).find(r => r._needId === needId);
  if (!need) { showToast('Need not found', 'error'); return; }

  _enNeedId = needId;

  document.getElementById('en-project-header').textContent = need.project || '—';
  document.getElementById('en-client-header').textContent  = need.client  ? need.client + ' —' : '';

  document.getElementById('en-level-select').value = need.level || '';
  document.getElementById('en-hours').value        = need.hoursPerWeek || '';
  if (_sdpMap['en-start-date']) _sdpMap['en-start-date'].setDate(_displayDateToIso(need.startDate));
  else document.getElementById('en-start-date').value = _displayDateToIso(need.startDate);
  if (_sdpMap['en-end-date'])   _sdpMap['en-end-date'].setDate(_displayDateToIso(need.endDate));
  else document.getElementById('en-end-date').value   = _displayDateToIso(need.endDate);

  _enPopulateSkills(need.allSkillSets || []);

  document.getElementById('en-error').classList.add('hidden');
  document.getElementById('edit-need-modal').classList.remove('hidden');
}

function closeEditNeedModal() {
  document.getElementById('edit-need-modal').classList.add('hidden');
  _enNeedId = null;
}

// ── Bulk Assign Modal (#189) ──────────────────────────────────────

async function openBulkAssignModal(needId, event) {
  if (event) event.stopPropagation();
  _bulkAssignNeedId = needId;

  const modal = document.getElementById('bulk-assign-modal');
  const body  = document.getElementById('ba-body');
  modal.classList.remove('hidden');
  const _baBtn = document.getElementById('ba-assign-btn');
  if (_baBtn) { _baBtn.textContent = 'Assign Selected'; _baBtn.disabled = true; }
  body.innerHTML = '<div style="text-align:center;padding:40px 0;color:#8892B0;font-size:13px">Loading candidates…</div>';

  let data;
  try {
    const res = await apiFetch(`/api/needs/${encodeURIComponent(needId)}/candidates`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    data = await res.json();
  } catch (err) {
    body.innerHTML = `<div style="text-align:center;padding:40px 0;color:#F87171;font-size:13px">Failed to load candidates: ${_esc(err.message)}</div>`;
    return;
  }

  const { need, candidates } = data;

  // Populate context header
  const skillsText = (need.skills || []).join(', ') || '—';
  const _fmt = s => { if (!s) return '—'; const p = String(s).split('/'); if (p.length < 2) return s; const yr = p[2] ? '/' + p[2].slice(-2) : ''; return `${parseInt(p[0])}/${parseInt(p[1])}${yr}`; };
  const dateText   = `${_fmt(need.startDate)} – ${_fmt(need.endDate)}`;
  document.getElementById('ba-context').innerHTML =
    `<span style="color:#A8C7FA">${_esc(need.projectName || '—')}</span>` +
    `<span style="color:#4A5168"> · </span>${_esc(need.clientName || '—')}` +
    `<span style="color:#4A5168"> · </span>${_esc(need.level || '—')}` +
    `<span style="color:#4A5168"> · </span>${_esc(skillsText)}` +
    `<span style="color:#4A5168"> · </span>${_esc(need.hoursPerWeek || '—')}h/wk` +
    `<span style="color:#4A5168"> · </span>${dateText}`;

  if (!candidates.length) {
    body.innerHTML = '<div class="ba-empty">No matching candidates available for this role.</div>';
    _baUpdateCount();
    return;
  }

  let rows = '';
  for (const c of candidates) {
    const skillTags = (c.matchingSkills || []).map(s => `<span class="ba-skill-tag">${_esc(s)}</span>`).join('');
    const badgeCls  = `ba-badge-${c.badge}`;
    const pct       = c.matchPct > 100 ? 100 : c.matchPct;
    rows += `
    <tr class="ba-candidate-row">
      <td class="ba-col-check">
        <input type="checkbox" class="ba-checkbox" value="${_esc(c.consultantId)}" onchange="_baUpdateCount()">
      </td>
      <td class="ba-col-name" data-cid="${_esc(c.consultantId)}">${_esc(c.name)}</td>
      <td class="ba-col-level">${_esc(c.level)}</td>
      <td class="ba-col-skills">${skillTags || '<span style="color:#4A5168">—</span>'}</td>
      <td class="ba-col-avail">${c.avgAvailableHours}h</td>
      <td class="ba-col-badge"><span class="${badgeCls}">${pct}%</span></td>
    </tr>`;
  }

  body.innerHTML = `
    <table class="ba-table">
      <thead>
        <tr>
          <th class="ba-col-check"><input type="checkbox" id="ba-select-all" onchange="_baToggleSelectAll(this)" title="Select all"></th>
          <th>Consultant</th>
          <th>Level</th>
          <th>Matching Skills</th>
          <th class="ba-col-avail">Avg Avail</th>
          <th class="ba-col-badge">Match</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  _baUpdateCount();
}

function closeBulkAssignModal() {
  const modal = document.getElementById('bulk-assign-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  _bulkAssignNeedId = null;
  const selectAll = document.getElementById('ba-select-all');
  if (selectAll) selectAll.checked = false;
  document.getElementById('ba-body').innerHTML = '';
  _baUpdateCount();
}

function _baToggleSelectAll(cb) {
  document.querySelectorAll('#ba-body .ba-checkbox').forEach(el => { el.checked = cb.checked; });
  _baUpdateCount();
}

function _baUpdateCount() {
  const checked = document.querySelectorAll('#ba-body .ba-checkbox:checked');
  const total   = document.querySelectorAll('#ba-body .ba-checkbox');
  const label   = document.getElementById('ba-count-label');
  const btn     = document.getElementById('ba-assign-btn');
  if (label) label.textContent = `${checked.length} of ${total.length} selected`;
  if (btn) {
    btn.disabled = checked.length === 0;
    btn.style.opacity = '';  // let CSS :disabled / :not(:disabled) rule take over
  }
}

async function submitBulkAssign() {
  const needId = _bulkAssignNeedId;
  if (!needId) return;

  const checked = Array.from(document.querySelectorAll('#ba-body .ba-checkbox:checked'));
  if (checked.length === 0) return;

  const consultantIds = checked.map(cb => cb.value);

  const btn = document.getElementById('ba-assign-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Assigning…'; }

  // Identify the need for toast context
  const need = ((rawData.openNeeds || {}).roles || []).find(r => r._needId === needId);
  const label = need ? `${need.project || 'project'} — ${need.level || ''}` : 'need';

  try {
    const res = await apiFetch(`/api/needs/${encodeURIComponent(needId)}/bulk-assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consultantIds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (btn) { btn.textContent = 'Assign Selected'; btn.disabled = true; }
    closeBulkAssignModal();
    showToast(`Assigned ${consultantIds.length} consultant${consultantIds.length !== 1 ? 's' : ''} to ${label}`, 'success');
    loadDashboard();
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Assign Selected'; }
    showToast(`Assignment failed: ${err.message}`, 'error');
  }
}

function _enPopulateSkills(selectedNames) {
  const skillGrid = document.getElementById('en-skill-grid');
  skillGrid.innerHTML = '';

  const skillSets = rawData._meta?.skillSets || [];
  const sorted = [...skillSets].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'Practice Area' ? -1 : 1;
  });

  for (const ss of sorted) {
    const tag = document.createElement('span');
    tag.className    = 'cp-skill-tag' + (ss.type === 'Practice Area' ? ' type-practice' : '');
    tag.dataset.ssId = ss.id;
    tag.textContent  = ss.name;
    if (selectedNames.includes(ss.name)) tag.classList.add('selected');
    tag.addEventListener('click', () => tag.classList.toggle('selected'));
    skillGrid.appendChild(tag);
  }
}

async function _enSubmit() {
  const level       = document.getElementById('en-level-select').value;
  const hours       = document.getElementById('en-hours').value;
  const startDate   = document.getElementById('en-start-date').dataset.iso || '';
  const endDate     = document.getElementById('en-end-date').dataset.iso   || '';
  const skillSetIds = [...document.querySelectorAll('#en-skill-grid .cp-skill-tag.selected')]
    .map(t => t.dataset.ssId);
  const errEl = document.getElementById('en-error');

  const showErr = msg => { errEl.textContent = msg; errEl.classList.remove('hidden'); };
  errEl.classList.add('hidden');

  if (!level) { showErr('Please select a level.'); return; }
  if (skillSetIds.length === 0) {
    document.getElementById('en-skill-grid').classList.add('pills-error');
    setTimeout(() => document.getElementById('en-skill-grid').classList.remove('pills-error'), 1500);
    showErr('Please select at least one skill set.'); return;
  }
  if (!hours || Number(hours) < 1 || Number(hours) > 45) {
    showErr('Hours per week must be between 1 and 45.'); return;
  }
  if (!startDate || !endDate) { showErr('Start date and end date are required.'); return; }
  if (startDate > endDate)    { showErr('Start date must be before end date.'); return; }

  const saveBtn = document.getElementById('en-save-btn');
  saveBtn.disabled    = true;
  saveBtn.textContent = 'Saving…';

  try {
    const res = await apiFetch(`/api/needs/${_enNeedId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ level, skillSetIds, hoursPerWeek: Number(hours), startDate, endDate }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    showToast('Need updated', 'success');
    closeEditNeedModal();
    loadDashboard();
  } catch (e) {
    showErr(e.message);
  } finally {
    saveBtn.disabled    = false;
    saveBtn.textContent = 'Save Changes';
  }
}

// ── Welcome modal ─────────────────────────────────────────────────
const WELCOME_BULLETS = {
  admin: [
    'Full access to all tabs, consultants, and settings',
    'Manage users and permissions under Settings → Users',
    'Reset sandbox test data any time under Settings → Sandbox',
    'Use Ask Claude for natural language staffing questions',
  ],
  resource_manager: [
    'Edit the resource heatmap and manage consultant assignments',
    'Create, edit, and close staffing needs',
    'View consultant profiles and skill coverage',
    'Use Ask Claude for natural language staffing questions',
  ],
  project_manager: [
    'Create and manage open staffing needs for your projects',
    'View the resource heatmap (read-only)',
    'Track demand coverage and urgency',
  ],
  executive: [
    'View utilization overview, heatmap, and bench data',
    'Use Ask Claude to ask staffing questions in plain English',
  ],
  consultant: [
    'View your own assignment schedule on the Staffing tab',
    'Update your profile and skills in Settings',
  ],
};

function closeWelcomeModal() {
  const modal = document.getElementById('welcomeModal');
  if (modal) modal.classList.add('hidden');
}

function _maybeShowWelcomeModal(userId, role, displayName, tenantName) {
  const key = `si_welcomed_${userId}`;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, '1');

  const modal      = document.getElementById('welcomeModal');
  const titleEl    = document.getElementById('welcomeTitle');
  const companyEl  = document.getElementById('welcomeCompany');
  const subtitle   = document.getElementById('welcomeSubtitle');
  const bullets    = document.getElementById('welcomeBullets');
  if (!modal) return;

  const firstName = displayName ? displayName.split(' ')[0] : displayName;
  const roleLbl = { admin: 'Admin', resource_manager: 'Resource Manager',
    project_manager: 'Project Manager', executive: 'Executive', consultant: 'Consultant' }[role] || role;
  if (titleEl)   titleEl.textContent   = firstName ? `Welcome, ${firstName}!` : 'Welcome!';
  if (companyEl) companyEl.textContent = tenantName ? `You're managing resources for ${tenantName}.` : '';
  if (subtitle)  subtitle.textContent  = `You're signed in as ${roleLbl}.`;
  if (bullets) {
    const items = WELCOME_BULLETS[role] || [];
    bullets.innerHTML = items.map(b => `<li>${b}</li>`).join('');
  }
  modal.classList.remove('hidden');
}

// ── Tenant branding ───────────────────────────────────────────────
const TENANT_BRANDS = {
  'Meridian Consulting': {
    color: '#1D9E75',
    icon: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="14" r="12" stroke="#1D9E75" stroke-width="2"/><path d="M14 4 L14 24 M8 8 L14 4 L20 8" stroke="#1D9E75" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  'Acme Corp': {
    color: '#D85A30',
    icon: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 3 L16 11 L24 11 L18 16 L20 24 L14 19 L8 24 L10 16 L4 11 L12 11Z" stroke="#D85A30" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>`,
  },
  'BigCo Inc': {
    color: '#378ADD',
    icon: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="4" y="10" width="8" height="14" rx="1" stroke="#378ADD" stroke-width="2"/><rect x="16" y="4" width="8" height="20" rx="1" stroke="#378ADD" stroke-width="2"/><line x1="6" y1="14" x2="10" y2="14" stroke="#378ADD" stroke-width="1.5"/><line x1="6" y1="18" x2="10" y2="18" stroke="#378ADD" stroke-width="1.5"/><line x1="18" y1="8" x2="22" y2="8" stroke="#378ADD" stroke-width="1.5"/><line x1="18" y1="12" x2="22" y2="12" stroke="#378ADD" stroke-width="1.5"/><line x1="18" y1="16" x2="22" y2="16" stroke="#378ADD" stroke-width="1.5"/></svg>`,
  },
  'Summit LLC': {
    color: '#7F77DD',
    icon: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M14 3 L24 24 L4 24Z" stroke="#7F77DD" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M14 10 L18 24 L10 24Z" fill="#7F77DD" opacity="0.2"/></svg>`,
  }
};

// ── Command Palette (#210) ────────────────────────────────────────

function openCmdPalette() {
  const overlay = document.getElementById('cmdPaletteOverlay');
  const input   = document.getElementById('cmdPaletteInput');
  if (!overlay || !input) return;
  overlay.classList.add('active');
  input.value = '';
  _cmdSelIdx = -1;
  _cmdItems  = [];
  input.focus();
  _cmdShowHint();
  // Lazily pre-fetch industry/country for admin/RM so match reasons can be shown
  if (currentUserRole === 'admin' || currentUserRole === 'resource_manager') {
    _cmdPreloadConsultantMeta();
  }
}

function _cmdShowHint() {
  const el = document.getElementById('cmdPaletteResults');
  if (!el) return;
  _cmdItems  = [];
  _cmdSelIdx = -1;
  el.innerHTML = `<div class="cmd-palette-hint">
    <div class="cmd-palette-hint-primary">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px;margin-right:6px;opacity:0.55"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Search consultants, projects, needs\u2026
    </div>
    <div class="cmd-palette-action-tip" id="cmdActionTip">
      <span class="cmd-kbd">&gt;</span>
      <span class="cmd-action-tip-text">Quick actions</span>
      <span class="cmd-action-tip-desc">Add needs, invite users, refresh data\u2026</span>
    </div>
  </div>`;
  document.getElementById('cmdActionTip')?.addEventListener('click', () => {
    const input = document.getElementById('cmdPaletteInput');
    if (!input) return;
    input.value = '>';
    input.dispatchEvent(new Event('input'));
    input.focus();
  });
}

function _cmdSetActionMode(on) {
  _cmdActionMode = on;
  const badge = document.getElementById('cmdActionModeBadge');
  if (badge) badge.classList.toggle('hidden', !on);
}

// ── Action registry ────────────────────────────────────────────────
function _cmdGetActions() {
  const role = currentUserRole;
  const ALL     = ['admin', 'resource_manager', 'project_manager', 'executive', 'consultant'];
  const ADMIN_RM = ['admin', 'resource_manager'];
  return [
    {
      id: 'add-need',
      label: 'Add a need',
      description: 'Open the create need modal',
      icon: '🎯',
      roles: ADMIN_RM,
      handler() {
        closeCmdPalette();
        setTimeout(() => { navigateTo('needs'); openCreateNeedModal(); }, 60);
      },
    },
    {
      id: 'add-consultant',
      label: 'Add a consultant',
      description: 'Go to Settings \u2192 Consultants',
      icon: '👤',
      roles: ['admin'],
      handler() {
        closeCmdPalette();
        navigateTo('settings');
        setTimeout(() => switchSettingsPanel('consultants'), 60);
      },
    },
    {
      id: 'invite-user',
      label: 'Invite a user',
      description: 'Open the invite user modal',
      icon: '✉️',
      roles: ['admin'],
      handler() {
        closeCmdPalette();
        setTimeout(() => openInviteModal(), 60);
      },
    },
    {
      id: 'reset-sandbox',
      label: 'Reset sandbox',
      description: 'Reset tenant sandbox data',
      icon: '🔄',
      roles: ['admin'],
      handler() {
        closeCmdPalette();
        setTimeout(() => resetSandbox(), 60);
      },
    },
    {
      id: 'refresh-data',
      label: 'Refresh data',
      description: 'Reload dashboard + heatmap data',
      icon: '↻',
      roles: ALL,
      handler() {
        closeCmdPalette();
        loadDashboard();
      },
    },
    {
      id: 'toggle-sidebar',
      label: 'Toggle sidebar',
      description: 'Show or hide the sidebar',
      icon: '◫',
      roles: ALL,
      handler() {
        closeCmdPalette();
        toggleSidebar();
      },
    },
    {
      id: 'open-shortcuts',
      label: 'Open keyboard shortcuts',
      description: 'Show the shortcuts help overlay',
      icon: '⌨',
      roles: ALL,
      handler() {
        closeCmdPalette();
        openShortcutGuide();
      },
    },
  ].filter(a => a.roles.includes(role));
}

function _cmdSearchActions(q) {
  const actions = _cmdGetActions();
  const filtered = q
    ? actions.filter(a => _cmdMatch(a.label, q) || _cmdMatch(a.description, q))
    : actions;
  if (!filtered.length) return [];
  return [{
    label: 'Actions',
    allItems: filtered.map(a => ({
      icon: a.icon,
      title: a.label,
      subtitle: a.description,
      action: a.handler,
    })),
  }];
}

async function _cmdPreloadConsultantMeta() {
  if (_cmdConsultantMeta) return;
  try {
    const res = await apiFetch('/api/consultants');
    if (!res.ok) return;
    const list = await res.json();
    _cmdConsultantMeta = {};
    for (const c of list) {
      if (c.id) _cmdConsultantMeta[c.id] = { industry: c.industry || '', country: c.country || '' };
    }
    // Re-run search in case the palette is open and a query is already typed
    const overlay = document.getElementById('cmdPaletteOverlay');
    const input   = document.getElementById('cmdPaletteInput');
    if (overlay && overlay.classList.contains('active') && input && input.value.trim()) {
      _cmdRender(_cmdSearch(input.value.trim()));
    }
  } catch { /* ignore */ }
}

function closeCmdPalette() {
  const overlay = document.getElementById('cmdPaletteOverlay');
  if (overlay) overlay.classList.remove('active');
  _cmdExpandedGroups = new Set();
  _cmdSetActionMode(false);
  // Restore focus to body so Ctrl+K and / work immediately after close
  const input = document.getElementById('cmdPaletteInput');
  if (input) input.blur();
}

function handleCmdPaletteOverlayClick(e) {
  if (e.target === e.currentTarget) closeCmdPalette();
}

// Fuzzy match: case-insensitive substring OR word boundary
function _cmdMatch(text, q) {
  if (!text) return false;
  const t    = String(text).toLowerCase();
  const qLow = q.toLowerCase();
  if (t.includes(qLow)) return true;
  return t.split(/[\s,.\-_&/]+/).some(w => w.startsWith(qLow));
}

// Build deduped consultant list from supply (admin/RM/PM) or heatmap (executive/consultant)
function _cmdGetConsultants() {
  if (rawData.supply && rawData.supply.length > 0) {
    const map = {};
    for (const row of rawData.supply) {
      if (!map[row.employeeName]) {
        const meta = _cmdConsultantMeta && row._consultantId
          ? (_cmdConsultantMeta[row._consultantId] || {})
          : {};
        map[row.employeeName] = {
          name: row.employeeName,
          level: row.level || '',
          allSkillSets: row.allSkillSets || [],
          _consultantId: row._consultantId || null,
          industry: meta.industry || '',
          country: meta.country || '',
        };
      }
    }
    return Object.values(map);
  }
  // Fallback for executive / consultant roles (heatmap only)
  const emps = (rawData.heatmap && rawData.heatmap.employees) || [];
  return emps.map(e => ({
    name: e.name,
    level: e.level || '',
    allSkillSets: e.skillSet ? [e.skillSet] : [],
    _consultantId: null,
    industry: '',
    country: '',
  }));
}

// Build deduped project list from supply; resolve clientName from _meta then openNeeds
function _cmdGetProjects() {
  // projectClientMap (name→clientName) comes from dashboard _meta — covers all projects
  const projectClientMap = (rawData._meta && rawData._meta.projectClientMap) || {};
  // Fallback: resolve via open needs roles for any gaps
  const clientByProject = {};
  for (const r of (rawData.openNeeds && rawData.openNeeds.roles) || []) {
    if (r.project && r.client) clientByProject[r.project] = r.client;
  }
  const map = {};
  for (const row of rawData.supply || []) {
    if (row.projectAssigned && !map[row.projectAssigned]) {
      const clientName = projectClientMap[row.projectAssigned]
        || clientByProject[row.projectAssigned]
        || '';
      map[row.projectAssigned] = {
        name: row.projectAssigned,
        status: row.projectStatus || '',
        clientName,
      };
    }
  }
  return Object.values(map);
}

// Main search: returns array of { label, allItems }
function _cmdSearch(q) {
  const role = currentUserRole;
  const canSeeNeedsProjects =
    role === 'admin' || role === 'resource_manager' || role === 'project_manager';
  const groups = [];

  // ── Consultants ──────────────────────────────────────────────────
  const consultants  = _cmdGetConsultants();
  const matchConsult = [];
  for (const c of consultants) {
    let reason = null;
    if (_cmdMatch(c.name, q)) {
      reason = 'name';
    } else if (_cmdMatch(c.level, q)) {
      reason = 'level';
    } else {
      const matchedSkill = c.allSkillSets.find(s => _cmdMatch(s, q));
      if (matchedSkill) {
        reason = { type: 'skill', value: matchedSkill };
      } else if (c.industry && _cmdMatch(c.industry, q)) {
        reason = { type: 'industry', value: c.industry };
      } else if (c.country && _cmdMatch(c.country, q)) {
        reason = { type: 'country', value: c.country };
      }
    }
    if (reason) matchConsult.push({ c, reason });
  }
  if (matchConsult.length) {
    const _skillsSubtitle = (c) => {
      const skills = c.allSkillSets;
      if (!skills.length) return c.level || '';
      const shown = skills.slice(0, 3).join(', ');
      const extra = skills.length > 3 ? ` +${skills.length - 3} more` : '';
      return [c.level, shown + extra].filter(Boolean).join(' · ');
    };
    groups.push({
      label: 'Consultants',
      allItems: matchConsult.map(({ c, reason }) => {
        let subtitle;
        if (reason === 'name') {
          subtitle = _skillsSubtitle(c);
        } else if (reason === 'level') {
          const skills = c.allSkillSets.slice(0, 2).join(', ');
          subtitle = [`Matched: Level — ${c.level}`, skills].filter(Boolean).join(' · ');
        } else if (reason.type === 'skill') {
          subtitle = [c.level, `Matched: Skill — ${reason.value}`].filter(Boolean).join(' · ');
        } else if (reason.type === 'industry') {
          subtitle = [c.level, `Matched: Industry — ${reason.value}`].filter(Boolean).join(' · ');
        } else if (reason.type === 'country') {
          subtitle = [c.level, `Matched: Country — ${reason.value}`].filter(Boolean).join(' · ');
        }
        return {
          icon: '👤',
          title: c.name,
          subtitle,
          action() {
            closeCmdPalette();
            if (c._consultantId) {
              openConsultantProfileEditor(c._consultantId, c.name);
            } else {
              navigateTo('staffing');
              setTimeout(() => navigateToEmployee(c.name), 150);
            }
          },
        };
      }),
    });
  }

  // ── Projects ─────────────────────────────────────────────────────
  if (canSeeNeedsProjects) {
    const projects   = _cmdGetProjects();
    const matchProjsR = [];
    for (const p of projects) {
      let preason = null;
      if (_cmdMatch(p.name, q)) preason = 'name';
      else if (_cmdMatch(p.clientName, q)) preason = 'client';
      else if (_cmdMatch(p.status, q)) preason = 'status';
      if (preason) matchProjsR.push({ p, preason });
    }
    if (matchProjsR.length) {
      groups.push({
        label: 'Projects',
        allItems: matchProjsR.map(({ p, preason }) => {
          let subtitle;
          if (preason === 'client') {
            subtitle = [`Matched: Client — ${p.clientName}`, p.status].filter(Boolean).join(' · ');
          } else {
            // Always show client for context, even when match is on project name or status
            subtitle = [p.clientName, p.status].filter(Boolean).join(' · ');
          }
          return {
            icon: '📋',
            title: p.name,
            subtitle,
            action() {
              closeCmdPalette();
              navigateTo('needs');
              if (p.clientName) {
                const client = p.clientName;
                setTimeout(() => {
                  if (_collapsedNeedsClients.has(client)) {
                    const header = document.querySelector(
                      `.needs-client-header[data-client-group="${CSS.escape(client)}"]`
                    );
                    if (header) toggleNeedsClientGroup(header);
                  }
                }, 150);
              }
            },
          };
        }),
      });
    }
  }

  // ── Needs ─────────────────────────────────────────────────────────
  if (canSeeNeedsProjects) {
    const roles = (rawData.openNeeds && rawData.openNeeds.roles) || [];
    const matchRolesR = [];
    for (const r of roles) {
      let nreason = null;
      const matchedSkill = (r.allSkillSets || []).find(s => _cmdMatch(s, q))
        || (_cmdMatch(r.skillSet, q) ? r.skillSet : null);
      if (matchedSkill) {
        nreason = { type: 'skill', value: matchedSkill };
      } else if (_cmdMatch(r.level, q)) {
        nreason = 'level';
      } else if (_cmdMatch(r.client, q)) {
        nreason = 'client';
      } else if (_cmdMatch(r.project, q)) {
        nreason = 'project';
      }
      if (nreason) matchRolesR.push({ r, nreason });
    }
    if (matchRolesR.length) {
      const urgencyLabel = r => {
        if (!r.startDate) return 'Planned';
        const p = String(r.startDate).split('/');
        if (p.length < 3) return 'Planned';
        const d    = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
        const days = (d - new Date()) / 86400000;
        return days <= 14 ? 'Urgent' : days <= 28 ? 'Soon' : 'Planned';
      };
      groups.push({
        label: 'Needs',
        allItems: matchRolesR.map(({ r, nreason }) => {
          let subtitle;
          if (nreason && nreason.type === 'skill') {
            subtitle = [r.client, `Matched: Skill — ${nreason.value}`, urgencyLabel(r)].filter(Boolean).join(' · ');
          } else {
            const skills = (r.allSkillSets && r.allSkillSets.length) ? r.allSkillSets.join(', ') : r.skillSet;
            subtitle = [r.client, skills, urgencyLabel(r)].filter(Boolean).join(' · ');
          }
          return {
            icon: '🎯',
            title: `${r.level || 'Role'} — ${r.project || 'Unassigned'}`,
            subtitle,
            action() {
              closeCmdPalette();
              navigateTo('needs');
              const client = r.client;
              const needId = r._needId;
              setTimeout(() => {
                if (client && _collapsedNeedsClients.has(client)) {
                  const header = document.querySelector(
                    `.needs-client-header[data-client-group="${CSS.escape(client)}"]`
                  );
                  if (header) toggleNeedsClientGroup(header);
                }
                // Scroll to and briefly highlight the target row
                setTimeout(() => {
                  const row = needId
                    ? document.querySelector(`.need-row[data-needid="${CSS.escape(needId)}"]`)
                    : null;
                  if (row) {
                    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    row.classList.add('cmd-palette-row-highlight');
                    setTimeout(() => row.classList.remove('cmd-palette-row-highlight'), 1400);
                    // Expand the need detail panel if not already open
                    const expRow = row.nextElementSibling;
                    if (expRow && expRow.classList.contains('need-expansion-row') && expRow.classList.contains('hidden')) {
                      row.click();
                    }
                  }
                }, 120);
              }, 150);
            },
          };
        }),
      });
    }
  }

  // ── Navigation ────────────────────────────────────────────────────
  const navDefs = [
    { title: 'Overview',            subtitle: 'Dashboard, KPIs, utilization charts', icon: '◉',
      roles: ['admin','resource_manager','project_manager','executive'],
      action() { closeCmdPalette(); navigateTo('overview'); } },
    { title: 'Resource Allocation', subtitle: 'Heatmap, weekly hours, bench',         icon: '▦',
      roles: ['admin','resource_manager','project_manager','executive','consultant'],
      action() { closeCmdPalette(); navigateTo('staffing'); } },
    { title: 'Open Needs',          subtitle: 'Demand pipeline, open roles',           icon: '◎',
      roles: ['admin','resource_manager','project_manager'],
      action() { closeCmdPalette(); navigateTo('needs'); } },
    { title: 'Ask Claude',          subtitle: 'AI staffing Q&A',                       icon: '✦',
      roles: ['admin','resource_manager','project_manager','executive'],
      action() { closeCmdPalette(); navigateTo('ask'); } },
    { title: 'Settings',            subtitle: 'Consultants, configuration',            icon: '⚙',
      roles: ['admin','resource_manager'],
      action() { closeCmdPalette(); navigateTo('settings'); } },
    { title: 'Consultants',         subtitle: 'Manage consultant profiles',            icon: '👥',
      roles: ['admin','resource_manager'],
      action() { closeCmdPalette(); navigateTo('settings'); setTimeout(() => switchSettingsPanel('consultants'), 60); } },
    { title: 'Users',               subtitle: 'Manage user accounts and roles',        icon: '🔑',
      roles: ['admin'],
      action() { closeCmdPalette(); navigateTo('settings'); setTimeout(() => switchSettingsPanel('users'), 60); } },
  ];
  const matchNav = navDefs.filter(n =>
    n.roles.includes(role) && (_cmdMatch(n.title, q) || _cmdMatch(n.subtitle, q))
  );
  if (matchNav.length) {
    groups.push({ label: 'Navigation', allItems: matchNav });
  }

  return groups;
}

// Render groups into the results pane
function _cmdRender(groups) {
  _cmdLastGroups = groups;
  const el = document.getElementById('cmdPaletteResults');
  if (!el) return;
  _cmdItems  = [];
  _cmdSelIdx = -1;
  const CAP  = 5;

  if (!groups.length) {
    el.innerHTML = _cmdActionMode
      ? '<div class="cmd-palette-empty">No matching actions<br><span style="font-size:11px">Press Backspace to return to search</span></div>'
      : '<div class="cmd-palette-empty">No results</div>';
    return;
  }

  let html = '';
  for (let gi = 0; gi < groups.length; gi++) {
    const g          = groups[gi];
    const isExpanded = _cmdExpandedGroups.has(g.label);
    const display    = isExpanded ? g.allItems : g.allItems.slice(0, CAP);
    const more       = g.allItems.length - CAP;

    if (gi > 0) html += '<div class="cmd-palette-divider"></div>';
    html += `<div class="cmd-palette-category">${_esc(g.label)}${_cmdActionMode ? '<span class="cmd-palette-action-mode-note"> · Backspace to search</span>' : ''}</div>`;

    for (const item of display) {
      const idx = _cmdItems.length;
      _cmdItems.push({ action: item.action });
      html += `<div class="cmd-palette-item" data-idx="${idx}" role="option">
        <div class="cmd-palette-item-icon">${item.icon}</div>
        <div class="cmd-palette-item-text">
          <div class="cmd-palette-item-title">${_esc(item.title)}</div>
          ${item.subtitle ? `<div class="cmd-palette-item-subtitle">${_esc(item.subtitle)}</div>` : ''}
        </div>
      </div>`;
    }

    if (!isExpanded && more > 0) {
      const idx   = _cmdItems.length;
      const label = g.label;
      _cmdItems.push({ action() { _cmdExpandedGroups.add(label); _cmdRender(_cmdLastGroups); } });
      html += `<div class="cmd-palette-item cmd-palette-more-toggle" data-idx="${idx}">${more} more…</div>`;
    } else if (isExpanded && g.allItems.length > CAP) {
      const idx   = _cmdItems.length;
      const label = g.label;
      _cmdItems.push({ action() { _cmdExpandedGroups.delete(label); _cmdRender(_cmdLastGroups); } });
      html += `<div class="cmd-palette-item cmd-palette-more-toggle" data-idx="${idx}">Show fewer</div>`;
    }
  }

  el.innerHTML = html;

  el.querySelectorAll('.cmd-palette-item').forEach(row => {
    // Mouse select on hover
    row.addEventListener('mousemove', () => {
      const idx = parseInt(row.dataset.idx, 10);
      if (_cmdSelIdx !== idx) _cmdSetSelection(idx);
    });
    // Trigger on mousedown (before blur fires on input)
    row.addEventListener('mousedown', e => {
      e.preventDefault();
      const item = _cmdItems[parseInt(row.dataset.idx, 10)];
      if (item) item.action();
    });
  });
}

// Highlight the selected row and scroll into view
function _cmdSetSelection(idx) {
  const rows = document.querySelectorAll('#cmdPaletteResults .cmd-palette-item');
  rows.forEach(r => r.classList.remove('selected'));
  _cmdSelIdx = Math.max(-1, Math.min(idx, _cmdItems.length - 1));
  if (_cmdSelIdx >= 0 && rows[_cmdSelIdx]) {
    rows[_cmdSelIdx].classList.add('selected');
    rows[_cmdSelIdx].scrollIntoView({ block: 'nearest' });
  }
}

// Wire up input and keyboard events (runs at script load — DOM already present)
(function initCmdPalette() {
  const input = document.getElementById('cmdPaletteInput');
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    _cmdExpandedGroups = new Set();

    if (q.startsWith('>')) {
      _cmdSetActionMode(true);
      const aq = q.slice(1).trimStart();
      _cmdRender(_cmdSearchActions(aq));
      return;
    }

    _cmdSetActionMode(false);
    if (!q) {
      _cmdShowHint();
      return;
    }
    _cmdRender(_cmdSearch(q));
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _cmdSetSelection(_cmdSelIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _cmdSetSelection(_cmdSelIdx - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (_cmdSelIdx >= 0 && _cmdItems[_cmdSelIdx]) {
        _cmdItems[_cmdSelIdx].action();
      }
    } else if (e.key === 'Escape') {
      closeCmdPalette();
    }
  });
})();

// ── StaffingDatePicker (#211) ─────────────────────────────────────
class StaffingDatePicker {
  constructor(inputEl, options = {}) {
    this.input    = inputEl;
    this.opts     = options;
    this.dropdown = null;
    this.viewYear  = 0;
    this.viewMonth = 0;
    this._iso    = options.defaultDate || '';
    this._kbDate = null;

    inputEl.type                = 'text';
    inputEl.readOnly            = true;
    inputEl.style.cursor        = 'pointer';
    inputEl.style.caretColor    = 'transparent';

    this._clickHandler   = () => this._open();
    this._keydownHandler = e  => this._onKeydown(e);
    this._outsideHandler = e  => this._onOutsideClick(e);
    inputEl.addEventListener('click', this._clickHandler);

    if (this._iso) this._applyDisplay(this._iso);
  }

  // ── Static helpers ────────────────────────────────────────────────
  static snapSat(d) {
    // Mon–Sat → that week's Saturday; Sunday → previous Saturday
    const day = d.getDay();
    const s = new Date(d);
    s.setDate(d.getDate() + (day === 0 ? -1 : 6 - day));
    return s;
  }

  static smartDefault() {
    // Always called at runtime — new Date() is evaluated when the function runs
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const day = t.getDay();
    const s = new Date(t);
    if (day === 0) {
      s.setDate(t.getDate() + 6); // Sunday → next Saturday
    } else {
      s.setDate(t.getDate() + (6 - day)); // Mon–Sat → this week's Saturday
    }
    return StaffingDatePicker.toIso(s);
  }

  static toIso(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  static fromIso(s) {
    if (!s) return null;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  static fmtDisplay(iso) {
    if (!iso) return '';
    const d = StaffingDatePicker.fromIso(iso);
    return `Wk ending ${d.getMonth()+1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
  }

  // ── Public API ────────────────────────────────────────────────────
  getDate() { return this._iso; }

  setDate(iso) {
    this._iso = iso || '';
    this._applyDisplay(this._iso);
    if (this.dropdown) {
      const d = StaffingDatePicker.fromIso(iso);
      if (d) { this.viewYear = d.getFullYear(); this.viewMonth = d.getMonth(); }
      this._renderCal();
    }
  }

  destroy() {
    this.close();
    this.input.removeEventListener('click', this._clickHandler);
  }

  // ── Open / Close ──────────────────────────────────────────────────
  _open() {
    if (this.dropdown) return;
    const sel = StaffingDatePicker.fromIso(this._iso) || StaffingDatePicker.fromIso(StaffingDatePicker.smartDefault());
    this.viewYear  = sel.getFullYear();
    this.viewMonth = sel.getMonth();
    this._kbDate   = null;
    this._buildDropdown();
    this._position();
    document.addEventListener('keydown', this._keydownHandler, true);
    requestAnimationFrame(() => document.addEventListener('click', this._outsideHandler));
  }

  close() {
    if (!this.dropdown) return;
    this.dropdown.remove();
    this.dropdown = null;
    document.removeEventListener('keydown', this._keydownHandler, true);
    document.removeEventListener('click',   this._outsideHandler);
    this._kbDate = null;
  }

  _onOutsideClick(e) {
    if (!this.dropdown) return;
    if (!this.dropdown.contains(e.target) && e.target !== this.input) this.close();
  }

  _onKeydown(e) {
    if (!this.dropdown) return;
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    const arrows = { ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7 };
    if (arrows[e.key] !== undefined) {
      e.preventDefault();
      const base = this._kbDate
        ? new Date(this._kbDate)
        : (StaffingDatePicker.fromIso(this._iso) || StaffingDatePicker.fromIso(StaffingDatePicker.smartDefault()));
      this._kbDate = new Date(base);
      this._kbDate.setDate(base.getDate() + arrows[e.key]);
      if (this._kbDate.getFullYear() !== this.viewYear || this._kbDate.getMonth() !== this.viewMonth) {
        this.viewYear  = this._kbDate.getFullYear();
        this.viewMonth = this._kbDate.getMonth();
      }
      this._renderCal();
      return;
    }
    if (e.key === 'Enter' && this._kbDate) {
      e.preventDefault();
      this._select(StaffingDatePicker.toIso(StaffingDatePicker.snapSat(this._kbDate)));
    }
  }

  // ── Build dropdown ────────────────────────────────────────────────
  _buildQuickPickRow() {
    const base = StaffingDatePicker.fromIso(
      this.opts.quickPickBase ? this.opts.quickPickBase() : StaffingDatePicker.smartDefault()
    );
    const qpDefs = this.opts.quickPickDefs || [
      ['This wk', 0], ['Next wk', 7], ['+2 wk', 14], ['+4 wk', 28], ['+8 wk', 56], ['+12 wk', 84]
    ];
    const qpRow = document.createElement('div');
    qpRow.className = 'sdp-quickpicks';
    for (const [label, offset] of qpDefs) {
      const d = new Date(base); d.setDate(base.getDate() + offset);
      const iso = StaffingDatePicker.toIso(d);
      const btn = document.createElement('button');
      btn.type        = 'button';
      btn.className   = 'sdp-qp' + (this._iso === iso ? ' active' : '');
      btn.textContent = label;
      btn.dataset.iso = iso;
      btn.addEventListener('click', () => this._select(iso));
      qpRow.appendChild(btn);
    }
    return qpRow;
  }

  refreshQuickPicks() {
    if (!this.dropdown) return;
    const old = this.dropdown.querySelector('.sdp-quickpicks');
    if (old) old.replaceWith(this._buildQuickPickRow());
  }

  _buildDropdown() {
    const dp = document.createElement('div');
    dp.className = 'sdp-dropdown';
    dp.addEventListener('mousedown', e => e.preventDefault()); // prevent input blur

    dp.appendChild(this._buildQuickPickRow());

    const cal = document.createElement('div');
    cal.className = 'sdp-calendar';
    dp.appendChild(cal);

    this.dropdown = dp;
    this._calEl   = cal;
    document.body.appendChild(dp);
    this._renderCal();
  }

  _renderCal() {
    const cal = this._calEl;
    cal.innerHTML = '';

    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

    // Navigation header
    const nav = document.createElement('div');
    nav.className = 'sdp-cal-nav';
    const mkArrow = (txt, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sdp-nav-arrow'; b.textContent = txt;
      b.addEventListener('click', e => { e.stopPropagation(); fn(); }); return b;
    };
    const lbl = document.createElement('span');
    lbl.className   = 'sdp-month-lbl';
    lbl.textContent = `${MONTHS[this.viewMonth]} ${this.viewYear}`;
    nav.appendChild(mkArrow('‹', () => {
      if (--this.viewMonth < 0)  { this.viewMonth = 11; this.viewYear--; }
      this._renderCal();
    }));
    nav.appendChild(lbl);
    nav.appendChild(mkArrow('›', () => {
      if (++this.viewMonth > 11) { this.viewMonth = 0;  this.viewYear++; }
      this._renderCal();
    }));
    cal.appendChild(nav);

    // Day-of-week headers (Mon … Sun)
    const hdrs = document.createElement('div');
    hdrs.className = 'sdp-day-hdrs';
    for (const h of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']) {
      const dh = document.createElement('div');
      dh.className = 'sdp-day-hdr'; dh.textContent = h;
      hdrs.appendChild(dh);
    }
    cal.appendChild(hdrs);

    // Week rows
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const first = new Date(this.viewYear, this.viewMonth, 1);
    const dow   = first.getDay();                    // 0=Sun
    const off   = dow === 0 ? 6 : dow - 1;           // cells before first (Mon-based)
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - off);

    const weeksEl = document.createElement('div');
    weeksEl.className = 'sdp-weeks';

    for (let w = 0; w < 6; w++) {
      const mon = new Date(gridStart); mon.setDate(gridStart.getDate() + w * 7);
      const sat = new Date(mon);       sat.setDate(mon.getDate() + 5);
      const satIso = StaffingDatePicker.toIso(sat);

      const row = document.createElement('div');
      row.className = 'sdp-week-row' + (this._iso === satIso ? ' selected' : '');

      for (let c = 0; c < 7; c++) {
        const cd = new Date(mon); cd.setDate(mon.getDate() + c);
        const cdIso = StaffingDatePicker.toIso(cd);
        const cell = document.createElement('div');
        cell.className = 'sdp-day';
        if (cd.getMonth() !== this.viewMonth) cell.classList.add('muted');
        if (cd.getTime() === today.getTime())  cell.classList.add('today');
        if (this._kbDate && StaffingDatePicker.toIso(this._kbDate) === cdIso) cell.classList.add('kb-focus');
        cell.textContent = cd.getDate();
        row.appendChild(cell);
      }

      row.addEventListener('click', () => this._select(satIso));
      weeksEl.appendChild(row);
    }
    cal.appendChild(weeksEl);

    // Sync quick-pick highlights
    if (this.dropdown) {
      this.dropdown.querySelectorAll('.sdp-qp').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.iso === this._iso);
      });
    }
  }

  // ── Selection ─────────────────────────────────────────────────────
  _select(iso) {
    this._iso = iso;
    this._applyDisplay(iso);
    this.close();
    if (this.opts.onSelect) this.opts.onSelect(iso);
  }

  _applyDisplay(iso) {
    this.input.value       = StaffingDatePicker.fmtDisplay(iso);
    this.input.dataset.iso = iso;
  }

  // ── Positioning ───────────────────────────────────────────────────
  _position() {
    const dp   = this.dropdown;
    const rect = this.input.getBoundingClientRect();
    dp.style.position = 'fixed';
    dp.style.left     = rect.left + 'px';
    dp.style.top      = (rect.bottom + 4) + 'px';
    dp.style.zIndex   = '10000';
    requestAnimationFrame(() => {
      const dpH = dp.getBoundingClientRect().height;
      if (rect.bottom + 4 + dpH > window.innerHeight - 20) {
        dp.style.top = (rect.top - dpH - 4) + 'px';
      }
    });
  }
}

// Registry of picker instances (keyed by input element ID)
const _sdpMap = {};

function initDatePickers() {
  // ── Add Need (bulk creation) — Step 2 ────────────────────────────
  const cnStartEl = document.getElementById('cn-start-date');
  const cnEndEl   = document.getElementById('cn-end-date');

  const END_DATE_QP_DEFS = [
    ['+2 wk', 14], ['+4 wk', 28], ['+8 wk', 56], ['+12 wk', 84], ['+16 wk', 112], ['+24 wk', 168]
  ];

  if (cnStartEl && !_sdpMap['cn-start-date']) {
    _sdpMap['cn-start-date'] = new StaffingDatePicker(cnStartEl, {
      onSelect(iso) {
        const ep = _sdpMap['cn-end-date'];
        if (!ep) return;
        if (!ep.getDate() || ep.getDate() < iso) {
          const d = StaffingDatePicker.fromIso(iso);
          d.setDate(d.getDate() + 28); // +4 weeks
          ep.setDate(StaffingDatePicker.toIso(d));
        }
        ep.refreshQuickPicks();
      }
    });
  }
  if (cnEndEl && !_sdpMap['cn-end-date']) {
    _sdpMap['cn-end-date'] = new StaffingDatePicker(cnEndEl, {
      quickPickBase: () => _sdpMap['cn-start-date']?.getDate() || StaffingDatePicker.smartDefault(),
      quickPickDefs: END_DATE_QP_DEFS
    });
  }

  // ── Edit Need ─────────────────────────────────────────────────────
  const enStartEl = document.getElementById('en-start-date');
  const enEndEl   = document.getElementById('en-end-date');

  if (enStartEl && !_sdpMap['en-start-date']) {
    _sdpMap['en-start-date'] = new StaffingDatePicker(enStartEl, {
      onSelect(iso) {
        const ep = _sdpMap['en-end-date'];
        if (!ep) return;
        if (!ep.getDate() || ep.getDate() < iso) {
          const d = StaffingDatePicker.fromIso(iso);
          d.setDate(d.getDate() + 28);
          ep.setDate(StaffingDatePicker.toIso(d));
        }
        ep.refreshQuickPicks();
      }
    });
  }
  if (enEndEl && !_sdpMap['en-end-date']) {
    _sdpMap['en-end-date'] = new StaffingDatePicker(enEndEl, {
      quickPickBase: () => _sdpMap['en-start-date']?.getDate() || StaffingDatePicker.smartDefault(),
      quickPickDefs: END_DATE_QP_DEFS
    });
  }
}

// ── Boot ──────────────────────────────────────────────────────────
(async () => {
  try {
    const res = await apiFetch('/api/auth/me');
    if (res.status === 401) { window.location.replace('login.html'); return; }
    const me = await res.json();
    currentUserRole         = me.role || null;
    currentUserCanViewRates = !!me.canViewRates;

    // Show Testing Portal link only for users with a testing_role
    if (me.testing_role) {
      const navEl = document.getElementById('testingPortalNav');
      if (navEl) {
        navEl.style.display = '';
        // After opening the portal in a new tab, navigate this tab back to Overview
        const portalLink = navEl.querySelector('a');
        if (portalLink) {
          portalLink.addEventListener('click', () => {
            setTimeout(() => navigateTo('overview'), 0);
          });
        }
      }
    }

    // Populate sidebar user info
    const displayName = me.display_name || me.user?.email?.split('@')[0] || '';
    const tenantName  = me.tenant_name || '';
    const nameEl     = document.getElementById('sidebarUserName');
    const roleEl     = document.getElementById('sidebarUserRole');
    const tenantEl   = document.getElementById('sidebarTenantName');
    if (nameEl) nameEl.textContent = displayName;
    if (roleEl) {
      const roleLabels = { admin: 'Admin', resource_manager: 'RM',
        project_manager: 'PM', executive: 'Exec', consultant: 'Consultant' };
      roleEl.textContent = roleLabels[me.role] || (me.role || '');
      roleEl.setAttribute('data-role', me.role || '');
    }
    if (tenantEl) tenantEl.textContent = tenantName;

    // Apply per-tenant sidebar branding
    const brand = TENANT_BRANDS[tenantName] || TENANT_BRANDS['Meridian Consulting'];

    // Replace static logo with tenant icon
    const logoEl = document.querySelector('.sidebar-logo');
    if (logoEl) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'sidebar-brand-icon';
      iconSpan.style.cssText = 'display:flex;align-items:center;flex-shrink:0;';
      iconSpan.innerHTML = brand.icon;
      logoEl.replaceWith(iconSpan);
    }

    // 3px left border accent on brand area
    const brandArea = document.querySelector('.sidebar-brand');
    if (brandArea) {
      brandArea.style.borderLeft = `3px solid ${brand.color}`;
      brandArea.style.paddingLeft = '13px'; // compensate for 3px border
    }

    // Tenant name: brand color + soft glow
    if (tenantEl) {
      tenantEl.style.color = brand.color;
      tenantEl.style.textShadow = `0 0 10px ${brand.color}4D`;
    }

    // Active nav item border color (CSS injection survives tab switches)
    const brandStyle = document.createElement('style');
    brandStyle.id = 'tenant-brand-style';
    brandStyle.textContent = `.nav-item.active { border-left-color: ${brand.color} !important; }`;
    document.head.appendChild(brandStyle);

    // Show first-login welcome modal
    if (me.user?.id) _maybeShowWelcomeModal(me.user.id, me.role, displayName, tenantName);
  } catch (e) { window.location.replace('login.html'); return; }

  // ── Role-based tab gating ──────────────────────────────────────
  const role    = currentUserRole;
  const hideTab = name => {
    const el = document.querySelector(`.nav-item[data-tab="${name}"]`);
    if (el) el.style.display = 'none';
  };

  if (role === 'executive')       { hideTab('needs'); hideTab('settings'); } // staffing: read-only access granted
  if (role === 'project_manager') { hideTab('settings'); }
  // resource_manager: settings tab visible (Consultants panel), but User Management is hidden
  // admin: no tabs hidden

  // Consultant: sees only their own staffing row — skip full dashboard load
  if (role === 'consultant') {
    hideTab('overview'); hideTab('needs'); hideTab('ask'); hideTab('settings');
    apiFetch('/api/heatmap')
      .then(r => r.json())
      .then(heatmap => {
        rawData.heatmap = heatmap;
        navigateTo('staffing');
        if (heatmap.consultantLinked === false) {
          const container = document.getElementById('heatmapContainer');
          if (container) container.innerHTML = '<p style="padding:2rem;color:var(--text-muted)">Your account hasn\'t been linked to a consultant profile yet. Please contact your admin.</p>';
        } else {
          buildHeatmapTable(heatmap);
        }
      })
      .catch(err => console.error('[Consultant heatmap]', err));
    initLocationTypeahead();
    setInterval(() => { apiFetch('/api/auth/me').catch(() => {}); }, 30000);
    return;
  }

  // Show Create New Need button for roles that can create needs
  if (role === 'admin' || role === 'resource_manager' || role === 'project_manager') {
    const btn = document.getElementById('createNeedBtn');
    if (btn) btn.classList.remove('hidden');
  }

  // Hide Users and Sandbox nav items for non-admin roles
  if (role !== 'admin') {
    const usersNavBtn = document.getElementById('settingsNavUsers');
    if (usersNavBtn) usersNavBtn.style.display = 'none';
    const sandboxNavBtn = document.getElementById('settingsNavSandbox');
    if (sandboxNavBtn) sandboxNavBtn.style.display = 'none';
  }

  loadDashboard();
  initLocationTypeahead();
  initDatePickers();

  // ── Background session poll — silently checks auth every 30s ──────
  setInterval(() => { apiFetch('/api/auth/me').catch(() => {}); }, 30000);

  // Redirect to first accessible tab if the default (overview) is hidden
  const activeTabName = document.querySelector('.nav-item.active')?.dataset.tab;
  if (role === 'executive' && activeTabName === 'needs') {
    navigateTo('overview');
  }
  // project_manager can now see staffing tab — no redirect needed
})();
