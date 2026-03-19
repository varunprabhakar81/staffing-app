/* ── Staffing Intelligence — Frontend App ──────────────────────── */

'use strict';

// ── Fix Chart.js resolution on high-DPI / Retina displays ─────────
Chart.defaults.devicePixelRatio = window.devicePixelRatio || 2;

// ── Tab switching ─────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
  });
});

// Close drilldown on Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrilldown(); });

// ── Chart registry (so we can destroy + re-render on refresh) ─────
const charts = {};

// ── Raw data store for drilldowns ─────────────────────────────────
const rawData = { supply: [], employees: [], cliffs: [], coverageRoles: [], heatmap: null };

// ── Tracks which employee rows are expanded in the heatmap ────────
const _hmExpanded = new Set();

// ── Status indicator ──────────────────────────────────────────────
function setStatus(type, msg) {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.className  = `status-dot ${type}`;
  text.textContent = msg;
}

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
  setStatus('loading', 'Loading data…');
  try {
    const [dashRes, supplyRes, empRes, heatmapRes] = await Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/supply'),
      fetch('/api/employees'),
      fetch('/api/heatmap'),
    ]);

    if (!dashRes.ok) throw new Error(`HTTP ${dashRes.status}`);
    const data = await dashRes.json();
    if (data.error) throw new Error(data.error);

    rawData.supply        = supplyRes.ok    ? await supplyRes.json()    : [];
    rawData.employees     = empRes.ok       ? await empRes.json()       : [];
    rawData.cliffs        = data.cliffs     || [];
    rawData.coverageRoles = (data.needsCoverage || {}).roles || [];
    rawData.heatmap       = heatmapRes.ok   ? await heatmapRes.json()   : null;

    setStatus('ok', 'Live data');
    document.getElementById('dataTimestamp').textContent =
      `Last updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    renderKPIs(data);
    renderCoverageChart(data.needsCoverage);
    renderBenchReport(data.benchReport);
    if (rawData.heatmap) buildHeatmapTable(rawData.heatmap);

  } catch (err) {
    setStatus('error', 'Connection error');
    document.getElementById('dataTimestamp').textContent = 'Could not load data — check server';
    console.error('[Dashboard]', err);
  }
}

// ── KPI Cards ─────────────────────────────────────────────────────
function renderKPIs(data) {
  const levels    = data.utilizationByLevel || [];
  const headcount = levels.reduce((s, l) => s + l.headcount, 0);
  const avgUtil   = headcount
    ? Math.round(levels.reduce((s, l) => s + l.utilizationPct * l.headcount, 0) / headcount)
    : 0;
  const benchCount  = (data.benchReport || []).reduce((s, g) => s + g.employees.length, 0);
  const summary     = (data.needsCoverage || {}).summary || {};
  const totalRoles  = (summary.fully_met || 0) + (summary.partially_met || 0) + (summary.unmet || 0);

  document.getElementById('kpiHeadcount').textContent   = headcount || '—';
  document.getElementById('kpiUtilization').textContent = headcount ? `${avgUtil}%` : '—';
  document.getElementById('kpiBench').textContent       = benchCount;
  document.getElementById('kpiUncovered').textContent   = totalRoles || '—';

  const breakdownEl = document.getElementById('kpiCoverageBreakdown');
  if (breakdownEl && totalRoles) {
    breakdownEl.textContent =
      `${summary.fully_met || 0} met · ${summary.partially_met || 0} partial · ${summary.unmet || 0} unmet`;
  }

  // Headcount: neutral white
  document.getElementById('kpiHeadcount').className = 'kpi-value';

  // Utilization: mint 90-100%, yellow 70-89%, coral <70%
  const utilEl = document.getElementById('kpiUtilization');
  utilEl.className = 'kpi-value ' + (avgUtil >= 90 ? 'ok' : avgUtil >= 70 ? 'warn' : 'danger');

  // Bench: coral if anyone on bench, mint if zero
  document.getElementById('kpiBench').className = 'kpi-value ' + (benchCount > 0 ? 'danger' : 'ok');

  // Demand: coral if unmet, yellow if partial only, mint if all met
  const uncovEl = document.getElementById('kpiUncovered');
  uncovEl.className = 'kpi-value ' + (
    (summary.unmet || 0) > 0       ? 'danger' :
    (summary.partially_met || 0) > 0 ? 'warn'   : 'ok'
  );
}

// ══════════════════════════════════════════════════════════════════
// ── Availability Heatmap ──────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function heatmapCellBg(hours) {
  if (hours === 0)  return '#8B0000';
  if (hours < 40)   return '#FFB3B3';
  if (hours < 45)   return '#FFF3A3';
  if (hours === 45) return '#A8E6CF';
  if (hours <= 50)  return '#FF9999';
  return '#FF8A80';
}

function heatmapCellFg(hours) {
  return hours === 0 ? '#FFFFFF' : '#0F1117';
}

function encodeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
}

// ── Tooltip helpers ───────────────────────────────────────────────
let _hmTip = null;

function showHmTooltip(evt, el) {
  if (!_hmTip) {
    _hmTip = document.createElement('div');
    _hmTip.id = 'hmTooltip';
    document.body.appendChild(_hmTip);
  }
  _hmTip.textContent = el.dataset.tip || '';
  _hmTip.style.display = 'block';
  positionHmTooltip(evt);
}

function hideHmTooltip() {
  if (_hmTip) _hmTip.style.display = 'none';
}

function positionHmTooltip(evt) {
  if (!_hmTip || _hmTip.style.display === 'none') return;
  const x = Math.min(evt.clientX + 14, window.innerWidth - 220);
  const y = Math.max(evt.clientY - 50, 8);
  _hmTip.style.left = x + 'px';
  _hmTip.style.top  = y + 'px';
}

// ── Build heatmap table ───────────────────────────────────────────
function buildHeatmapTable(data) {
  const container = document.getElementById('heatmapContainer');
  if (!container) return;
  const { weeks, employees } = data;

  // Badge + legend stats for week 0 (current week)
  let bench = 0, under = 0, full = 0, over = 0, totalAvail = 0;
  for (const emp of employees) {
    const h = emp.weeklyHours[0] || 0;
    totalAvail += Math.max(0, 45 - h);
    if (h === 0)       bench++;
    else if (h < 40)   under++;
    else if (h <= 45)  full++;
    else               over++;
  }
  const badge = document.getElementById('heatmapBadge');
  if (badge) { badge.textContent = `${totalAvail}h available this week`; badge.className = 'chart-badge'; }

  // thead
  const wkThs = weeks.map((w, i) =>
    `<th class="hm-week-th dd-clickable" onclick="drillHeatmapWeek(${i})" title="Click for week availability">${w}</th>`
  ).join('');
  const thead = `<thead><tr><th class="hm-name-th">Employee<span id="hmToggleIcon" class="hm-toggle-icon" onclick="hmToggleAll()" title="Expand All">⊞</span></th>${wkThs}</tr></thead>`;

  // Group by level
  const byLevel = {};
  for (const emp of employees) {
    if (!byLevel[emp.level]) byLevel[emp.level] = [];
    byLevel[emp.level].push(emp);
  }

  // tbody — employee rows + hidden project sub-rows
  let tbody = '<tbody>';
  for (const level of LEVEL_ORDER) {
    const emps = byLevel[level];
    if (!emps || !emps.length) continue;
    tbody += `<tr class="hm-level-row"><td colspan="${weeks.length + 1}">${level} <span style="opacity:0.55;font-size:11px">(${emps.length})</span></td></tr>`;

    for (const emp of emps) {
      const safeNameAttr = encodeAttr(emp.name);

      // ── Employee row ──────────────────────────────────────────
      const cells = emp.weeklyHours.map((h, i) => {
        const projects = emp.weeklyProjects[i];
        const projLines = projects.length
          ? projects.map(p => `${p.project}: ${p.hours}h`).join('\n')
          : 'No bookings';
        const tipText = encodeAttr(`${h}h total\n${projLines}`);
        return `<td class="hm-cell dd-clickable"
          style="background:${heatmapCellBg(h)};color:${heatmapCellFg(h)}"
          data-emp="${safeNameAttr}" data-idx="${i}" data-tip="${tipText}"
          onclick="drillHeatmapCell(this.dataset.emp,parseInt(this.dataset.idx))"
          onmouseenter="showHmTooltip(event,this)"
          onmousemove="positionHmTooltip(event)"
          onmouseleave="hideHmTooltip()">${h}</td>`;
      }).join('');

      tbody += `<tr class="hm-emp-row">
        <td class="hm-name-cell" data-emp="${safeNameAttr}">
          <div class="hm-name-inner" onclick="toggleHmExpand(this.closest('.hm-name-cell').dataset.emp)">
            <span class="hm-chevron" data-emp="${safeNameAttr}">▶</span>
            <div class="hm-name-text">
              <div class="hm-emp-name">${emp.name}</div>
              <div class="hm-emp-skill">${emp.skillSet || '—'}</div>
            </div>
          </div>
          <span class="hm-info-icon" data-emp="${safeNameAttr}"
            onclick="event.stopPropagation();drillHeatmapEmployee(this.dataset.emp)"
            title="Full booking history">ℹ</span>
        </td>${cells}</tr>`;

      // ── Project sub-rows (hidden by default) ──────────────────
      // Collect unique projects ordered by first appearance
      const allProjects = [];
      for (const weekProjs of emp.weeklyProjects)
        for (const p of weekProjs)
          if (!allProjects.includes(p.project)) allProjects.push(p.project);

      for (const projName of allProjects) {
        const projCells = emp.weeklyProjects.map((weekProjs) => {
          const match = weekProjs.find(p => p.project === projName);
          const h = match ? match.hours : 0;
          const bg = h > 0 ? heatmapCellBg(h) : '#16192A';
          const fg = h > 0 ? heatmapCellFg(h) : '#4A5568';
          return `<td class="hm-sub-cell" style="background:${bg};color:${fg}">${h > 0 ? h : '—'}</td>`;
        }).join('');
        tbody += `<tr class="hm-sub-row" data-parent="${safeNameAttr}">
          <td class="hm-sub-name-cell"><span class="hm-sub-indent">${encodeAttr(projName)}</span></td>
          ${projCells}</tr>`;
      }

      // Total sub-row
      const totalCells = emp.weeklyHours.map(h => {
        return `<td class="hm-sub-cell hm-sub-total-cell"
          style="background:${heatmapCellBg(h)};color:${heatmapCellFg(h)}">${h}</td>`;
      }).join('');
      tbody += `<tr class="hm-sub-row hm-sub-total-row" data-parent="${safeNameAttr}">
        <td class="hm-sub-name-cell"><span class="hm-sub-indent hm-sub-total-label">Total</span></td>
        ${totalCells}</tr>`;
    }
  }
  tbody += '</tbody>';

  // Legend swatches
  const swatches = [
    { bg: '#8B0000', label: '0h — Bench' },
    { bg: '#FFB3B3', label: '1–39h — Under' },
    { bg: '#FFF3A3', label: '40–44h — Nominal' },
    { bg: '#A8E6CF', label: '45h — Full' },
    { bg: '#FF9999', label: '46–50h — Over' },
    { bg: '#FF8A80', label: '51h+ — Over+' },
  ].map(s => `<div class="hm-swatch-item"><span class="hm-swatch" style="background:${s.bg}"></span>${s.label}</div>`).join('');

  container.innerHTML = `
    <div class="hm-scroll-wrap">
      <table class="hm-table">${thead}${tbody}</table>
    </div>
    <div class="hm-legend">
      <div class="hm-legend-swatches">${swatches}</div>
      <div class="hm-legend-stats">
        <span style="color:#A8E6CF;font-weight:600">${totalAvail}h available this week</span>
        <span style="color:#8892B0;margin-left:16px">Bench: ${bench} · Under: ${under} · Full/Nominal: ${full} · Overbooked: ${over}</span>
      </div>
      <div class="hm-legend-hint">Click ▶ to expand employee project breakdown</div>
    </div>`;

  // Restore previously expanded employees (survives data refresh)
  for (const empName of _hmExpanded) _applyExpand(empName, true);
  _updateHmToggleIcon();
}

// ── Expand / Collapse helpers ─────────────────────────────────────
function _getSubRows(empName) {
  return Array.from(document.querySelectorAll('.hm-sub-row'))
    .filter(r => r.dataset.parent === empName);
}

function _getChevron(empName) {
  return Array.from(document.querySelectorAll('.hm-chevron'))
    .find(c => c.dataset.emp === empName);
}

function _applyExpand(empName, expanded) {
  const rows    = _getSubRows(empName);
  const chevron = _getChevron(empName);
  if (expanded) {
    rows.forEach(r => {
      r.style.display = 'table-row';
      r.offsetHeight;                        // force reflow for transition
      r.classList.add('hm-sub-visible');
    });
    if (chevron) chevron.textContent = '▼';
  } else {
    rows.forEach(r => {
      r.classList.remove('hm-sub-visible');
      r.addEventListener('transitionend', () => { r.style.display = 'none'; }, { once: true });
    });
    if (chevron) chevron.textContent = '▶';
  }
}

function toggleHmExpand(empName) {
  const isExpanded = _hmExpanded.has(empName);
  if (isExpanded) {
    _hmExpanded.delete(empName);
    _applyExpand(empName, false);
  } else {
    _hmExpanded.add(empName);
    _applyExpand(empName, true);
  }
  _updateHmToggleIcon();
}

function _allEmpNames() {
  return Array.from(document.querySelectorAll('.hm-chevron')).map(c => c.dataset.emp);
}

function _updateHmToggleIcon() {
  const icon = document.getElementById('hmToggleIcon');
  if (!icon) return;
  const all = _allEmpNames();
  const allExpanded = all.length > 0 && all.every(n => _hmExpanded.has(n));
  if (allExpanded) {
    icon.textContent = '⊟';
    icon.title = 'Collapse All';
  } else {
    icon.textContent = '⊞';
    icon.title = 'Expand All';
  }
}

function hmToggleAll() {
  const all = _allEmpNames();
  const allExpanded = all.length > 0 && all.every(n => _hmExpanded.has(n));
  if (allExpanded) {
    for (const name of all) { _hmExpanded.delete(name); _applyExpand(name, false); }
  } else {
    for (const name of all) { _hmExpanded.add(name); _applyExpand(name, true); }
  }
  _updateHmToggleIcon();
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
    const bg = heatmapCellBg(h);
    const fg = heatmapCellFg(h);
    return `<tr>
      <td>${week}</td>
      <td style="font-size:12px">${projText}</td>
      <td><span style="background:${bg};color:${fg};border-radius:4px;padding:2px 8px;font-weight:700;font-size:12px">${h}h</span></td>
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

