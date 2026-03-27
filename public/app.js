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
let _needsStatusFilter = null;    // active donut segment filter: 'fully_met' | 'partially_met' | 'unmet' | null
let _editConsultantStatus = null; // status of the consultant open in the profile editor
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
      if (currentUserRole === 'admin') loadUsers();
      if (_hmCanEdit()) loadConsultantsPanel();
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
  if (e.key === 'Escape') { closeDrilldown(); closeShortcutGuide(); closeAddProjectModal(); closeConsultantProfileEditor(); return; }
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

// ── Header: Search Bar (Global Typeahead Navigator) (#120) ───────
(function initHeaderSearch() {
  const input = document.getElementById('headerSearch');
  const wrap  = document.querySelector('.header-search-inner');
  if (!input || !wrap) return;

  // Dropdown container
  const dd = document.createElement('div');
  dd.id = 'searchDropdown';
  dd.className = 'hdr-search-dropdown hidden';
  wrap.appendChild(dd);

  let _items    = [];
  let _focusIdx = -1;

  // Keyboard shortcuts: '/' focuses search (common SaaS pattern); Ctrl+K also works
  document.addEventListener('keydown', e => {
    const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
    if (e.key === '/' && !inInput) { e.preventDefault(); input.focus(); input.select(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); input.focus(); input.select(); }
  });

  function getSearchData() {
    const emps = (_vsData && _vsData.employees) || [];
    const projSet = new Set();
    for (const emp of emps) {
      for (const wkProjs of (emp.weeklyProjects || [])) {
        for (const p of wkProjs) if (p && p.project) projSet.add(p.project);
      }
    }
    return { emps, projects: [...projSet].sort() };
  }

  function renderDropdown(query) {
    const q = query.trim().toLowerCase();
    if (!q) { closeDropdown(); return; }

    const { emps, projects } = getSearchData();
    const matchPeople   = emps.filter(e => e.name.toLowerCase().includes(q));
    const matchProjects = projects.filter(p => p.toLowerCase().includes(q));

    _items    = [];
    _focusIdx = -1;

    if (!matchPeople.length && !matchProjects.length) {
      dd.innerHTML = '<div class="hdr-search-empty">No results</div>';
      dd.classList.remove('hidden');
      return;
    }

    let html = '';
    if (matchPeople.length) {
      html += `<div class="hdr-search-group">People</div>`;
      matchPeople.slice(0, 8).forEach(emp => {
        const idx = _items.length;
        _items.push({ type: 'person', name: emp.name });
        html += `<div class="hdr-search-item" data-idx="${idx}">
          <span class="hdr-search-name">${_esc(emp.name)}</span>
          <span class="hdr-search-sub">${_esc(emp.level || '')}</span>
        </div>`;
      });
    }
    if (matchProjects.length) {
      html += `<div class="hdr-search-group">Projects</div>`;
      matchProjects.slice(0, 8).forEach(proj => {
        const idx = _items.length;
        _items.push({ type: 'project', name: proj });
        html += `<div class="hdr-search-item" data-idx="${idx}">
          <span class="hdr-search-name">${_esc(proj)}</span>
          <span class="hdr-search-sub">Project</span>
        </div>`;
      });
    }

    dd.innerHTML = html;
    dd.classList.remove('hidden');

    dd.querySelectorAll('.hdr-search-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault(); // prevent blur before selection
        const item = _items[parseInt(el.dataset.idx, 10)];
        if (item) selectItem(item);
      });
    });
  }

  function updateFocus(newIdx) {
    const els = dd.querySelectorAll('.hdr-search-item');
    els.forEach(el => el.classList.remove('active'));
    _focusIdx = Math.max(-1, Math.min(newIdx, els.length - 1));
    if (_focusIdx >= 0) {
      els[_focusIdx].classList.add('active');
      els[_focusIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  function selectItem(item) {
    closeDropdown();
    input.value = '';
    input.blur();
    if (item.type === 'person')  navigateToEmployee(item.name);
    if (item.type === 'project') navigateToProject(item.name);
  }

  function closeDropdown() {
    dd.classList.add('hidden');
    dd.innerHTML = '';
    _items    = [];
    _focusIdx = -1;
  }

  input.addEventListener('input', () => renderDropdown(input.value));
  input.addEventListener('focus', () => { if (input.value.trim()) renderDropdown(input.value); });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDropdown();
      input.value = '';
      input.blur();
      e.stopPropagation();
      return;
    }
    if (dd.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); updateFocus(_focusIdx + 1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); updateFocus(_focusIdx - 1); }
    if (e.key === 'Enter' && _focusIdx >= 0 && _focusIdx < _items.length) {
      e.preventDefault();
      selectItem(_items[_focusIdx]);
    }
  });

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) closeDropdown();
  });
})();

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
    rawData.coverageRoles = (data.needsCoverage || {}).roles || [];
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
  const utilColor = avgUtil >= 80 ? '#A8E6CF' : avgUtil >= 60 ? '#FFF3A3' : '#FFB3B3';
  const utilCard  = document.getElementById('overviewUtilCard');
  if (utilCard) utilCard.style.setProperty('--ov-accent', utilColor);

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
      data: { datasets: [{ data: [summary.partially_met || 0, unmet],
        backgroundColor: ['#FFF3A3', '#FFB3B3'], borderWidth: 0, hoverOffset: 0 }] },
      options: { responsive: false, cutout: '60%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { duration: 600 },
        onClick: (evt, activeElements) => {
          if (!activeElements.length) return;
          const statusMap = ['partially_met', 'unmet'];
          drillNeedsByStatus(statusMap[activeElements[0].index]);
        } }
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
    <div class="ov-project-row dd-clickable" style="cursor:pointer" onclick="navigateToProject('${_esc(project)}')" title="Click to view in Staffing tab">
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
    return `<div class="ov-cliff-item dd-clickable" style="border-left-color:${bc}" data-name="${_esc(r.name)}" onclick="drillRollingOff(this.dataset.name)" title="Click for availability details">
      <div class="ov-cliff-name">${r.name}</div>
      <div class="ov-cliff-meta">${r.level || '—'}${r.skillSet ? ' · ' + r.skillSet : ''}</div>
      <div class="ov-cliff-detail">
        <span style="color:${bc};font-size:11px">Week of ${r.weekLabel}</span>
        <span class="ov-cliff-hours">${r.fromH}h → ${r.toH}h</span>
      </div>
    </div>`;
  }).join('');
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
    console.log('[drillRollingOff]', { weekKey: 'Week ending ' + wk, totalHours: hrs, isAvailable: hrs < 45 });
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
        <div style="font-size:20px;font-weight:700;color:#4ADE80">Week of ${dateLabel}</div>
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
        <span style="color:#F97316;font-size:11px">Peak: wk of ${r.worstWeek.wk}</span>
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
      <td style="background:rgba(249,115,22,0.12);color:#F97316;font-weight:600;border-left:2px solid #F97316">${e.worstWeek.hrs}h <span style="font-size:11px;color:#8892B0;font-weight:400">wk of ${_esc(e.worstWeek.wk)}</span></td>
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
      <td class="hm-name-cell" data-emp="${sn}" data-tip="${tip}"
        onmouseenter="showEmpTip(event,this)"
        onmousemove="moveEmpTip(event)"
        onmouseleave="hideEmpTip()">
        <div class="hm-name-inner" onmousedown="if(_editActiveCell)_editActiveCell=null;" onclick="toggleHmExpand(this.closest('td').dataset.emp)">
          <span class="hm-chevron">${chv}</span>
          <div class="hm-name-text"><div class="hm-emp-name">${emp.name}</div></div>
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
    { color: '#EF4444', label: '0–10h — Underutilized' },
    { color: '#FACC15', label: '11–44h — Partial' },
    { color: '#10B981', label: '45h — Utilized' },
    { color: '#F97316', label: '46h+ — Overbooked' },
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
  if (_hmExpanded.size > 0 && _hmCanEdit()) {
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

  openDrilldown(`Week of ${week} — Availability Summary`, `
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

// ── Needs Coverage ────────────────────────────────────────────────
function renderCoverageChart(coverage) {
  if (charts.coverage) charts.coverage.destroy();
  if (!coverage) return;

  // Reset recommendations cache on data refresh (preserve pending)
  _needs.recommendations = null;
  _needs.loadState = 'idle';
  _needs.expanded.clear();
  _needsStatusFilter = null;

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
      onClick(evt, elements) {
        const statusMap = ['fully_met', 'partially_met', 'unmet'];
        const clicked = elements.length ? statusMap[elements[0].index] : null;
        if (!clicked || _needsStatusFilter === clicked) {
          _needsStatusFilter = null;
        } else {
          _needsStatusFilter = clicked;
        }
        applyNeedsFilter();
      },
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
    const statusKeys = ['fully_met', 'partially_met', 'unmet'];
    legendEl.innerHTML = items.map((it, i) =>
      `<div class="cov-legend-item" data-filter-status="${statusKeys[i]}" style="cursor:pointer" title="Click to filter">
        <span class="cov-legend-dot" style="background:${it.color}"></span>
        <span class="cov-legend-label">${it.label}</span>
        <span class="cov-legend-count">${it.count}</span>
      </div>`
    ).join('');
    legendEl.querySelectorAll('.cov-legend-item').forEach(el => {
      el.addEventListener('click', () => {
        const s = el.dataset.filterStatus;
        _needsStatusFilter = _needsStatusFilter === s ? null : s;
        applyNeedsFilter();
      });
    });
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
    <tr class="dd-clickable need-row" data-status="${r.status || 'unmet'}" onclick="toggleNeedExpansion(${i}, event)" title="Click to see AI-matched consultants">
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

// ── Needs donut filter ────────────────────────────────────────────
function applyNeedsFilter() {
  const chart = charts.coverage;

  // Show/hide table rows
  document.querySelectorAll('#coverageTable .need-row').forEach(tr => {
    const match = !_needsStatusFilter || tr.dataset.status === _needsStatusFilter;
    tr.style.display = match ? '' : 'none';
    // Also hide the paired expansion row when filtered out
    const exp = tr.nextElementSibling;
    if (exp && exp.classList.contains('need-expansion-row') && !match) {
      exp.classList.add('hidden');
    }
  });

  // Update filter label on legend
  const legendEl = document.getElementById('coverageLegend');
  if (legendEl) {
    legendEl.querySelectorAll('.cov-legend-item').forEach((el, i) => {
      const statuses = ['fully_met', 'partially_met', 'unmet'];
      const isActive = _needsStatusFilter === statuses[i];
      el.style.opacity = _needsStatusFilter && !isActive ? '0.4' : '1';
      el.style.fontWeight = isActive ? '600' : '';
      el.style.cursor = 'pointer';
    });
  }

  // Outline active chart segment
  if (chart && chart.data && chart.data.datasets[0]) {
    const ds = chart.data.datasets[0];
    const count = ds.data.length;
    const statuses = ['fully_met', 'partially_met', 'unmet'];
    ds.borderColor = Array.from({ length: count }, (_, i) =>
      _needsStatusFilter === statuses[i] ? '#FFFFFF' : 'transparent'
    );
    ds.borderWidth = Array.from({ length: count }, (_, i) =>
      _needsStatusFilter === statuses[i] ? 3 : 0
    );
    chart.update('none');
  }
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

async function acceptMatch(needIdx, matchIdx, event) {
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
    const res  = await apiFetch('/api/supply/update', {
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

// ── Drilldown 4a: Needs by Status (donut segment click) ────────────
function drillNeedsByStatus(status) {
  const roles = (rawData.coverageRoles || []).filter(r => r.status === status);
  const labelMap = {
    fully_met:     'Fully Met Needs',
    partially_met: 'Partially Met Needs',
    unmet:         'Unmet Needs',
  };
  const badgeMap = {
    fully_met:     '<span class="dd-badge status-full">Fully Met</span>',
    partially_met: '<span class="dd-badge status-under">Partially Met</span>',
    unmet:         '<span class="dd-badge status-bench">Unmet</span>',
  };
  const title = `${labelMap[status] || status} — ${roles.length} role${roles.length !== 1 ? 's' : ''}`;
  if (!roles.length) {
    openDrilldown(title, '<p class="dd-empty">No roles with this status.</p>');
    return;
  }
  const rows = roles.map((r, i) => {
    const globalIdx = rawData.coverageRoles.indexOf(r);
    return `<tr class="dd-clickable" onclick="drillCoverage(${globalIdx})" title="Click for detail">
      <td>${r.project || '—'}</td>
      <td style="color:#8892B0;font-size:12px">${r.level || '—'}</td>
      <td style="font-size:12px">${r.skillSet || '—'}</td>
      <td style="font-size:11px;color:#8892B0">${r.startDate || '—'} – ${r.endDate || '—'}</td>
      <td>${badgeMap[r.status] || r.status}</td>
    </tr>`;
  }).join('');
  openDrilldown(title, `
    <table class="dd-table">
      <thead><tr><th>Project</th><th>Level</th><th>Skill Set</th><th>Dates</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
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
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); // prevent number input increment/decrement
    const weekIdx = parseInt(input.dataset.idx);
    const empName = input.dataset.emp;
    const project = input.dataset.proj || null;
    if (!project) return; // total row — no project to navigate from
    const goDown = event.key === 'ArrowDown';

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
      // Within same consultant
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
    if (empIdx === -1) return;
    const targetEmpIdx = goDown ? empIdx + 1 : empIdx - 1;
    if (targetEmpIdx < 0 || targetEmpIdx >= emps.length) return; // absolute boundary — do nothing
    const targetEmp = emps[targetEmpIdx];
    const targetProjects = empProjects(targetEmp);
    if (!targetProjects.length) return;
    // Expand target consultant if collapsed
    if (!_hmExpanded.has(targetEmp.name)) _hmExpanded.add(targetEmp.name);
    hmCellBlur(input);
    _editActiveCell = {
      empName: targetEmp.name,
      weekIdx,
      project: goDown ? targetProjects[0] : targetProjects[targetProjects.length - 1]
    };
    _buildVsAllRows();
    _vsRenderVisible();
    setTimeout(() => { const ni = document.querySelector('.hm-cell-editing input'); if (ni) { ni.focus(); ni.select(); } }, 0);
  }
}

