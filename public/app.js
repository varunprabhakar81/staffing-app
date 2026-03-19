/* ── Staffing Intelligence — Frontend App ──────────────────────── */

'use strict';

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
const rawData = { supply: [], employees: [], cliffs: [], coverageRoles: [] };

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

// ── Format week label ─────────────────────────────────────────────
function fmtWeek(wk) {
  const m = String(wk).match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${parseInt(m[2])}/${parseInt(m[3])}` : String(wk);
}

// ── Load Dashboard ────────────────────────────────────────────────
async function loadDashboard() {
  setStatus('loading', 'Loading data…');
  try {
    const [dashRes, supplyRes, empRes] = await Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/supply'),
      fetch('/api/employees'),
    ]);

    if (!dashRes.ok) throw new Error(`HTTP ${dashRes.status}`);
    const data = await dashRes.json();
    if (data.error) throw new Error(data.error);

    rawData.supply        = supplyRes.ok ? await supplyRes.json() : [];
    rawData.employees     = empRes.ok    ? await empRes.json()    : [];
    rawData.cliffs        = data.cliffs  || [];
    rawData.coverageRoles = (data.needsCoverage || {}).roles || [];

    setStatus('ok', 'Live data');
    document.getElementById('dataTimestamp').textContent =
      `Last updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    renderKPIs(data);
    renderUtilizationChart(data.utilizationByLevel);
    renderCliffsChart(data.cliffs);
    renderCoverageChart(data.needsCoverage);
    renderBenchReport(data.benchReport);

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
  const uncovered   = (data.needsCoverage || {}).uncovered || 0;

  document.getElementById('kpiHeadcount').textContent   = headcount || '—';
  document.getElementById('kpiUtilization').textContent = headcount ? `${avgUtil}%` : '—';
  document.getElementById('kpiBench').textContent       = benchCount;
  document.getElementById('kpiUncovered').textContent   = uncovered;

  const utilEl = document.getElementById('kpiUtilization');
  utilEl.className = 'kpi-value ' + (avgUtil > 95 ? 'danger' : avgUtil > 80 ? 'warn' : 'ok');

  const uncovEl = document.getElementById('kpiUncovered');
  uncovEl.className = 'kpi-value ' + (uncovered > 0 ? 'warn' : 'ok');
}

