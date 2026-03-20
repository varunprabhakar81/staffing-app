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
  // Use Level column from Supply to group employees by level
  // For each level per week: utilization% = (total hours) / (employee count × 45) × 100
  const empAverages = employeeWeeklyAverages(supply);

  const levelWeekData = {}; // { level: { employees: Set, weekTotals: { week: hours } } }
  for (const row of supply) {
    const level = row.level || 'Unknown';
    if (!levelWeekData[level]) levelWeekData[level] = { employees: new Set(), weekTotals: {} };
    levelWeekData[level].employees.add(row.employeeName);
    for (const [week, hrs] of Object.entries(row.weeklyHours)) {
      levelWeekData[level].weekTotals[week] = (levelWeekData[level].weekTotals[week] || 0) + (hrs || 0);
    }
  }

  const levelOrder = ['Analyst', 'Consultant', 'Senior Consultant', 'Manager', 'Senior Manager', 'Partner/MD'];
  const utilizationByLevel = levelOrder
    .filter(l => levelWeekData[l])
    .map(level => {
      const { employees, weekTotals } = levelWeekData[level];
      const headcount   = employees.size;
      const weeks       = Object.keys(weekTotals);
      const totalHours  = Object.values(weekTotals).reduce((a, b) => a + b, 0);
      const avgHours    = weeks.length ? Math.round((totalHours / (headcount * weeks.length)) * 10) / 10 : 0;
      const utilPct     = Math.round((avgHours / 45) * 100);
      return { level, avgHours, utilizationPct: utilPct, headcount };
    });

  // ── b. Bench Report ──────────────────────────────────────────────────────
  // Use the current week: the first week-ending date on or after today.
  const weekKeys = supply.length ? Object.keys(supply[0].weeklyHours) : [];
  const today    = new Date(); today.setHours(0, 0, 0, 0);

  // Helper: parse a week key like "Week ending 3/21" into a Date
  function parseWkLabel(wk) {
    const m = wk.match(/(\d+)\/(\d+)/);
    return m ? new Date(today.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2])) : null;
  }

  let currentWeek = weekKeys[0] || null;
  for (const wk of weekKeys) {
    const wkDate = parseWkLabel(wk);
    if (wkDate && wkDate >= today) { currentWeek = wk; break; }
  }
  const recentWeek = currentWeek;

  // Sum hours per employee for the current week (from supply rows)
  const recentTotals = {};
  for (const row of supply) {
    const name = row.employeeName;
    recentTotals[name] = (recentTotals[name] || 0) + ((row.weeklyHours[recentWeek] || 0));
  }

  // Build lookup maps for bench
  const empAverageMap = Object.fromEntries(empAverages.map(e => [e.name, e]));
  const empSkillMap   = {};
  for (const row of supply) {
    if (row.employeeName && !empSkillMap[row.employeeName]) empSkillMap[row.employeeName] = row.skillSet;
  }

  // Group bench employees by skill — iterate ALL employees from Employee Master so
  // people with no supply rows (0h this week) are also included
  const benchBySkill = {};
  for (const emp of employees) {
    const name = emp.employeeName;
    if (!name) continue;
    const recentHrs = recentTotals[name] || 0;
    if (recentHrs < 10) {
      const skill = empSkillMap[name] || 'Unknown';
      const avgHrs = empAverageMap[name] ? empAverageMap[name].avgHours : 0;
      if (!benchBySkill[skill]) benchBySkill[skill] = [];
      benchBySkill[skill].push({ name, recentWeekHours: recentHrs, avgHours: avgHrs });
    }
  }
  const benchReport = Object.entries(benchBySkill).map(([skillSet, emps]) => ({ skillSet, employees: emps }));

  // ── c. Cliffs ────────────────────────────────────────────────────────────
  // For each week: booked = sum of hours per employee; capacity = headcount × 45 (flat)
  const cliffHeadcount = empAverages.length;
  const cliffs = weekKeys.map(week => {
    let totalBooked    = 0;
    let totalAvailable = 0;
    for (const emp of empAverages) {
      const booked    = emp.weekTotals[week] || 0;
      totalBooked    += booked;
      totalAvailable += Math.max(0, 45 - booked);
    }
    return {
      week,
      totalBookedHours:    Math.round(totalBooked),
      totalAvailableHours: Math.round(totalAvailable),
      totalCapacityHours:  cliffHeadcount * 45,
    };
  });

  // ── d. Needs Coverage ────────────────────────────────────────────────────
  // For each demand role, match employees by level+skillSet and check weekly
  // availability against the demand's hoursPerWeek over its date range.

  // Build level map from Employee Master for candidate matching
  const levelMap = {};
  for (const emp of employees) levelMap[emp.employeeName] = emp.level;

  // Parse a "Week ending M/D" key into a Date
  function parseWeekKey(wk) {
    const m = wk.match(/(\d+)\/(\d+)/);
    return m ? new Date(today.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2])) : null;
  }

  // Parse a demand date string "MM/DD/YYYY" into a Date
  function parseDemandDate(str) {
    if (!str) return null;
    const parts = String(str).split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
  }

  // Pre-compute week dates once
  const weekDateMap = {};
  for (const wk of weekKeys) weekDateMap[wk] = parseWeekKey(wk);

  const needsCoverageRoles = demand.map(role => {
    const startDate    = parseDemandDate(role.startDate);
    const endDate      = parseDemandDate(role.endDate);
    const hoursNeeded  = Number(role.hoursPerWeek) || 40;

    // Weeks in the supply data that fall within the demand date range
    const demandWeeks = weekKeys.filter(wk => {
      const d = weekDateMap[wk];
      return d && startDate && endDate && d >= startDate && d <= endDate;
    });
    const totalWeeks = demandWeeks.length;

    // Candidates: employees whose level AND primary skillSet match the role
    const candidates = empAverages.filter(e =>
      levelMap[e.name] === role.resourceLevel && e.skillSet === role.skillSet
    );

    let bestMatch  = null;
    let roleStatus = 'unmet';

    for (const emp of candidates) {
      let coveredWeeks = 0;
      for (const wk of demandWeeks) {
        const booked    = emp.weekTotals[wk] || 0;
        const available = Math.max(0, 45 - booked);
        if (available >= hoursNeeded) coveredWeeks++;
      }

      const isFullMatch    = totalWeeks > 0 && coveredWeeks === totalWeeks;
      const isPartialMatch = coveredWeeks > 0 && coveredWeeks < totalWeeks;

      // Track best match (full > partial, then most covered weeks)
      if (
        !bestMatch ||
        (isFullMatch && roleStatus !== 'fully_met') ||
        (isPartialMatch && roleStatus === 'unmet' && coveredWeeks > (bestMatch.availableWeeks || 0))
      ) {
        bestMatch = { employeeName: emp.name, availableWeeks: coveredWeeks, totalWeeks };
      }

      if (isFullMatch)                                      roleStatus = 'fully_met';
      else if (isPartialMatch && roleStatus === 'unmet')    roleStatus = 'partially_met';
    }

    return {
      project:      role.projectName,
      level:        role.resourceLevel,
      skillSet:     role.skillSet,
      startDate:    role.startDate,
      endDate:      role.endDate,
      hoursPerWeek: hoursNeeded,
      status:       roleStatus,
      bestMatch:    bestMatch,
    };
  });

  const needsCoverage = {
    summary: {
      fully_met:    needsCoverageRoles.filter(r => r.status === 'fully_met').length,
      partially_met: needsCoverageRoles.filter(r => r.status === 'partially_met').length,
      unmet:        needsCoverageRoles.filter(r => r.status === 'unmet').length,
    },
    roles: needsCoverageRoles,
  };

  res.json({ utilizationByLevel, benchReport, cliffs, needsCoverage });
});

