require('dotenv').config();

const express              = require('express');
const cors                 = require('cors');
const cookieParser         = require('cookie-parser');
const session              = require('express-session');
const path                 = require('path');
const { createClient }     = require('@supabase/supabase-js');
const { readStaffingData, upsertAssignment, deleteAssignments, resolveConsultantId, resolveProjectId, serviceClient } = require('./supabaseReader');
const { askClaude, getSuggestedQuestions, getMatchReasonings } = require('./claudeService');

// Anon client used only for auth operations (login). Data queries go through
// supabaseReader.js functions which receive the per-request userToken.
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const app  = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Required for Railway reverse proxy + secure cookies in prod

// ── Load staffing data at startup ───────────────────────────────────────────
// Use serviceClient (bypasses RLS) so data is available immediately on cold start.
let staffingData = null;
readStaffingData(null, serviceClient).then(data => {
  if (data.error) {
    console.warn('Warning: could not load staffing data —', data.error);
  } else {
    staffingData = data;
    console.log(`Data loaded: ${data.supply.length} supply rows, ${data.demand.length} demand rows`);
  }
});

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    maxAge:   8 * 60 * 60 * 1000, // 8 hours
  },
}));

// ── Helper: ensure data is loaded ──────────────────────────────────────────
function requireData(res) {
  if (!staffingData) {
    res.status(503).json({ error: 'Staffing data not available. Check database connection.' });
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

// ── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (!req.session || !req.session.token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function requireRole(...allowedRoles) {
  const roles = allowedRoles.flat();
  return (req, res, next) => {
    const userRole = req.session.role;
    if (!userRole || !roles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden: insufficient role' });
    }
    next();
  };
}

// ── Auth endpoints (exempt from requireAuth) ─────────────────────────────────

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
    req.session.token     = data.session.access_token;
    req.session.user      = data.user;
    req.session.tenant_id = data.user.app_metadata?.tenant_id;
    req.session.role      = data.user.app_metadata?.role;
    res.json({ user: data.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({
    user:         req.session.user,
    role:         req.session.role,
    tenant_id:    req.session.tenant_id,
    canViewRates: ['admin', 'finance'].includes(req.session.role),
  });
});

// Apply requireAuth to all /api/* routes defined after this point
app.use('/api', requireAuth);

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
app.get('/api/demand', requireRole('admin', 'resource_manager', 'project_manager', 'consultant', 'finance', 'recruiter'), (req, res) => {
  if (!requireData(res)) return;
  res.json(staffingData.demand);
});

// GET /api/employees
app.get('/api/employees', (req, res) => {
  if (!requireData(res)) return;
  res.json(staffingData.employees);
});

// GET /api/dashboard
app.get('/api/dashboard', requireRole('admin', 'resource_manager', 'project_manager', 'finance', 'consultant', 'recruiter'), async (req, res) => {
  const freshData = await readStaffingData(null, serviceClient);
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
    const hoursNeeded  = Number(role.hoursPerWeek) || 45;

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
app.get('/api/heatmap', requireRole('admin', 'resource_manager', 'project_manager', 'consultant', 'finance'), async (req, res) => {
  const freshData = await readStaffingData(null, serviceClient);
  if (freshData.error) return res.status(503).json({ error: freshData.error });

  // Consultant: scope supply to own row only
  let supply = freshData.supply;
  if (req.session.role === 'consultant') {
    const userName    = (req.session.user?.user_metadata?.name || '').toLowerCase();
    const emailPrefix = (req.session.user?.email || '').split('@')[0].toLowerCase();
    supply = supply.filter(row => {
      const n = (row.employeeName || '').toLowerCase();
      return (userName && n === userName) || n === emailPrefix;
    });
  }
  const { employees } = freshData;

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

// POST /api/suggested-questions
app.post('/api/suggested-questions', async (req, res) => {
  try {
    const freshData = await readStaffingData(null, serviceClient);
    if (freshData.error) return res.status(503).json({ error: freshData.error });
    staffingData = freshData;
    const questions = await getSuggestedQuestions(freshData);
    if (!questions) return res.status(500).json({ error: 'Could not generate suggestions' });
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// GET /api/manage — supply data grouped by employee for the Manage tab
app.get('/api/manage', requireRole('admin', 'resource_manager'), async (req, res) => {
  const freshData = await readStaffingData(null, serviceClient);
  if (freshData.error) return res.status(503).json({ error: freshData.error });
  staffingData = freshData;

  const { supply, projects, employees } = freshData;
  const { weekKeyToDate } = freshData._meta;
  const weekKeys = supply.length ? Object.keys(supply[0].weeklyHours) : [];

  function parseWkToDate(wk) {
    const iso = weekKeyToDate[wk];
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function wkToDisplayDate(wk) {
    const iso = weekKeyToDate[wk];
    if (!iso) return null;
    const [y, m, d] = iso.split('-');
    return `${String(parseInt(m)).padStart(2,'0')}/${String(parseInt(d)).padStart(2,'0')}/${y}`;
  }

  const levelOrder = ['Partner/MD', 'Senior Manager', 'Manager', 'Senior Consultant', 'Consultant', 'Analyst'];
  const empMap = {};

  supply.forEach((row, idx) => {
    const name = row.employeeName;
    if (!name) return;
    if (!empMap[name]) {
      empMap[name] = { name, level: row.level || 'Unknown', assignments: [] };
    }

    const nonZeroWeeks = weekKeys.filter(wk => (row.weeklyHours[wk] || 0) > 0);
    let startDate = null, endDate = null, hoursPerWeek = 0;
    if (nonZeroWeeks.length > 0) {
      startDate = wkToDisplayDate(nonZeroWeeks[0]);
      endDate   = wkToDisplayDate(nonZeroWeeks[nonZeroWeeks.length - 1]);
      const total = nonZeroWeeks.reduce((s, wk) => s + (row.weeklyHours[wk] || 0), 0);
      hoursPerWeek = Math.round(total / nonZeroWeeks.length);
    }

    empMap[name].assignments.push({
      rowIndex:    idx,   // 0-based index into supply array
      project:     row.projectAssigned || '',
      skillSet:    row.skillSet || '',
      startDate,
      endDate,
      hoursPerWeek,
    });
  });

  const empList = Object.values(empMap).sort((a, b) => {
    const ai = levelOrder.indexOf(a.level), bi = levelOrder.indexOf(b.level);
    const an = ai === -1 ? 99 : ai, bn = bi === -1 ? 99 : bi;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name);
  });

  const projectNames = [...new Set([
    ...projects.map(p => p.projectName).filter(Boolean),
    ...supply.map(s => s.projectAssigned).filter(Boolean),
  ])].sort();

  res.json({ employees: empList, projects: projectNames, weekKeys });
});

// POST /api/save-staffing — inline edit / quick-fill save for Staffing heatmap
app.post('/api/save-staffing', requireRole('admin', 'resource_manager'), async (req, res) => {
  const { changes } = req.body || {};
  if (!Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({ error: 'changes array is required' });
  }

  try {
    const freshData = await readStaffingData(req.session.token);
    if (freshData.error) return res.status(503).json({ error: freshData.error });

    const { supply } = freshData;
    const { weekKeyToDate } = freshData._meta;

    // Map "M/D" display label → "YYYY-MM-DD" week ending date (year from actual DB dates)
    function weekLabelToDate(label) {
      const wk = Object.keys(weekKeyToDate).find(k => {
        const m = k.match(/(\d+)\/(\d+)/);
        return m && `${parseInt(m[1])}/${parseInt(m[2])}` === label;
      });
      return wk ? weekKeyToDate[wk] : null;
    }

    for (const ch of changes) {
      const weekEnding = weekLabelToDate(ch.weekLabel);
      if (!weekEnding) continue;
      const hrs = Math.max(0, Math.min(100, Number(ch.hours) || 0));

      // Find supply row → get Supabase IDs
      const row = supply.find(r =>
        r.employeeName === ch.employeeName && r.projectAssigned === ch.project
      );
      let consultantId = row?._consultantId ?? null;
      let projectId    = row?._projectId    ?? null;

      if (!consultantId) consultantId = await resolveConsultantId(req.session.token, ch.employeeName);
      if (!projectId)    projectId    = await resolveProjectId(req.session.token, ch.project, true);
      if (!consultantId || !projectId) continue;

      await upsertAssignment(req.session.token, { consultantId, projectId, weekEnding, hours: hrs, isBillable: row?.isBillable ?? true });
    }

    staffingData = await readStaffingData(req.session.token);
    res.json({ success: true, updatedRows: changes.length });

  } catch (err) {
    console.error('[save-staffing]', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/supply/update — apply add/update/delete changes to supply via Supabase
app.post('/api/supply/update', requireRole('admin', 'resource_manager'), async (req, res) => {
  const { changes } = req.body || {};
  if (!Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({ error: 'changes array is required' });
  }

  try {
    // 1. Read current supply data fresh
    const freshData = await readStaffingData(req.session.token);
    if (freshData.error) return res.status(503).json({ error: freshData.error });

    const { supply } = freshData;
    const weekKeys = supply.length ? Object.keys(supply[0].weeklyHours) : [];
    const year = new Date().getFullYear();

    function parseDateStr(str) {
      if (!str) return null;
      const parts = String(str).split('/');
      if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      if (str.includes('-')) {
        const [y, mo, d] = str.split('-');
        return new Date(parseInt(y), parseInt(mo) - 1, parseInt(d));
      }
      return null;
    }

    function parseWkDate(wk) {
      const m = wk.match(/(\d+)\/(\d+)/);
      return m ? new Date(year, parseInt(m[1]) - 1, parseInt(m[2])) : null;
    }

    function weekKeyToDate(wk) {
      const m = wk.match(/(\d+)\/(\d+)/);
      if (!m) return null;
      return `${year}-${String(parseInt(m[1])).padStart(2, '0')}-${String(parseInt(m[2])).padStart(2, '0')}`;
    }

    // 2. Apply changes via Supabase write operations
    for (const ch of changes) {
      const row = supply.find(r =>
        r.employeeName === ch.employeeName && r.projectAssigned === ch.project
      );
      const consultantId = row?._consultantId ?? await resolveConsultantId(req.session.token, ch.employeeName);
      if (!consultantId) {
        console.warn(`[supply/update] consultant not found: ${ch.employeeName}`);
        continue;
      }

      if (ch.type === 'delete') {
        const projectId = row?._projectId ?? await resolveProjectId(req.session.token, ch.project);
        if (projectId) await deleteAssignments(req.session.token, { consultantId, projectId });

      } else if (ch.type === 'update') {
        const projectId = row?._projectId ?? await resolveProjectId(req.session.token, ch.project);
        if (!projectId) continue;

        if (ch.startDate !== undefined && ch.endDate !== undefined && ch.hoursPerWeek !== undefined) {
          const start = parseDateStr(ch.startDate);
          const end   = parseDateStr(ch.endDate);
          const hrs   = Number(ch.hoursPerWeek);
          if (start && end) {
            for (const wk of weekKeys) {
              const wkDate = parseWkDate(wk);
              if (wkDate && wkDate >= start && wkDate <= end) {
                const weekEnding = weekKeyToDate(wk);
                if (weekEnding) await upsertAssignment(req.session.token, { consultantId, projectId, weekEnding, hours: hrs });
              }
            }
          }
        }

      } else if (ch.type === 'add') {
        const projectId = await resolveProjectId(req.session.token, ch.project, true);
        if (!projectId) continue;

        const start = parseDateStr(ch.startDate);
        const end   = parseDateStr(ch.endDate);
        const hrs   = Number(ch.hoursPerWeek) || 0;
        for (const wk of weekKeys) {
          const wkDate = parseWkDate(wk);
          if (start && end && wkDate && wkDate >= start && wkDate <= end) {
            const weekEnding = weekKeyToDate(wk);
            if (weekEnding) await upsertAssignment(req.session.token, { consultantId, projectId, weekEnding, hours: hrs });
          }
        }
      }
    }

    // 3. Reload cached data
    staffingData = await readStaffingData(req.session.token);

    res.json({ success: true, updatedRows: changes.length });

  } catch (err) {
    console.error('[supply/update]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/recommendations — AI-matched consultants for each open need
app.get('/api/recommendations', requireRole('admin', 'resource_manager', 'project_manager', 'consultant', 'finance', 'recruiter'), async (req, res) => {
  const freshData = await readStaffingData(null, serviceClient);
  if (freshData.error) return res.status(503).json({ error: freshData.error });
  staffingData = freshData;

  const { supply, demand, employees } = freshData;
  const { weekKeyToDate } = freshData._meta;
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const weekKeys = supply.length ? Object.keys(supply[0].weeklyHours) : [];

  function parseWeekKey(wk) {
    const iso = weekKeyToDate[wk];
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function parseDemandDate(str) {
    if (!str) return null;
    const parts = String(str).split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
  }

  // Build level map from Employee Master
  const levelMap = {};
  for (const emp of employees) levelMap[emp.employeeName] = emp.level;

  // Build per-employee weekly hour totals
  const empWeekMap = {};
  for (const row of supply) {
    const name = row.employeeName;
    if (!empWeekMap[name]) {
      empWeekMap[name] = { skillSet: row.skillSet || '', level: levelMap[name] || row.level || '', weekTotals: {} };
    }
    for (const [wk, hrs] of Object.entries(row.weeklyHours)) {
      empWeekMap[name].weekTotals[wk] = (empWeekMap[name].weekTotals[wk] || 0) + (hrs || 0);
    }
  }

  // Pre-compute week dates
  const weekDateMap = {};
  for (const wk of weekKeys) weekDateMap[wk] = parseWeekKey(wk);

  const needsWithMatches = [];

  for (const need of demand) {
    const startDate   = parseDemandDate(need.startDate);
    const endDate     = parseDemandDate(need.endDate);
    const hoursNeeded = Number(need.hoursPerWeek) || 45;

    // Weeks in the supply data that fall within the need's date range
    const demandWeeks = weekKeys.filter(wk => {
      const d = weekDateMap[wk];
      return d && startDate && endDate && d >= startDate && d <= endDate;
    });

    if (!demandWeeks.length) {
      needsWithMatches.push({ need, matches: [] });
      continue;
    }

    const matches = [];
    for (const [name, info] of Object.entries(empWeekMap)) {
      if (info.level !== need.resourceLevel) continue;
      if (info.skillSet !== need.skillSet) continue;

      // Consultant qualifies only if they have capacity every week in the range
      let qualifies  = true;
      let totalHours = 0;
      for (const wk of demandWeeks) {
        const booked = info.weekTotals[wk] || 0;
        if (booked > 45 - hoursNeeded) { qualifies = false; break; }
        totalHours += booked;
      }
      if (!qualifies) continue;

      const avgBooked          = totalHours / demandWeeks.length;
      const availableHours     = Math.round((45 - avgBooked) * 10) / 10;
      const currentUtilization = Math.round((avgBooked / 45) * 100);
      const weeklyBreakdown    = demandWeeks.map(wk => ({
        week: wk,
        bookedHours:    info.weekTotals[wk] || 0,
        availableHours: Math.max(0, 45 - (info.weekTotals[wk] || 0)),
      }));

      matches.push({ employeeName: name, level: info.level, skillSet: info.skillSet,
                     availableHours, currentUtilization, weeklyBreakdown });
    }

    // Sort by highest available hours first
    matches.sort((a, b) => b.availableHours - a.availableHours);

    const topMatches = matches.slice(0, 5);
    let matchesWithReasoning = topMatches;

    if (topMatches.length > 0) {
      try {
        const reasonings = await getMatchReasonings(need, topMatches);
        matchesWithReasoning = topMatches.map((m, i) => ({
          ...m, reasoning: reasonings[i] || 'Strong skill set and availability match.',
        }));
      } catch (err) {
        console.warn('[recommendations] reasoning failed:', err.message);
        matchesWithReasoning = topMatches.map(m => ({
          ...m, reasoning: 'Available capacity meets requirement.',
        }));
      }
    }

    needsWithMatches.push({ need, matches: matchesWithReasoning });
  }

  res.json({ needs: needsWithMatches });
});

// ── SSE clients registry ─────────────────────────────────────────────────────
const sseClients = new Set();

function broadcastSSE(payload) {
  const msg = `event: data-updated\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch (_) { sseClients.delete(res); }
  }
}

// ── Admin: User Management ────────────────────────────────────────────────────

const VALID_ROLES = ['admin', 'resource_manager', 'project_manager', 'executive', 'consultant', 'finance', 'recruiter'];

// GET /api/admin/users — list all users in the caller's tenant
app.get('/api/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { data, error } = await serviceClient.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });

    const tenantId = req.session.tenant_id;
    const users = data.users
      .filter(u => u.app_metadata?.tenant_id === tenantId)
      .map(u => ({
        id:             u.id,
        email:          u.email,
        name:           u.user_metadata?.name || u.email.split('@')[0],
        role:           u.app_metadata?.role   || null,
        status:         u.banned_until ? 'deactivated' : (!u.last_sign_in_at ? 'invited' : 'active'),
        last_sign_in_at: u.last_sign_in_at,
        created_at:     u.created_at,
      }));

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/invite — create or invite a new user
app.post('/api/admin/users/invite', requireAuth, requireRole('admin'), async (req, res) => {
  const { email, role, name, deliveryMethod, tempPassword } = req.body || {};
  if (!email || !role || !deliveryMethod) {
    return res.status(400).json({ error: 'email, role, and deliveryMethod are required' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  try {
    let createData, createError;

    if (deliveryMethod === 'invite') {
      ({ data: createData, error: createError } =
        await serviceClient.auth.admin.inviteUserByEmail(email, { data: { name } }));
    } else if (deliveryMethod === 'password') {
      if (!tempPassword) return res.status(400).json({ error: 'tempPassword is required for password delivery' });
      const pwRe = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/;
      if (!pwRe.test(tempPassword)) {
        return res.status(400).json({ error: 'Password does not meet complexity requirements' });
      }
      ({ data: createData, error: createError } =
        await serviceClient.auth.admin.createUser({
          email,
          password:      tempPassword,
          email_confirm: true,
          user_metadata: { name },
        }));
    } else {
      return res.status(400).json({ error: "deliveryMethod must be 'invite' or 'password'" });
    }

    if (createError) return res.status(400).json({ error: createError.message });

    const userId = createData.user.id;
    const { data: updatedData, error: updateError } =
      await serviceClient.auth.admin.updateUserById(userId, {
        app_metadata: { role, tenant_id: req.session.tenant_id },
      });
    if (updateError) return res.status(500).json({ error: updateError.message });

    res.status(201).json(updatedData.user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/role — update a user's role
app.patch('/api/admin/users/:id/role', requireAuth, requireRole('admin'), async (req, res) => {
  const { role } = req.body || {};
  if (!role || !VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  try {
    const { data, error } = await serviceClient.auth.admin.updateUserById(req.params.id, {
      app_metadata: { role },
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data.user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/deactivate — ban a user (effectively permanent)
app.patch('/api/admin/users/:id/deactivate', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { error } = await serviceClient.auth.admin.updateUserById(req.params.id, {
      ban_duration: '87600h',
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/reactivate — lift ban on a user
app.patch('/api/admin/users/:id/reactivate', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { error } = await serviceClient.auth.admin.updateUserById(req.params.id, {
      ban_duration: 'none',
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:id/resend-invite — resend invite email to a pending user
app.post('/api/admin/users/:id/resend-invite', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { data: userData, error: fetchErr } = await serviceClient.auth.admin.getUserById(req.params.id);
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!userData?.user) return res.status(404).json({ error: 'User not found' });

    const user = userData.user;
    if (user.last_sign_in_at) {
      return res.status(400).json({ error: 'User has already logged in — cannot resend invite' });
    }

    const { error } = await serviceClient.auth.admin.inviteUserByEmail(user.email, {
      data: user.user_metadata || {},
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/users/:id/invite — cancel invite by deleting the unconfirmed user
app.delete('/api/admin/users/:id/invite', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { data: userData, error: fetchErr } = await serviceClient.auth.admin.getUserById(req.params.id);
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!userData?.user) return res.status(404).json({ error: 'User not found' });

    if (userData.user.last_sign_in_at) {
      return res.status(400).json({ error: 'Cannot cancel invite — user has already logged in' });
    }

    const { error } = await serviceClient.auth.admin.deleteUser(req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/events — Server-Sent Events endpoint
app.get('/api/events', (req, res) => {
  console.log('SSE client connected');
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// Serve static files after API routes so they don't shadow API paths
app.use(express.static(path.join(__dirname, 'public')));

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Staffing app running on http://localhost:${PORT}`);
});
