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

// ── Chart registry (so we can destroy + re-render on refresh) ─────
const charts = {};

// ── Status indicator ──────────────────────────────────────────────
function setStatus(type, msg) {
  const dot  = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  dot.className  = `status-dot ${type}`;
  text.textContent = msg;
}

// ── Load Dashboard ────────────────────────────────────────────────
async function loadDashboard() {
  setStatus('loading', 'Loading data…');
  try {
    const res  = await fetch('/api/dashboard');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

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

  const bgColors = barColors.map(c => c + '22');  // ~13% opacity

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
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            font: { family: 'Inter', size: 12 },
            color: '#64748b',
            boxWidth: 12,
            usePointStyle: true,
          },
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
              ];
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 130,
          ticks: {
            callback: v => `${v}%`,
            color: '#94a3b8',
            font: { family: 'Inter', size: 11 },
            stepSize: 20,
          },
          grid: { color: '#f1f5f9' },
          border: { display: false },
        },
        x: {
          ticks: {
            color: '#334155',
            font: { family: 'Inter', size: 12, weight: '500' },
          },
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

  // Compute week-over-week delta of availableHours → cliff indicator
  const available = cliffs.map(c => c.totalAvailableHours);
  const booked    = cliffs.map(c => c.totalBookedHours);

  const deltas = available.map((v, i) =>
    i === 0 ? 0 : Math.max(0, v - available[i - 1])
  );
  const CLIFF_THRESHOLD = 40;  // ~1 FTE rolling off
  const spikeWeeks = new Set(
    deltas.map((d, i) => (d >= CLIFF_THRESHOLD ? i : -1)).filter(i => i >= 0)
  );

  // Badge update
  const spikeCount = spikeWeeks.size;
  const badge = document.getElementById('cliffsBadge');
  badge.textContent = spikeCount > 0 ? `${spikeCount} spike week${spikeCount > 1 ? 's' : ''}` : 'No major spikes';
  badge.className = 'chart-badge ' + (spikeCount > 0 ? 'warn' : 'ok');

  // Format week labels — strip leading date noise if present
  const labels = cliffs.map(c => {
    const w = String(c.week);
    // If it looks like "2025-03-21" → "3/21"
    const match = w.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${parseInt(match[2])}/${parseInt(match[3])}`;
    return w;
  });

  // Point styling — highlight spike weeks in red
  const pointColors = cliffs.map((_, i) =>
    spikeWeeks.has(i) ? '#ef4444' : '#3b82f6'
  );
  const pointRadii = cliffs.map((_, i) =>
    spikeWeeks.has(i) ? 7 : 3
  );

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
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'end',
          labels: {
            font: { family: 'Inter', size: 12 },
            color: '#64748b',
            boxWidth: 12,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          padding: 12,
          callbacks: {
            afterBody: (ctx) => {
              const i = ctx[0].dataIndex;
              if (spikeWeeks.has(i)) return ['', '  ⚠ Cliff: Mass roll-off detected'];
              return [];
            },
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            color: '#94a3b8',
            font: { family: 'Inter', size: 11 },
            callback: v => `${v}h`,
          },
          grid: { color: '#f1f5f9' },
          border: { display: false },
        },
        x: {
          ticks: {
            color: '#64748b',
            font: { family: 'Inter', size: 11 },
            maxRotation: 45,
          },
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

  // Badge
  const badge = document.getElementById('coverageBadge');
  const pct   = total ? Math.round((covered / total) * 100) : 100;
  badge.textContent = total ? `${pct}% covered` : 'No open roles';
  badge.className   = 'chart-badge ' + (pct >= 80 ? 'ok' : pct >= 50 ? 'warn' : 'danger');

  // Doughnut
  charts.coverage = new Chart(document.getElementById('chartCoverage'), {
    type: 'doughnut',
    data: {
      labels: ['Covered', 'Uncovered'],
      datasets: [{
        data: [covered, uncovered || (total === 0 ? 1 : 0)],
        backgroundColor: total === 0
          ? ['#e2e8f0', '#e2e8f0']
          : ['#10b981', '#ef4444'],
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
          labels: {
            font: { family: 'Inter', size: 12 },
            color: '#64748b',
            padding: 12,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: '#0f172a',
          bodyColor: '#94a3b8',
          padding: 10,
        },
      },
    },
    plugins: [{
      // Center text plugin
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

  // Table
  const tableEl = document.getElementById('coverageTable');
  if (!coverage.roles || !coverage.roles.length) {
    tableEl.innerHTML = '<p style="font-size:13px;color:#94a3b8;padding:8px 0">No open demand roles</p>';
    return;
  }
  const rows = coverage.roles.map(r => `
    <tr>
      <td>${r.projectName || '—'}</td>
      <td>${r.skillSet || '—'}</td>
      <td>${r.resourceLevel || '—'}</td>
      <td><span class="${r.covered ? 'badge-covered' : 'badge-uncovered'}">${r.covered ? 'Covered' : 'Open'}</span></td>
    </tr>
  `).join('');

  tableEl.innerHTML = `
    <table>
      <thead><tr>
        <th>Project</th>
        <th>Skill</th>
        <th>Level</th>
        <th>Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// ── Bench Report ──────────────────────────────────────────────────
function renderBenchReport(benchReport) {
  const el = document.getElementById('benchContent');
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
      return `
        <div class="bench-employee">
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
  const input   = document.getElementById('askInput');
  const question = input.value.trim();
  if (!question) { input.focus(); return; }

  const btn     = document.getElementById('askSubmitBtn');
  const btnText = document.getElementById('askBtnText');
  const spinner = document.getElementById('askBtnSpinner');
  const resCard = document.getElementById('askResponseCard');
  const resBody = document.getElementById('askResponseBody');
  const errEl   = document.getElementById('askError');
  const errText = document.getElementById('askErrorText');

  // Loading state
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