// GET /api/heatmap
app.get('/api/heatmap', async (req, res) => {
  const freshData = await readStaffingData();
  if (freshData.error) return res.status(503).json({ error: freshData.error });

  const { supply, employees } = freshData;

  // Build level map from Employee Master
  const levelMap = {};
  for (const emp of employees) levelMap[emp.employeeName] = emp.level;

  const weekKeys = supply.length ? Object.keys(supply[0].weeklyHours) : [];
  const today    = new Date(); today.setHours(0, 0, 0, 0);

  function parseWkLabel(wk) {
    const m = wk.match(/(\d+)\/(\d+)/);
    return m ? new Date(today.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2])) : null;
  }

  // Filter: from current week (first week-ending >= today) through June 27
  const endDate = new Date(today.getFullYear(), 5, 27);
  const displayWeeks = weekKeys.filter(wk => {
    const d = parseWkLabel(wk);
    return d && d >= today && d <= endDate;
  });

  // Fallback: show all weeks if none match
  const weeksToShow = displayWeeks.length ? displayWeeks : weekKeys;

  const weeks = weeksToShow.map(wk => {
    const m = wk.match(/(\d+)\/(\d+)/);
    return m ? `${parseInt(m[1])}/${parseInt(m[2])}` : wk;
  });

  // Build per-employee project hours by week
  const empData = {}; // { name: { weekKey: { project: hours } } }
  const empMeta = {}; // { name: { skillSet, level } }
  for (const row of supply) {
    const name = row.employeeName;
    if (!empData[name]) {
      empData[name] = {};
      empMeta[name] = { skillSet: row.skillSet || null, level: levelMap[name] || row.level || null };
    } else {
      // Subsequent rows: fill in any missing skillSet or level from supply rows
      if (!empMeta[name].skillSet && row.skillSet) empMeta[name].skillSet = row.skillSet;
      if (!empMeta[name].level && row.level) empMeta[name].level = row.level;
    }
    const project = row.projectAssigned || 'Unassigned';
    for (const [wk, hrs] of Object.entries(row.weeklyHours)) {
      if (!weeksToShow.includes(wk)) continue;
      if (!empData[name][wk]) empData[name][wk] = {};
      empData[name][wk][project] = (empData[name][wk][project] || 0) + (hrs || 0);
    }
  }

  const levelOrder = ['Partner/MD', 'Senior Manager', 'Manager', 'Senior Consultant', 'Consultant', 'Analyst'];

  const empList = Object.entries(empData).map(([name, weekMap]) => {
    const weeklyHours = weeksToShow.map(wk => {
      const projects = weekMap[wk] || {};
      return Object.values(projects).reduce((a, b) => a + b, 0);
    });
    const weeklyProjects = weeksToShow.map(wk => {
      const projects = weekMap[wk] || {};
      return Object.entries(projects)
        .filter(([, h]) => h > 0)
        .map(([project, hours]) => ({ project, hours }));
    });
    const meta = empMeta[name] || {};
    return { name, level: levelMap[name] || meta.level || 'Unknown', skillSet: meta.skillSet || null, weeklyHours, weeklyProjects };
  });

  empList.sort((a, b) => {
    const ai = levelOrder.indexOf(a.level); const bi = levelOrder.indexOf(b.level);
    const an = ai === -1 ? 99 : ai;         const bn = bi === -1 ? 99 : bi;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name);
  });

  res.json({ weeks, employees: empList });
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