// ── Needs Coverage ────────────────────────────────────────────────
function renderCoverageChart(coverage) {
  if (charts.coverage) charts.coverage.destroy();
  if (!coverage) return;

  const summary      = coverage.summary || {};
  const fullyMet     = summary.fully_met    || 0;
  const partiallyMet = summary.partially_met || 0;
  const unmet        = summary.unmet        || 0;
  const total        = fullyMet + partiallyMet + unmet;

  const badge = document.getElementById('coverageBadge');
  badge.textContent = total ? `${total} open roles` : 'No open roles';
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
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: window.devicePixelRatio || 2,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Inter', size: 12 }, color: '#8892B0', padding: 12, usePointStyle: true,
            generateLabels(chart) {
              const counts = [fullyMet, partiallyMet, unmet];
              const names  = ['Fully Met', 'Partially Met', 'Unmet'];
              const colors = total === 0
                ? ['#2E3250', '#2E3250', '#2E3250']
                : ['#A8E6CF', '#FFF3A3', '#FFB3B3'];
              return names.map((name, i) => ({
                text: `${name} (${counts[i]})`,
                fillStyle: colors[i],
                strokeStyle: colors[i],
                lineWidth: 0,
                pointStyle: 'circle',
                hidden: false,
                index: i,
              }));
            },
          },
        },
        tooltip: { backgroundColor: '#22263A', titleColor: '#FFFFFF', bodyColor: '#8892B0', padding: 10 },
      },
    },
    plugins: [{
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea: { width, height, left, top } } = chart;
        ctx.save();
        const cx = left + width / 2;
        const cy = top  + height / 2 - 10;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 32px Inter, sans-serif`;
        ctx.fillStyle = total === 0 ? '#8892B0' : '#FFFFFF';
        ctx.fillText(total === 0 ? '—' : `${total}`, cx, cy);
        ctx.font = `400 12px Inter, sans-serif`;
        ctx.fillStyle = '#8892B0';
        ctx.fillText('open roles', cx, cy + 24);
        ctx.restore();
      },
    }],
  });

  const tableEl = document.getElementById('coverageTable');
  if (!coverage.roles || !coverage.roles.length) {
    tableEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:8px 0">No open demand roles</p>';
    return;
  }

  const statusBadge = (status) => {
    if (status === 'fully_met')    return '<span class="badge-covered">Fully Met</span>';
    if (status === 'partially_met') return '<span style="background:#FFF3A3;color:#7a6500;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">Partial</span>';
    return '<span class="badge-uncovered">Unmet</span>';
  };

  const rows = coverage.roles.map((r, i) => `
    <tr class="dd-clickable" onclick="drillCoverage(${i})" title="Click for details">
      <td>${r.project || '—'}</td>
      <td>${r.skillSet || '—'}</td>
      <td>${r.level || '—'}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>
  `).join('');

  tableEl.innerHTML = `
    <table>
      <thead><tr>
        <th>Project</th><th>Skill</th><th>Level</th><th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Bench Report ──────────────────────────────────────────────────
function renderBenchReport(benchReport) {
  const el    = document.getElementById('benchContent');
  const badge = document.getElementById('benchBadge');

  if (!benchReport || !benchReport.length) {
    badge.textContent = 'No one on bench';
    badge.className   = 'chart-badge ok';
    el.innerHTML = `
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
  badge.textContent = `${totalBench} employee${totalBench !== 1 ? 's' : ''}`;
  badge.className   = 'chart-badge warn';

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
    openDrilldown('Open Demand — All Roles',
      '<p class="dd-empty">No demand data loaded yet.</p>');
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

  openDrilldown(`Open Demand — All Roles (${roles.length})`,
    summary + `
    <table class="dd-table">
      <thead><tr>
        <th>Project</th><th>Level</th><th>Skill Set</th><th>Dates</th><th>Hrs/Wk</th><th>Status</th><th>Best Match</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
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

// ── Boot ──────────────────────────────────────────────────────────
loadDashboard();
