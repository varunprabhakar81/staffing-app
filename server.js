require('dotenv').config();

const express              = require('express');
const cors                 = require('cors');
const path                 = require('path');
const { readStaffingData } = require('./excelReader');
const { askClaude }        = require('./claudeService');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Load staffing data at startup ───────────────────────────────────────────
let staffingData = null;
readStaffingData().then(data => {
  if (data.error) {
    console.warn('Warning: could not load Excel data —', data.error);
  } else {
    staffingData = data;
    console.log(`Data loaded: ${data.supply.length} supply rows, ${data.demand.length} demand rows`);
  }
});

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Helper: ensure data is loaded ──────────────────────────────────────────
function requireData(res) {
  if (!staffingData) {
    res.status(503).json({ error: 'Staffing data not available. Check that data/resourcing.xlsx exists.' });
    return false;
  }
  return true;
}

// ── Helper: compute per-employee average weekly hours ──────────────────────
function employeeWeeklyAverages(supply) {
  const empMap = {};
  for (const row of supply) {
    const name = row.employeeName;
    if (!empMap[name]) empMap[name] = { skillSet: row.skillSet, weekTotals: {} };
    for (const [week, hrs] of Object.entries(row.weeklyHours)) {
      empMap[name].weekTotals[week] = (empMap[name].weekTotals[week] || 0) + (hrs || 0);
    }
  }
  // Compute average across all weeks
  const result = [];
  for (const [name, info] of Object.entries(empMap)) {
    const totals = Object.values(info.weekTotals);
    const avg    = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    result.push({ name, skillSet: info.skillSet, avgHours: Math.round(avg * 10) / 10, weekTotals: info.weekTotals });
  }
  return result;
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Staffing app is running' });
});

// GET /api/supply
app.get('/api/supply', (req, res) => {
  if (!requireData(res)) return;
  res.json(staffingData.supply);
});

// GET /api/demand
app.get('/api/demand', (req, res) => {
  if (!requireData(res)) return;
  res.json(staffingData.demand);
});

// GET /api/employees
app.get('/api/employees', (req, res) => {
  if (!requireData(res)) return;
  res.json(staffingData.employees);
});

// GET /api/dashboard
app.get('/api/dashboard', async (req, res) => {
  // Always reload from Excel so edits to resourcing.xlsx are reflected immediately
  // without requiring a server restart.
  const freshData = await readStaffingData();
  if (freshData.error) {
    return res.status(503).json({ error: freshData.error });
  }
  staffingData = freshData; // keep in-memory cache current too

  const { supply, demand, employees } = staffingData;

  // ── a. Utilization by Level ──────────────────────────────────────────────
  // Join supply employee averages with Employee Master to get level
  const empAverages = employeeWeeklyAverages(supply);
  const levelMap    = {};
  for (const emp of employees) levelMap[emp.employeeName] = emp.level;

  const byLevel = {};
  for (const emp of empAverages) {
    const level = levelMap[emp.name] || 'Unknown';
    if (!byLevel[level]) byLevel[level] = { totalHours: 0, headcount: 0 };
    byLevel[level].totalHours += emp.avgHours;
    byLevel[level].headcount  += 1;
  }

  const levelOrder = ['Analyst', 'Consultant', 'Senior Consultant', 'Manager', 'Senior Manager', 'Partner/MD'];
  const utilizationByLevel = levelOrder
    .filter(l => byLevel[l])
    .map(level => {
      const { totalHours, headcount } = byLevel[level];
      const avgHours  = totalHours / headcount;
      const utilPct   = Math.round((avgHours / 45) * 100);
      return { level, avgHours: Math.round(avgHours * 10) / 10, utilizationPct: utilPct, headcount };
    });

  // ── b. Bench Report ──────────────────────────────────────────────────────
  // Use the current week: the first week-ending date on or after today.
  // The spreadsheet spans months into the future; using the last column
  // was wrong — it checked hours 3+ months out instead of this week.
  const weekKeys = supply.length ? Object.keys(supply[0].weeklyHours) : [];
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const thisYear = today.getFullYear();
  let currentWeek = weekKeys[0] || null;
  for (const wk of weekKeys) {
    const m = wk.match(/(\d+)\/(\d+)/);
    if (!m) continue;
    const wkDate = new Date(thisYear, parseInt(m[1]) - 1, parseInt(m[2]));
    if (wkDate >= today) { currentWeek = wk; break; }
  }
  const recentWeek = currentWeek;

  // Sum hours per employee for the current week
  const recentTotals = {};
  for (const row of supply) {
    const name = row.employeeName;
    recentTotals[name] = (recentTotals[name] || 0) + ((row.weeklyHours[recentWeek] || 0));
  }

  // Group bench/low employees by skill set
  const benchBySkill = {};
  for (const emp of empAverages) {
    const recentHrs = recentTotals[emp.name] || 0;
    if (recentHrs < 10) {
      const skill = emp.skillSet || 'Unknown';
      if (!benchBySkill[skill]) benchBySkill[skill] = [];
      benchBySkill[skill].push({ name: emp.name, recentWeekHours: recentHrs, avgHours: emp.avgHours });
    }
  }
  const benchReport = Object.entries(benchBySkill).map(([skillSet, emps]) => ({ skillSet, employees: emps }));

  // ── c. Cliffs ────────────────────────────────────────────────────────────
  // For each week: total available hours = sum of (45 - bookedHours) per employee, floored at 0
  const cliffs = weekKeys.map(week => {
    let totalBooked    = 0;
    let totalAvailable = 0;
    for (const emp of empAverages) {
      const booked    = emp.weekTotals[week] || 0;
      totalBooked    += booked;
      totalAvailable += Math.max(0, 45 - booked);
    }
    return { week, totalBookedHours: Math.round(totalBooked), totalAvailableHours: Math.round(totalAvailable) };
  });

  // ── d. Needs Coverage ────────────────────────────────────────────────────
  // For each demand row, flag whether a matching available employee exists
  const availableEmps = empAverages.filter(e => e.avgHours < 45);

  const needsCoverage = demand.map(role => {
    const match = availableEmps.find(e => e.skillSet === role.skillSet);
    return {
      projectName:   role.projectName,
      resourceLevel: role.resourceLevel,
      skillSet:      role.skillSet,
      startDate:     role.startDate,
      endDate:       role.endDate,
      covered:       !!match,
      matchedEmployee: match ? match.name : null,
    };
  });

  const coverageSummary = {
    total:    needsCoverage.length,
    covered:  needsCoverage.filter(r => r.covered).length,
    uncovered: needsCoverage.filter(r => !r.covered).length,
    roles:    needsCoverage,
  };

  res.json({ utilizationByLevel, benchReport, cliffs, needsCoverage: coverageSummary });
});

// GET /api/ask?question=...
app.get('/api/ask', async (req, res) => {
  if (!requireData(res)) return;
  const question = (req.query.question || '').trim();
  if (!question) {
    return res.status(400).json({ error: 'question query parameter is required' });
  }
  try {
    const answer = await askClaude(question, staffingData);
    res.json({ question, answer });
  } catch (err) {
    res.status(500).json({ error: `Claude API error: ${err.message}` });
  }
});

// Serve static files after API routes so they don't shadow API paths
app.use(express.static(path.join(__dirname, 'public')));

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Staffing app running on http://localhost:${PORT}`);
});