// ── Quick Fill ────────────────────────────────────────────────────
// Employee, Project, From, To are all optional filters.
// If omitted: applies to all expanded consultants, all their projects, all visible weeks.
// Only hours is required — enter a value and click Apply.
function applyQuickFill() {
  const empFilter  = document.getElementById('qfEmployee')?.value?.trim() || null;
  const projFilter = document.getElementById('qfProject')?.value?.trim() || null;
  const fromVal    = document.getElementById('qfFrom')?.value || null;
  const toVal      = document.getElementById('qfTo')?.value || null;
  const hoursRaw   = document.getElementById('qfHours')?.value;
  const hours      = Math.max(0, Math.min(100, Number(hoursRaw) || 0));

  if (!_vsData) { showToast('Heatmap data not loaded yet.', 'error'); return; }
  if (_hmExpanded.size === 0) { showToast('Expand at least one consultant row first.', 'error'); return; }
  if (hoursRaw === '' || hoursRaw === null || hoursRaw === undefined) {
    showToast('Enter hours per week before applying Quick Fill.', 'error');
    return;
  }

  // Optional date range
  let fromDate = null, toDate = null;
  if (fromVal) fromDate = new Date(fromVal + 'T00:00:00');
  if (toVal)   toDate   = new Date(toVal   + 'T00:00:00');
  if (fromDate && toDate && fromDate > toDate) {
    showToast('From date must be before To date.', 'error');
    return;
  }

  const year = new Date().getFullYear();
  let count = 0;

  // Target: filtered employee or all expanded consultants
  const targetEmps = _vsData.employees.filter(e =>
    _hmExpanded.has(e.name) && (!empFilter || e.name === empFilter)
  );

  for (const emp of targetEmps) {
    // Collect unique projects for this employee
    const allProjects = [];
    for (const wkProjs of emp.weeklyProjects)
      for (const p of wkProjs)
        if (!allProjects.includes(p.project)) allProjects.push(p.project);

    // If a project filter is set, narrow to that project only
    const projects = projFilter ? allProjects.filter(p => p === projFilter) : allProjects;
    if (!projects.length) continue;

    for (let weekIdx = 0; weekIdx < _vsData.weeks.length; weekIdx++) {
      const weekLabel = _vsData.weeks[weekIdx];

      // Apply optional date range filter
      if (fromDate || toDate) {
        const m = weekLabel.match(/(\d+)\/(\d+)/);
        if (!m) continue;
        const wkDate = new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
        if (fromDate && wkDate < fromDate) continue;
        if (toDate   && wkDate > toDate)   continue;
      }

      for (const project of projects) {
        _pendingStaffing.set(`${emp.name}||${weekLabel}||${project}`, hours);
        count++;
      }
    }
  }

  if (count === 0) {
    showToast('No cells matched — check employee/project filters or date range.', 'error');
    return;
  }

  _buildVsAllRows();
  _vsRenderVisible();
  updateHmSaveBar();
  showToast(`Quick Fill: applied ${hours}h to ${count} cell${count === 1 ? '' : 's'}.`, 'success');
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
let _inactiveConsultantsExpanded = false;

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

  tbody.innerHTML = active.length
    ? active.map(c => _renderConsultantRow(c)).join('')
    : `<tr><td colspan="6" style="padding:32px 20px;text-align:center;color:#8892B0;font-size:13px">No active consultants</td></tr>`;

  if (inactEl) _renderInactiveConsultantsSection(inactEl, inactive);
}