// ── Utilization by Level ──────────────────────────────────────────
function renderUtilizationChart(levels) {
  if (charts.utilization) charts.utilization.destroy();
  if (!levels || !levels.length) return;

  const barColors = levels.map(l => {
    if (l.utilizationPct >= 100) return '#ef4444';
    if (l.utilizationPct >= 85)  return '#f59e0b';
    if (l.utilizationPct >= 60)  return '#3b82f6';
    return '#10b981';
  });

  const bgColors = barColors.map(c => c + '22');

  charts.utilization = new Chart(document.getElementById('chartUtilization'), {
    type: 'bar',
    data: {
      labels: levels.map(l => l.level),
      datasets: [
        {
          type: 'bar',
          label: 'Utilization %',
          data: levels.map(l => l.utilizationPct),
          backgroundColor: bgColors,
          borderColor: barColors,
          borderWidth: 2,
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          type: 'line',
          label: 'Target (80%)',
          data: levels.map(() => 80),
          borderColor: '#10b981',
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick(evt, elements) {
        if (!elements.length) return;
        const el = elements.find(e => e.datasetIndex === 0);
        if (!el) return;
        drillUtilization(levels[el.index].level);
      },
      onHover(evt, elements) {
        const hit = elements.some(e => e.datasetIndex === 0);
        evt.native.target.style.cursor = hit ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { font: { family: 'Inter', size: 12 }, color: '#64748b', boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          padding: 12,
          callbacks: {
            title: ctx => ctx[0].label,
            label: ctx => {
              if (ctx.datasetIndex === 1) return '  Target: 80%';
              const l = levels[ctx.dataIndex];
              return [
                `  Utilization: ${l.utilizationPct}%`,
                `  Avg Hours: ${l.avgHours}h / 45h`,
                `  Headcount: ${l.headcount}`,
                '  Click to see employees',
              ];
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 130,
          ticks: { callback: v => `${v}%`, color: '#94a3b8', font: { family: 'Inter', size: 11 }, stepSize: 20 },
          grid: { color: '#f1f5f9' },
          border: { display: false },
        },
        x: {
          ticks: { color: '#334155', font: { family: 'Inter', size: 12, weight: '500' } },
          grid: { display: false },
          border: { display: false },
        },
      },
    },
  });
}

// ── Cliffs Visualization ──────────────────────────────────────────
function renderCliffsChart(cliffs) {
  if (charts.cliffs) charts.cliffs.destroy();
  if (!cliffs || !cliffs.length) return;

  const available = cliffs.map(c => c.totalAvailableHours);
  const booked    = cliffs.map(c => c.totalBookedHours);

  const deltas = available.map((v, i) => i === 0 ? 0 : Math.max(0, v - available[i - 1]));
  const CLIFF_THRESHOLD = 40;
  const spikeWeeks = new Set(
    deltas.map((d, i) => (d >= CLIFF_THRESHOLD ? i : -1)).filter(i => i >= 0)
  );

  const spikeCount = spikeWeeks.size;
  const badge = document.getElementById('cliffsBadge');
  badge.textContent = spikeCount > 0 ? `${spikeCount} spike week${spikeCount > 1 ? 's' : ''}` : 'No major spikes';
  badge.className = 'chart-badge ' + (spikeCount > 0 ? 'warn' : 'ok');

  const labels = cliffs.map(c => fmtWeek(c.week));

  const pointColors = cliffs.map((_, i) => spikeWeeks.has(i) ? '#ef4444' : '#3b82f6');
  const pointRadii  = cliffs.map((_, i) => spikeWeeks.has(i) ? 7 : 3);

  charts.cliffs = new Chart(document.getElementById('chartCliffs'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Available Hours',
          data: available,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,.08)',
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: pointRadii,
          pointHoverRadius: 8,
        },
        {
          label: 'Booked Hours',
          data: booked,
          borderColor: '#94a3b8',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 3],
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      onClick(evt, elements) {
        if (!elements.length) return;
        drillCliff(elements[0].index);
      },
      onHover(evt, elements) {
        evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: { font: { family: 'Inter', size: 12 }, color: '#64748b', boxWidth: 12, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          padding: 12,
          callbacks: {
            afterBody: (ctx) => {
              const i = ctx[0].dataIndex;
              const lines = ['  Click to see roll-offs'];
              if (spikeWeeks.has(i)) lines.unshift('  ⚠ Cliff: Mass roll-off detected');
              return lines;
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, callback: v => `${v}h` },
          grid: { color: '#f1f5f9' },
          border: { display: false },
        },
        x: {
          ticks: { color: '#64748b', font: { family: 'Inter', size: 11 }, maxRotation: 45 },
          grid: { display: false },
          border: { display: false },
        },
      },
    },
  });
}

// ── Needs Coverage ────────────────────────────────────────────────
function renderCoverageChart(coverage) {
  if (charts.coverage) charts.coverage.destroy();
  if (!coverage) return;

  const covered   = coverage.covered   || 0;
  const uncovered = coverage.uncovered || 0;
  const total     = coverage.total     || 0;

  const badge = document.getElementById('coverageBadge');
  const pct   = total ? Math.round((covered / total) * 100) : 100;
  badge.textContent = total ? `${pct}% covered` : 'No open roles';
  badge.className   = 'chart-badge ' + (pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'danger');

  charts.coverage = new Chart(document.getElementById('chartCoverage'), {
    type: 'doughnut',
    data: {
      labels: ['Covered', 'Uncovered'],
      datasets: [{
        data: [covered, uncovered || (total === 0 ? 1 : 0)],
        backgroundColor: total === 0 ? ['#e2e8f0', '#e2e8f0'] : ['#10b981', '#ef4444'],
        borderWidth: 0,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Inter', size: 12 }, color: '#64748b', padding: 12, usePointStyle: true },
        },
        tooltip: { backgroundColor: '#0f172a', bodyColor: '#94a3b8', padding: 10 },
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
        ctx.font = `700 24px Inter, sans-serif`;
        ctx.fillStyle = total === 0 ? '#94a3b8' : (pct >= 80 ? '#10b981' : '#ef4444');
        ctx.fillText(`${pct}%`, cx, cy);
        ctx.font = `400 11px Inter, sans-serif`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('covered', cx, cy + 22);
        ctx.restore();
      },
    }],
  });

  const tableEl = document.getElementById('coverageTable');
  if (!coverage.roles || !coverage.roles.length) {
    tableEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:8px 0">No open demand roles</p>';
    return;
  }

  const rows = coverage.roles.map((r, i) => `
    <tr class="dd-clickable" onclick="drillCoverage(${i})" title="Click to see matching employees">
      <td>${r.projectName || '—'}</td>
      <td>${r.skillSet || '—'}</td>
      <td>${r.resourceLevel || '—'}</td>
      <td><span class="${r.covered ? 'badge-covered' : 'badge-uncovered'}">${r.covered ? 'Covered' : 'Open'}</span></td>
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
      const safeName = (emp.name || '').replace(/'/g, "\\'");
      return `
        <div class="bench-employee dd-clickable" onclick="drillBench('${safeName}')" title="Click for booking detail">
          <div class="bench-avatar">${initials}</div>
          <div class="bench-emp-info">
            <div class="bench-emp-name">${emp.name}</div>
            <div class="bench-emp-sub">Avg ${emp.avgHours}h/wk</div>
          </div>
          <div class="bench-hours">
            <div class="bench-hours-value">${emp.recentWeekHours}h</div>
            <div class="bench-hours-label">this week</div>
            <div class="bench-bar-wrap">
              <div class="bench-bar-fill" style="width:${barPct}%"></div>
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

// ── Drilldown 4: Needs Coverage — Available Matches ───────────────
function drillCoverage(roleIdx) {
  const role = rawData.coverageRoles[roleIdx];
  if (!role) return;

  const levelMap   = {};
  for (const emp of rawData.employees) levelMap[emp.employeeName] = emp.level;

  const empAverages = buildEmpAverages();

  // Match on skill set OR level
  const matches = Object.entries(empAverages)
    .filter(([n, info]) =>
      info.skillSet === role.skillSet || levelMap[n] === role.resourceLevel)
    .map(([n, info]) => ({
      name:     n,
      avg:      info.avg,
      avail:    Math.round(Math.max(0, 45 - info.avg)),
      stat:     utilStatus(info.avg),
      skillSet: info.skillSet,
      level:    levelMap[n] || '—',
    }))
    .sort((a, b) => a.avg - b.avg);   // Most available first

  const roleCard = `
    <div class="dd-role-card">
      <div class="dd-role-row"><span>Project</span><b>${role.projectName || '—'}</b></div>
      <div class="dd-role-row"><span>Level Needed</span><b>${role.resourceLevel || '—'}</b></div>
      <div class="dd-role-row"><span>Skill Set</span><b>${role.skillSet || '—'}</b></div>
      <div class="dd-role-row"><span>Dates</span><b>${role.startDate || '—'} – ${role.endDate || '—'}</b></div>
    </div>`;

  if (!matches.length) {
    openDrilldown(
      `${role.resourceLevel || '—'} — ${role.skillSet || '—'} — Available Matches`,
      roleCard + '<p class="dd-empty">No matching employees found.</p>'
    );
    return;
  }

  const tableRows = matches.map((m, i) => `
    <tr ${i === 0 ? 'class="dd-best-match"' : ''}>
      <td>${m.name}${i === 0 ? ' <span class="dd-badge status-full" style="margin-left:6px">Best Match</span>' : ''}</td>
      <td>${m.level}</td>
      <td>${m.skillSet}</td>
      <td>${m.avg}h/wk</td>
      <td style="color:#A8E6CF;font-weight:600">${m.avail}h free</td>
      <td><span class="dd-badge ${m.stat.cls}">${m.stat.label}</span></td>
    </tr>`).join('');

  openDrilldown(
    `${role.resourceLevel || '—'} — ${role.skillSet || '—'} — Available Matches`,
    roleCard + `
      <h4 class="dd-section-title">Matching Employees (${matches.length})</h4>
      <table class="dd-table">
        <thead><tr>
          <th>Employee</th><th>Level</th><th>Skill Set</th>
          <th>Avg Hours</th><th>Availability</th><th>Status</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>`
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

  const levelMap   = {};
  for (const emp of rawData.employees) levelMap[emp.employeeName] = emp.level;
  const empAverages = buildEmpAverages();

  function bestMatch(role) {
    const candidates = Object.entries(empAverages)
      .filter(([, info]) => info.avg < 45)
      .map(([name, info]) => {
        const skillMatch = info.skillSet === role.skillSet;
        const lvlMatch   = levelMap[name] === role.resourceLevel;
        const type = (skillMatch && lvlMatch) ? 'full'
                   : (skillMatch || lvlMatch)  ? 'partial'
                   : 'none';
        return { name, avg: info.avg, type };
      })
      .filter(c => c.type !== 'none')
      .sort((a, b) => (a.type === 'full' ? 0 : 1) - (b.type === 'full' ? 0 : 1) || a.avg - b.avg);
    return candidates[0] || null;
  }

  const rows = roles.map(role => {
    const match = bestMatch(role);
    let matchCell, rowStyle = '';
    if (!match) {
      matchCell = '<span class="dd-badge status-bench">No Match</span>';
      rowStyle  = 'style="background:rgba(255,179,179,0.05)"';
    } else if (match.type === 'full') {
      matchCell = `<span class="dd-badge status-full">Full Match</span> <span style="font-size:12px;color:#8892B0">${match.name} (${match.avg}h)</span>`;
      rowStyle  = 'style="background:rgba(168,230,207,0.05)"';
    } else {
      matchCell = `<span class="dd-badge status-under">Partial Match</span> <span style="font-size:12px;color:#8892B0">${match.name} (${match.avg}h)</span>`;
    }
    return `<tr ${rowStyle}>
      <td style="font-size:12px">${role.projectName || '—'}</td>
      <td style="color:#8892B0;font-size:12px">${role.resourceLevel || '—'}</td>
      <td style="font-size:12px">${role.skillSet || '—'}</td>
      <td style="font-size:11px;color:#8892B0">${role.startDate || '—'} – ${role.endDate || '—'}</td>
      <td>${matchCell}</td>
    </tr>`;
  }).join('');

  const fullCount    = roles.filter(r => { const m = bestMatch(r); return m?.type === 'full'; }).length;
  const partialCount = roles.filter(r => { const m = bestMatch(r); return m?.type === 'partial'; }).length;
  const noneCount    = roles.filter(r => !bestMatch(r)).length;

  const summary = `
    <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
      <span class="dd-badge status-full">Full Match: ${fullCount}</span>
      <span class="dd-badge status-under">Partial Match: ${partialCount}</span>
      <span class="dd-badge status-bench">No Match: ${noneCount}</span>
    </div>`;

  openDrilldown(`Open Demand — All Roles (${roles.length})`,
    summary + `
    <table class="dd-table">
      <thead><tr>
        <th>Project</th><th>Level</th><th>Skill Set</th><th>Dates</th><th>Best Match</th>
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