function _renderConsultantRow(c) {
  const levelCell    = c.level    ? `<span style="color:#C9B8FF;font-size:12px">${_esc(c.level)}</span>`    : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const skills       = Array.isArray(c.skillSets) ? c.skillSets : (c.primarySkillSet ? [{ name: c.primarySkillSet, type: 'Technology' }] : []);
  const skillPills   = skills.map(s => {
    const label = typeof s === 'string' ? s : s.name;
    return `<span class="skill-pill">${_esc(label)}</span>`;
  });
  const skillCell    = skillPills.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${skillPills.join('')}</div>` : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const locationCell = c.location ? `<span style="color:#8892B0;font-size:12px">${_esc(c.location)}</span>` : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const statusPill   = `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#10B981;background:#052E16;border:1px solid rgba(16,185,129,0.3)">Active</span>`;

  const editBtn = c.id
    ? `<button data-cid="${_esc(c.id)}" onclick="openConsultantProfileEditor(this.dataset.cid)"
         style="height:32px;padding:0 12px;background:transparent;border:1px solid rgba(255,255,255,0.12);border-radius:6px;color:#9CA3AF;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(255,255,255,.06)'" onmouseout="this.style.background='transparent'">Edit</button>`
    : '';

  const deactBtn = c.id
    ? `<button data-cid="${_esc(c.id)}" data-name="${_esc(c.name)}" onclick="deactivateConsultant(this.dataset.cid,this.dataset.name)"
         style="height:32px;padding:0 12px;background:rgba(252,165,165,.12);border:1px solid rgba(252,165,165,.25);border-radius:6px;color:#FCA5A5;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(252,165,165,.22)'" onmouseout="this.style.background='rgba(252,165,165,.12)'">Deactivate</button>`
    : '';

  return `<tr data-cid="${_esc(c.id)}" style="border-bottom:1px solid rgba(255,255,255,.05)">
    <td style="padding:13px 20px;color:#E2E8F0;font-weight:500;white-space:nowrap">${_esc(c.name)}</td>
    <td style="padding:13px 16px">${levelCell}</td>
    <td style="padding:13px 16px">${skillCell}</td>
    <td style="padding:13px 16px">${locationCell}</td>
    <td style="padding:13px 16px">${statusPill}</td>
    <td style="padding:13px 20px">
      <div style="display:flex;align-items:center;gap:8px">
        ${editBtn}
        ${deactBtn}
      </div>
    </td>
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
    return `<span class="skill-pill">${_esc(label)}</span>`;
  });
  const skillCell    = skillPills.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px">${skillPills.join('')}</div>` : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const locationCell = c.location ? `<span style="color:#8892B0;font-size:12px">${_esc(c.location)}</span>` : `<span style="color:#4A4D5A;font-size:12px">—</span>`;
  const statusPill   = `<span style="display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:500;color:#6B6F76;background:#1A1D27;border:1px solid rgba(255,255,255,0.1)">Inactive</span>`;

  const reactBtn = c.id
    ? `<button data-cid="${_esc(c.id)}" data-name="${_esc(c.name)}" onclick="reactivateConsultant(this.dataset.cid,this.dataset.name)"
         style="height:32px;padding:0 12px;background:rgba(168,230,207,.12);border:1px solid rgba(168,230,207,.25);border-radius:6px;color:#A8E6CF;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap"
         onmouseover="this.style.background='rgba(168,230,207,.22)'" onmouseout="this.style.background='rgba(168,230,207,.12)'">Reactivate</button>`
    : '';

  return `<tr data-cid="${_esc(c.id)}" style="border-bottom:1px solid rgba(255,255,255,.04);opacity:0.5">
    <td style="padding:13px 20px;color:#E2E8F0;font-weight:500;white-space:nowrap">${_esc(c.name)}</td>
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
    console.log('[addProject] /api/projects returned', allProjects.length, 'projects', allProjects);
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
  console.log('[addProject] assigned projects for', empName, [...assignedProjects]);

  // Populate project dropdown (exclude already assigned)
  const projSel = document.getElementById('apProject');
  projSel.innerHTML = '<option value="">Select project…</option>';
  const available = allProjects.filter(p => !assignedProjects.has(p.name));
  console.log('[addProject] available projects', available.length, available.map(p => p.name));
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
      o.textContent = `Week of ${weeks[i]}`;
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

  document.getElementById('cpTitle').textContent = consultantName || 'Consultant Profile';
  document.getElementById('cpSubtitle').textContent = 'Loading…';
  document.getElementById('cpSkillGrid').innerHTML = '';
  document.getElementById('cpSkillEmpty').classList.add('hidden');
  document.getElementById('consultantProfileModal').classList.remove('hidden');

  let profile;
  try {
    const res = await apiFetch(`/api/consultants/${encodeURIComponent(consultantId)}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showToast(`Failed to load profile (${res.status}): ${body.error || ''}`, 'error');
      closeConsultantProfileEditor();
      return;
    }
    profile = await res.json();
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

  // Rate overrides (only visible to admin/resource_manager — hidden entirely for others)
  const billEl = document.getElementById('cpBillRate');
  const costEl = document.getElementById('cpCostRate');
  billEl.value = consultant.bill_rate_override != null ? consultant.bill_rate_override : '';
  costEl.value = consultant.cost_rate_override != null ? consultant.cost_rate_override : '';
  billEl.disabled = readOnly;
  costEl.disabled = readOnly;
  // Hide rate fields for non-editors
  const rateFields = billEl.closest('div').parentElement;
  if (readOnly) {
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
      tag.dataset.ssId = ss.id;
      tag.textContent = ss.name;
      if (readOnly) {
        tag.setAttribute('disabled', '');
      } else {
        tag.addEventListener('click', () => tag.classList.toggle('selected'));
      }
      grid.appendChild(tag);
    }
  }

  // Track status for deactivate/reactivate button
  _editConsultantStatus = consultant.status;

  // Show/hide save button
  if (readOnly) {
    document.getElementById('cpSubmitBtn').style.display = 'none';
    document.querySelector('#cpActions button[type="button"][onclick*="close"]').textContent = 'Close';
  } else {
    document.getElementById('cpSubmitBtn').style.display = '';
    document.querySelector('#cpActions button[type="button"][onclick*="close"]').textContent = 'Cancel';
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
  modal.classList.add('hidden');
  _editConsultantId = null;
  _editConsultantStatus = null;
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
  const billRaw  = document.getElementById('cpBillRate').value;
  const costRaw  = document.getElementById('cpCostRate').value;
  const bill_rate_override = billRaw !== '' ? parseFloat(billRaw) : null;
  const cost_rate_override = costRaw !== '' ? parseFloat(costRaw) : null;

  const selectedIds = [...document.querySelectorAll('#cpSkillGrid .cp-skill-tag.selected')]
    .map(t => t.dataset.ssId);

  if (!name) { showToast('Name is required.', 'error'); return; }

  const btn = document.getElementById('cpSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const [patchRes, skillsRes] = await Promise.all([
      apiFetch(`/api/consultants/${encodeURIComponent(_editConsultantId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, level_id, location, bill_rate_override, cost_rate_override }),
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
  modal.classList.add('hidden');
  document.getElementById('inviteForm').reset();
  document.getElementById('inviteError').classList.add('hidden');
  checkInvitePwStrength(''); // reset checklist and re-disable submit
}

function checkInvitePwStrength(val) {
  const rules = [
    { id: 'pwRule-len',   ok: val.length >= 12,              label: 'At least 12 characters' },
    { id: 'pwRule-upper', ok: /[A-Z]/.test(val),             label: 'Uppercase letter' },
    { id: 'pwRule-lower', ok: /[a-z]/.test(val),             label: 'Lowercase letter' },
    { id: 'pwRule-num',   ok: /\d/.test(val),                label: 'Number' },
    { id: 'pwRule-spec',  ok: /[^A-Za-z\d]/.test(val),      label: 'Special character' },
  ];
  let allPass = true;
  for (const r of rules) {
    const el = document.getElementById(r.id);
    if (!el) continue;
    if (r.ok) {
      el.textContent = `✓ ${r.label}`;
      el.style.color = '#10B981';
    } else {
      el.textContent = `✕ ${r.label}`;
      el.style.color = val.length === 0 ? '#4A4D5A' : '#F87171';
      allPass = false;
    }
  }
  const btn = document.getElementById('inviteSubmitBtn');
  btn.disabled      = !allPass;
  btn.style.opacity = allPass ? '1' : '0.45';
  btn.style.cursor  = allPass ? 'pointer' : 'not-allowed';
}

function handleInviteOverlayClick(e) {
  if (e.target === document.getElementById('inviteModal')) closeInviteModal();
}

// Phase 2 SSO/SAML: delivery method toggle (magic link vs temp password) will be added here.

async function submitInvite(e) {
  e.preventDefault();
  const form   = document.getElementById('inviteForm');
  const errEl  = document.getElementById('inviteError');
  errEl.classList.add('hidden');

  const name         = form.elements.name.value.trim();
  const email        = form.elements.email.value.trim();
  const role         = form.elements.role.value;
  const tempPassword = form.elements.tempPassword?.value.trim() || '';

  if (!name || !email || !role) {
    errEl.textContent = 'Name, email, and role are required.';
    errEl.classList.remove('hidden');
    return;
  }
  if (!tempPassword) {
    errEl.textContent = 'A temporary password is required.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('inviteSubmitBtn');
  btn.disabled    = true;
  btn.textContent = 'Creating…';

  try {
    const res = await apiFetch('/api/admin/users/invite', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, email, role, tempPassword }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Failed to create user.';
      errEl.classList.remove('hidden');
      btn.disabled    = false;
      btn.textContent = 'Create User';
      return;
    }

    closeInviteModal();
    showToast(`${email} created successfully.`);
    loadUsers();
  } catch (err) {
    errEl.textContent = err.message || 'Network error.';
    errEl.classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = 'Create User';
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

// ── Boot ──────────────────────────────────────────────────────────
(async () => {
  try {
    const res = await apiFetch('/api/auth/me');
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

  if (role === 'executive')       { hideTab('needs'); hideTab('settings'); } // staffing: read-only access granted
  if (role === 'project_manager') { hideTab('staffing'); hideTab('settings'); }
  // resource_manager: settings tab visible (Consultants panel), but User Management is hidden
  // admin: no tabs hidden

  // Hide User Management section for non-admin roles
  if (role !== 'admin') {
    const umSection = document.getElementById('userMgmtSection');
    if (umSection) umSection.style.display = 'none';
  }

  loadDashboard();
  initLocationTypeahead();

  // ── Background session poll — silently checks auth every 30s ──────
  setInterval(() => { apiFetch('/api/auth/me').catch(() => {}); }, 30000);

  // Redirect to first accessible tab if the default (overview) is hidden
  const activeTabName = document.querySelector('.nav-item.active')?.dataset.tab;
  if (role === 'executive' && activeTabName === 'needs') {
    navigateTo('overview');
  }
  if (role === 'project_manager' && activeTabName === 'staffing') {
    navigateTo('overview');
  }
})();
