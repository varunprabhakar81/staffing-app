require('dotenv').config();

const crypto               = require('crypto');
const express              = require('express');
const cors                 = require('cors');
const cookieParser         = require('cookie-parser');
const session              = require('express-session');
const path                 = require('path');
const { createClient }     = require('@supabase/supabase-js');
const { readStaffingData, upsertAssignment, deleteAssignments, resolveConsultantId, resolveProjectId, serviceClient, createProject, createNeed, closeNeed, updateNeed, replaceNeedSkillSets } = require('./supabaseReader');
const { askClaude, getSuggestedQuestions, getMatchReasonings } = require('./claudeService');
const { seedTenant } = require('./seed-synthetic-data');

// Anon client used only for auth operations (login). Data queries go through
// supabaseReader.js functions which receive the per-request userToken.
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const app  = express();
const PORT = process.env.PORT || 3000;

// Secondary index: userId → Set<sessionId>
// Maintained on login/logout so we can target and destroy a specific user's sessions
// without scanning the entire MemoryStore.
const userSessionMap = new Map();

// Helper: resolve the calling user's tenant ID from session, fall back to env TENANT_ID.
const tId = req => req.session?.tenant_id || process.env.TENANT_ID;

app.set('trust proxy', 1); // Required for Railway reverse proxy + secure cookies in prod

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
    if (!data.user.email_confirmed_at) {
      return res.status(401).json({ error: 'Email not verified. Please check your inbox for the verification link.' });
    }
    req.session.token      = data.session.access_token;
    req.session.user       = data.user;
    req.session.tenant_id  = data.user.app_metadata?.tenant_id;
    req.session.role       = data.user.app_metadata?.role;
    req.session.testing_role = data.user.app_metadata?.testing_role || null;
    const uid = data.user.id;
    if (!userSessionMap.has(uid)) userSessionMap.set(uid, new Set());
    userSessionMap.get(uid).add(req.session.id);
    res.json({ user: data.user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  const uid = req.session.user?.id;
  if (uid && userSessionMap.has(uid)) {
    userSessionMap.get(uid).delete(req.session.id);
    if (userSessionMap.get(uid).size === 0) userSessionMap.delete(uid);
  }
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/auth/me
app.get('/api/auth/me', async (req, res) => {
  if (!req.session || !req.session.token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const displayName = req.session.user?.user_metadata?.display_name
    || req.session.user?.email?.split('@')[0]
    || null;

  let tenantName = null;
  const tid = req.session.tenant_id;
  if (tid) {
    const { data } = await serviceClient.from('tenants').select('name').eq('id', tid).single();
    tenantName = data?.name || null;
  }

  res.json({
    user:          req.session.user,
    role:          req.session.role,
    tenant_id:     tid,
    canViewRates:  ['admin', 'resource_manager'].includes(req.session.role),
    display_name:  displayName,
    tenant_name:   tenantName,
    testing_role:  req.session.testing_role || null,
  });
});

// POST /api/auth/forgot-password — send password reset email (no auth required)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const redirectTo = `${process.env.RAILWAY_URL || 'http://localhost:3000'}/set-password.html`;

  try {
    await supabaseAuth.auth.resetPasswordForEmail(email, { redirectTo });
  } catch (err) {
    console.error('forgot-password unexpected error:', err);
  }
  // Always return success to avoid email enumeration
  res.json({ ok: true });
});

// POST /api/auth/reset-password — apply new password using recovery token (no auth required)
app.post('/api/auth/reset-password', async (req, res) => {
  const { access_token, new_password } = req.body || {};
  if (!access_token || !new_password) {
    return res.status(400).json({ error: 'access_token and new_password are required.' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(access_token);
    if (userError || !user) {
      return res.status(401).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(user.id, { password: new_password });
    if (updateError) {
      return res.status(500).json({ error: 'Failed to update password. Please try again.' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});

// POST /api/auth/validate-invite — validate our own invite token (no auth required)
app.post('/api/auth/validate-invite', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.json({ valid: false, reason: 'No token provided' });

  try {
    const { data: { users } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
    const user = users.find(u => u.app_metadata?.invite_token === token);

    if (!user) return res.json({ valid: false, reason: 'Invalid invite link' });

    const expires = new Date(user.app_metadata.invite_expires);
    if (Date.now() > expires.getTime()) {
      return res.json({ valid: false, reason: 'This invite link has expired. Please contact your admin for a new one.' });
    }

    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('name')
      .eq('id', user.app_metadata.tenant_id)
      .single();

    res.json({
      valid: true,
      email: user.email,
      tenantName: tenant?.name || 'your organization',
      role: user.app_metadata.role
    });
  } catch (err) {
    console.error('validate-invite error:', err);
    res.status(500).json({ valid: false, reason: 'An unexpected error occurred.' });
  }
});

// POST /api/auth/set-password — set password using our own invite token (no auth required)
app.post('/api/auth/set-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  try {
    const { data: { users } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
    const user = users.find(u => u.app_metadata?.invite_token === token);

    if (!user) {
      return res.status(400).json({ error: 'Invalid invite link. Please contact your admin for a new one.' });
    }

    const expires = new Date(user.app_metadata.invite_expires);
    if (Date.now() > expires.getTime()) {
      return res.status(400).json({ error: 'This invite link has expired. Please contact your admin for a new one.' });
    }

    // Clear invite token (single-use) and set password
    const newMetadata = { ...user.app_metadata };
    delete newMetadata.invite_token;
    delete newMetadata.invite_expires;

    const { error } = await serviceClient.auth.admin.updateUserById(user.id, {
      password,
      app_metadata: newMetadata
    });

    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true });
  } catch (err) {
    console.error('set-password error:', err);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both fields are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  const email  = req.session.user?.email;
  const userId = req.session.user?.id;
  if (!email || !userId) {
    return res.status(401).json({ error: 'Session invalid. Please log in again.' });
  }
  try {
    const { error: signInError } = await supabaseAuth.auth.signInWithPassword({ email, password: currentPassword });
    if (signInError) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(userId, { password: newPassword });
    if (updateError) return res.status(500).json({ error: updateError.message });
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('change-password error:', err);
    res.status(500).json({ error: 'An unexpected error occurred.' });
  }
});

// Apply requireAuth to all /api/* routes defined after this point
app.use('/api', requireAuth);

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Staffing app is running' });
});

// GET /api/supply
app.get('/api/supply', requireRole('admin', 'resource_manager', 'project_manager'), async (req, res) => {
  const freshData = await readStaffingData(null, serviceClient, tId(req));
  if (freshData.error) return res.status(503).json({ error: freshData.error });
  res.json(freshData.supply);
});


// GET /api/employees
app.get('/api/employees', requireRole('admin', 'resource_manager', 'project_manager'), async (req, res) => {
  const freshData = await readStaffingData(null, serviceClient, tId(req));
  if (freshData.error) return res.status(503).json({ error: freshData.error });
  res.json(freshData.employees);
});

// GET /api/dashboard
app.get('/api/dashboard', requireRole('admin', 'resource_manager', 'project_manager', 'executive'), async (req, res) => {
  const freshData = await readStaffingData(null, serviceClient, tId(req));
  if (freshData.error) {
    return res.status(503).json({ error: freshData.error });
  }

  const { supply, demand, employees } = freshData;

  // ── Shared helpers (used across all sections) ────────────────────────────
  const weekKeys = supply.length ? Object.keys(supply[0].weeklyHours) : [];
  const today    = new Date(); today.setHours(0, 0, 0, 0);

  // Parse "Week ending M/D" → Date
  function parseWkLabel(wk) {
    const m = wk.match(/(\d+)\/(\d+)/);
    return m ? new Date(today.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2])) : null;
  }

  // Rolling 12-week window: current week + next 11 (forward-looking only)
  const windowWeeks = weekKeys.filter(wk => {
    const d = parseWkLabel(wk);
    return d && d >= today;
  }).slice(0, 12);

  // Current week for bench report
  let currentWeek = weekKeys[0] || null;
  for (const wk of weekKeys) {
    const wkDate = parseWkLabel(wk);
    if (wkDate && wkDate >= today) { currentWeek = wk; break; }
  }
  const recentWeek = currentWeek;

  // ── a. Utilization by Level ──────────────────────────────────────────────
  // Hours-based over rolling 12-week window: sum(booked hours) ÷ (45 × headcount × 12)
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
      const { employees: lvlEmps, weekTotals } = levelWeekData[level];
      const headcount   = lvlEmps.size;
      const windowHours = windowWeeks.reduce((sum, wk) => sum + (weekTotals[wk] || 0), 0);
      const windowCount = windowWeeks.length;
      const avgHours    = windowCount > 0 && headcount > 0
        ? Math.round((windowHours / (headcount * windowCount)) * 10) / 10
        : 0;
      const utilPct     = Math.round((avgHours / 45) * 100);
      return { level, avgHours, utilizationPct: utilPct, headcount };
    });

  // ── Overall utilization KPI ───────────────────────────────────────────────
  // True hours-based: total booked hours (all assignments) in 12-week window
  //   ÷ (45h × active consultant count × 12 weeks) × 100
  const activeCount = employees.length;
  let windowTotalHours = 0;
  for (const row of supply) {
    for (const wk of windowWeeks) {
      windowTotalHours += row.weeklyHours[wk] || 0;
    }
  }
  const windowCapacity       = 45 * activeCount * (windowWeeks.length || 12);
  const overallUtilizationPct = windowCapacity > 0
    ? Math.round((windowTotalHours / windowCapacity) * 1000) / 10   // 1 decimal
    : 0;

  // ── b. Bench Report ──────────────────────────────────────────────────────
  // Use the current week (recentWeek defined above).

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

  // ── d. Open Needs ────────────────────────────────────────────────────────
  // Needs are simply open (closed_at IS NULL already filtered in readStaffingData).
  // No coverage status computation — urgency is derived client-side from startDate.
  const openRoles = demand.map(role => ({
    _needId:      role._needId,
    project:      role.projectName,
    client:       role.clientName,
    level:        role.resourceLevel,
    skillSet:     role.skillSet,
    allSkillSets: role.allSkillSets || [],
    startDate:    role.startDate,
    endDate:      role.endDate,
    hoursPerWeek: Number(role.hoursPerWeek) || 45,
  }));

  const openNeeds = { openNeeds: openRoles.length, roles: openRoles };

  const projectClientMap = {};
  for (const [name, proj] of Object.entries(freshData._meta.projectByName || {})) {
    if (proj.clientName) projectClientMap[name] = proj.clientName;
  }

  res.json({ utilizationByLevel, overallUtilizationPct, windowTotalHours, windowCapacity, benchReport, cliffs, openNeeds, _meta: { weekKeyToDate: freshData._meta.weekKeyToDate, skillSets: Object.values(freshData._meta.skillSetById), projectClientMap } });
});

// GET /api/heatmap
app.get('/api/heatmap', requireRole('admin', 'resource_manager', 'project_manager', 'executive', 'consultant'), async (req, res) => {
  const freshData = await readStaffingData(null, serviceClient, tId(req));
  if (freshData.error) return res.status(503).json({ error: freshData.error });

  // Consultant: scope supply to own row only (linked via user_id)
  let supply = freshData.supply;
  let consultantLinked = true;
  if (req.session.role === 'consultant') {
    const authUserId = req.session.user?.id;
    let linkedName = null;
    if (authUserId) {
      const { data: linkedRow } = await serviceClient
        .from('consultants')
        .select('name')
        .eq('user_id', authUserId)
        .maybeSingle();
      if (linkedRow) linkedName = linkedRow.name;
    }
    if (!linkedName) {
      consultantLinked = false;
      supply = [];
    } else {
      supply = supply.filter(row => row.employeeName === linkedName);
    }
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

  // Filter: from current week (first week-ending >= today) through a rolling ~13-week window (90 days)
  // Week endings are always Saturday (Deloitte Sun–Sat fiscal weeks)
  const rawEnd = new Date(today); rawEnd.setDate(rawEnd.getDate() + 90);
  const dayOfWeek = rawEnd.getDay(); // 0=Sun … 6=Sat
  const daysToSat = dayOfWeek === 6 ? 0 : 6 - dayOfWeek;
  const endDate = new Date(rawEnd); endDate.setDate(endDate.getDate() + daysToSat);
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
    const consultantId = freshData._meta.consultantByName[name]?.id || null;
    return { id: consultantId, name, level: levelMap[name] || meta.level || 'Unknown', skillSet: meta.skillSet || null, weeklyHours, weeklyProjects };
  });

  empList.sort((a, b) => {
    const ai = levelOrder.indexOf(a.level); const bi = levelOrder.indexOf(b.level);
    const an = ai === -1 ? 99 : ai;         const bn = bi === -1 ? 99 : bi;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name);
  });

  res.json({ weeks, employees: empList, consultantLinked });
});

// POST /api/suggested-questions
app.post('/api/suggested-questions', requireRole('admin', 'resource_manager', 'project_manager', 'executive'), async (req, res) => {
  try {
    const freshData = await readStaffingData(null, serviceClient, tId(req));
    if (freshData.error) return res.status(503).json({ error: freshData.error });
    const questions = await getSuggestedQuestions(freshData);
    if (!questions) return res.status(500).json({ error: 'Could not generate suggestions' });
    res.json({ questions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ask?question=...
app.get('/api/ask', requireRole('admin', 'resource_manager', 'project_manager', 'executive'), async (req, res) => {
  const question = (req.query.question || '').trim();
  if (!question) {
    return res.status(400).json({ error: 'question query parameter is required' });
  }
  try {
    const freshData = await readStaffingData(null, serviceClient, tId(req));
    if (freshData.error) return res.status(503).json({ error: freshData.error });
    const answer = await askClaude(question, freshData);
    res.json({ question, answer });
  } catch (err) {
    res.status(500).json({ error: `Claude API error: ${err.message}` });
  }
});



// POST /api/save-staffing — inline edit / quick-fill save for Staffing heatmap
app.post('/api/save-staffing', requireRole('admin', 'resource_manager'), async (req, res) => {
  const { changes } = req.body || {};
  if (!Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({ error: 'changes array is required' });
  }
  try {
    let freshData;
    try {
      freshData = await readStaffingData(null, serviceClient, tId(req));
    } catch (err) {
      return res.status(500).json({ error: 'readStaffingData failed: ' + err.message });
    }
    if (freshData.error) return res.status(503).json({ error: freshData.error });

    const { supply } = freshData;
    const { weekKeyToDate, projectByName, consultantByName } = freshData._meta;

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

      // Fall back to _meta lookups (serviceClient-loaded, bypasses RLS) — never use anonClient here
      if (!consultantId) consultantId = consultantByName[ch.employeeName]?.id ?? null;
      if (!projectId)    projectId    = projectByName[ch.project]?.id ?? null;
      if (!consultantId || !projectId) continue;

      // isBillable: prefer explicit value from request → existing assignment row → consultant default → true
      let isBillable = ch.isBillable !== undefined ? ch.isBillable : row?.isBillable;
      if (isBillable === undefined || isBillable === null) {
        const { data: empRow } = await serviceClient
          .from('consultants')
          .select('is_billable')
          .eq('id', consultantId)
          .single();
        isBillable = empRow?.is_billable ?? true;
      }
      await upsertAssignment(req.session.token, { consultantId, projectId, weekEnding, hours: hrs, isBillable, tenantId: tId(req) }, serviceClient);
    }

    await readStaffingData(null, serviceClient, tId(req)); // refresh (no cache needed)
    res.json({ success: true, updatedRows: changes.length });

  } catch (err) {
    console.error('[save-staffing]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects — projects list; optional ?status=Verbal+Commit,Sold to filter by status
app.get('/api/projects', requireRole('admin', 'resource_manager', 'project_manager'), async (req, res) => {
  const freshData = await readStaffingData(null, serviceClient, tId(req));
  if (freshData.error || !freshData.projects) return res.json([]);
  const statusFilter = req.query.status
    ? req.query.status.split(',').map(s => s.trim())
    : null;
  const results = freshData.projects
    .filter(p => statusFilter ? statusFilter.includes(p.status) : (p.status === 'Verbal Commit' || p.status === 'Sold'))
    .map(p => {
      const meta = freshData._meta?.projectById?.[p.projectId] || {};
      return { id: p.projectId, name: p.projectName, status: p.status, clientName: p.clientName, startDate: meta.start_date || null, endDate: meta.end_date || null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(results);
});

// POST /api/projects — create a new project (#164)
app.post('/api/projects', requireAuth, requireRole('admin', 'resource_manager', 'project_manager'), async (req, res) => {
  const { name, clientName, status, probability, startDate, endDate } = req.body || {};
  if (!name || !status) return res.status(400).json({ error: 'name and status are required' });

  try {
    const tenantId = tId(req);

    // Resolve or create client
    let clientId = null;
    if (clientName) {
      const { data: existingClient, error: clientLookupErr } = await serviceClient
        .from('clients')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('name', clientName)
        .maybeSingle();
      if (clientLookupErr) throw clientLookupErr;

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const { data: newClient, error: clientCreateErr } = await serviceClient
          .from('clients')
          .insert({ tenant_id: tenantId, name: clientName })
          .select('id')
          .single();
        if (clientCreateErr) throw clientCreateErr;
        clientId = newClient.id;
      }
    }

    const project = await createProject({
      name,
      client_id:       clientId,
      status,
      probability_pct: probability != null ? Number(probability) : null,
      start_date:      startDate || null,
      end_date:        endDate   || null,
    }, tenantId);

    broadcastSSE({ type: 'project-created', id: project.id });
    res.status(201).json(project);
  } catch (err) {
    console.error('[POST /api/projects]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/needs — create a new staffing need (#164)
app.post('/api/needs', requireAuth, requireRole('admin', 'resource_manager', 'project_manager'), async (req, res) => {
  const { projectId, level, skillSetIds, hoursPerWeek, startDate, endDate } = req.body || {};
  if (!projectId || !level || !hoursPerWeek) {
    return res.status(400).json({ error: 'projectId, level, and hoursPerWeek are required' });
  }

  try {
    const tenantId = tId(req);

    // Fetch fresh meta for this tenant to validate project + resolve level
    const metaData = await readStaffingData(null, serviceClient, tenantId);
    if (metaData.error) return res.status(503).json({ error: metaData.error });

    // Validate need dates fall within project dates
    const project = metaData._meta?.projectById?.[projectId];
    if (!project) return res.status(400).json({ error: 'Project not found' });

    if (project.start_date && startDate && startDate < project.start_date) {
      return res.status(400).json({ error: 'Need start date is before project start date' });
    }
    if (project.end_date && endDate && endDate > project.end_date) {
      return res.status(400).json({ error: 'Need end date is after project end date' });
    }

    // Resolve level name → level_id
    const levelById = metaData._meta.levelById;
    const levelId = Object.keys(levelById).find(id => levelById[id] === level);
    if (!levelId) return res.status(400).json({ error: `Unknown level: ${level}` });

    const need = await createNeed({
      project_id:     projectId,
      level_id:       levelId,
      hours_per_week: Number(hoursPerWeek),
      start_date:     startDate || null,
      end_date:       endDate   || null,
      skill_set_ids:  Array.isArray(skillSetIds) ? skillSetIds : [],
    }, tenantId);

    broadcastSSE({ type: 'need-created', id: need.id });
    res.status(201).json(need);
  } catch (err) {
    console.error('[POST /api/needs]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/needs/:id/close — manually close a need (#164)
app.post('/api/needs/:id/close', requireAuth, requireRole('admin', 'resource_manager'), async (req, res) => {
  const { reason } = req.body || {};
  if (!['met', 'abandoned'].includes(reason)) {
    return res.status(400).json({ error: "reason must be 'met' or 'abandoned'" });
  }
  try {
    await closeNeed(req.params.id, reason);
    broadcastSSE({ type: 'need-closed', id: req.params.id, reason });
    res.json({ success: true });
  } catch (err) {
    console.error('[POST /api/needs/:id/close]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/needs/:id — edit an existing open need (#173)
app.patch('/api/needs/:id', requireAuth, requireRole('admin', 'resource_manager', 'project_manager'), async (req, res) => {
  const { level, skillSetIds, hoursPerWeek, startDate, endDate } = req.body || {};
  if (!level || !hoursPerWeek) {
    return res.status(400).json({ error: 'level and hoursPerWeek are required' });
  }

  try {
    const tenantId = tId(req);

    // Fetch fresh meta for this tenant to resolve level
    const metaData = await readStaffingData(null, serviceClient, tenantId);
    if (metaData.error) return res.status(503).json({ error: metaData.error });

    // Resolve level name → level_id
    const levelById = metaData._meta.levelById;
    const levelId = Object.keys(levelById).find(id => levelById[id] === level);
    if (!levelId) return res.status(400).json({ error: `Unknown level: ${level}` });

    await updateNeed(req.params.id, {
      level_id:      levelId,
      hours_per_week: Number(hoursPerWeek),
      start_date:    startDate || null,
      end_date:      endDate   || null,
    });

    await replaceNeedSkillSets(req.params.id, Array.isArray(skillSetIds) ? skillSetIds : [], tenantId);

    broadcastSSE({ type: 'need-updated', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('[PATCH /api/needs/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/industries — tenant-scoped industry list for dropdown (#188)
app.get('/api/industries', requireAuth, async (req, res) => {
  const tenantId = tId(req);
  try {
    const { data, error } = await serviceClient
      .from('industries')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .order('name');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/countries — global country list for dropdown (#188)
app.get('/api/countries', requireAuth, async (req, res) => {
  try {
    const { data, error } = await serviceClient
      .from('countries')
      .select('id, name')
      .order('sort_order');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/consultants — list all consultants for the Consultants Management panel (#126)
app.get('/api/consultants', requireAuth, requireRole('admin', 'resource_manager'), async (req, res) => {
  const tenantId = tId(req);
  try {
    const [{ data: consultants, error: cErr }, { data: levels, error: lErr },
           { data: css, error: cssErr }, { data: skillSets, error: ssErr }] = await Promise.all([
      serviceClient.from('consultants')
        .select('id, name, level_id, location, industry, country, is_active')
        .eq('tenant_id', tenantId)
        .order('name'),
      serviceClient.from('levels').select('id, name').eq('tenant_id', tenantId),
      serviceClient.from('consultant_skill_sets').select('consultant_id, skill_set_id').eq('tenant_id', tenantId),
      serviceClient.from('skill_sets').select('id, name, type').eq('tenant_id', tenantId),
    ]);
    if (cErr)   return res.status(500).json({ error: cErr.message });
    if (lErr)   return res.status(500).json({ error: lErr.message });
    if (cssErr) return res.status(500).json({ error: cssErr.message });
    if (ssErr)  return res.status(500).json({ error: ssErr.message });

    const levelById = Object.fromEntries(levels.map(l => [l.id, l.name]));
    const ssById    = Object.fromEntries(skillSets.map(s => [s.id, s]));

    const consultantSkills = {};
    for (const row of css) {
      const ss = ssById[row.skill_set_id];
      if (!ss) continue;
      if (!consultantSkills[row.consultant_id]) consultantSkills[row.consultant_id] = { practice: [], other: [] };
      const e = consultantSkills[row.consultant_id];
      if (ss.type === 'Practice Area') e.practice.push(ss.name);
      else e.other.push(ss.name);
    }

    res.json(consultants.map(c => {
      const sk = consultantSkills[c.id];
      const skillSets = sk ? [
        ...sk.practice.map(name => ({ name, type: 'Practice Area' })),
        ...sk.other.map(name => ({ name, type: 'Technology' })),
      ] : [];
      return {
        id:              c.id,
        name:            c.name,
        level:           levelById[c.level_id] || null,
        location:        c.location || null,
        industry:        c.industry || null,
        country:         c.country  || null,
        skillSets,
        is_active:       c.is_active !== false,
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/consultants/:id/deactivate — set is_active = false
app.patch('/api/consultants/:id/deactivate', requireAuth, requireRole('admin', 'resource_manager'), async (req, res) => {
  const tenantId = tId(req);
  try {
    const { error } = await serviceClient.from('consultants').update({ is_active: false }).eq('tenant_id', tenantId).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    broadcastSSE({ type: 'consultant-updated', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/consultants/:id/reactivate — set is_active = true
app.patch('/api/consultants/:id/reactivate', requireAuth, requireRole('admin', 'resource_manager'), async (req, res) => {
  const tenantId = tId(req);
  try {
    const { error } = await serviceClient.from('consultants').update({ is_active: true }).eq('tenant_id', tenantId).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    broadcastSSE({ type: 'consultant-updated', id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/consultants/:id — consultant profile + skill sets + available levels/skill sets
app.get('/api/consultants/:id', requireAuth, requireRole('admin', 'resource_manager', 'project_manager', 'executive', 'consultant'), async (req, res) => {
  const { id } = req.params;
  const tenantId = tId(req);
  try {
    const { data: consultant, error: cErr } = await serviceClient
      .from('consultants')
      .select('id, name, level_id, location, industry, country, capacity_hours_per_week, cost_rate_override, bill_rate_override, is_billable, user_id')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .single();
    if (cErr || !consultant) return res.status(404).json({ error: 'Consultant not found' });

    // Consultants may only view their own profile
    if (req.session.role === 'consultant') {
      if (consultant.user_id !== req.session.user?.id) {
        return res.status(403).json({ error: 'Forbidden: you may only view your own profile' });
      }
    }

    const [{ data: cssData, error: cssErr }, { data: levelsData, error: lErr }, { data: skillSetsData, error: ssErr }] = await Promise.all([
      serviceClient.from('consultant_skill_sets').select('skill_set_id').eq('tenant_id', tenantId).eq('consultant_id', id),
      serviceClient.from('levels').select('id, name, sort_order').eq('tenant_id', tenantId).order('sort_order'),
      serviceClient.from('skill_sets').select('id, name, type').eq('tenant_id', tenantId).order('name'),
    ]);
    if (cssErr) return res.status(500).json({ error: cssErr.message });
    if (lErr)   return res.status(500).json({ error: lErr.message });
    if (ssErr)  return res.status(500).json({ error: ssErr.message });

    const consultantData = { ...consultant, levelName: levelsData.find(l => l.id === consultant.level_id)?.name || null };
    if (req.session.role === 'consultant') {
      delete consultantData.bill_rate_override;
      delete consultantData.cost_rate_override;
    }

    res.json({
      consultant: consultantData,
      skillSetIds: cssData.map(c => c.skill_set_id),
      levels: levelsData,
      allSkillSets: skillSetsData,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/consultants/:id — update consultant profile fields
app.patch('/api/consultants/:id', requireAuth, requireRole('admin', 'resource_manager'), async (req, res) => {
  const { id } = req.params;
  const { name, level_id, location, industry, country, bill_rate_override, cost_rate_override, user_id } = req.body || {};
  const tenantId = tId(req);

  const updates = {};
  if (name              !== undefined) updates.name               = name;
  if (level_id          !== undefined) updates.level_id           = level_id;
  if (location          !== undefined) updates.location           = location;
  if (industry          !== undefined) updates.industry           = industry;
  if (country           !== undefined) updates.country            = country;
  if (bill_rate_override !== undefined) updates.bill_rate_override = bill_rate_override === '' ? null : bill_rate_override;
  if (cost_rate_override !== undefined) updates.cost_rate_override = cost_rate_override === '' ? null : cost_rate_override;
  if (user_id           !== undefined) updates.user_id            = user_id === '' ? null : user_id;

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No fields to update' });

  try {
    const { error } = await serviceClient.from('consultants').update(updates).eq('tenant_id', tenantId).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    broadcastSSE({ type: 'consultant-updated', id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/consultants/:id/skills — replace all skill set assignments for a consultant
app.put('/api/consultants/:id/skills', requireAuth, requireRole('admin', 'resource_manager'), async (req, res) => {
  const { id } = req.params;
  const { skillSetIds } = req.body || {};
  const tenantId = tId(req);

  if (!Array.isArray(skillSetIds)) return res.status(400).json({ error: 'skillSetIds must be an array' });

  try {
    const { error: delErr } = await serviceClient.from('consultant_skill_sets').delete().eq('tenant_id', tenantId).eq('consultant_id', id);
    if (delErr) return res.status(500).json({ error: delErr.message });

    if (skillSetIds.length > 0) {
      const rows = skillSetIds.map(ssId => ({ tenant_id: tenantId, consultant_id: id, skill_set_id: ssId }));
      const { error: insErr } = await serviceClient.from('consultant_skill_sets').insert(rows);
      if (insErr) return res.status(500).json({ error: insErr.message });
    }

    broadcastSSE({ type: 'consultant-updated', id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * After assignments are written, check if any of the specified needs are now
 * fully covered by the new supply. A need is fully met when at least one
 * consultant on the project has >= hoursPerWeek assigned in every week of the
 * need's date range. Returns array of needIds that were closed.
 */
async function checkAndAutoCloseNeeds(needIds, freshData) {
  const { supply, demand } = freshData;
  const { weekKeyToDate } = freshData._meta;
  const weekKeys = supply.length ? Object.keys(supply[0].weeklyHours) : [];
  if (!weekKeys.length) return [];

  function parseDemandDate(str) {
    if (!str) return null;
    const parts = String(str).split('/');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
  }
  function parseWkDate(wk) {
    const iso = weekKeyToDate[wk];
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  const closed = [];
  for (const needId of needIds) {
    if (!needId) continue;
    const need = demand.find(n => n._needId === needId);
    if (!need) continue; // already closed or not found

    const startDate   = parseDemandDate(need.startDate);
    const endDate     = parseDemandDate(need.endDate);
    const hoursNeeded = Number(need.hoursPerWeek) || 45;

    const demandWeeks = weekKeys.filter(wk => {
      const d = parseWkDate(wk);
      return d && startDate && endDate && d >= startDate && d <= endDate;
    });
    if (!demandWeeks.length) continue;

    // Gather supply rows for this project, keyed by consultant
    const byConsultant = {};
    for (const row of supply) {
      if (row.projectAssigned !== need.projectName) continue;
      if (!byConsultant[row.employeeName]) {
        byConsultant[row.employeeName] = { level: row.level, weeklyHours: {} };
      }
      for (const [wk, hrs] of Object.entries(row.weeklyHours)) {
        byConsultant[row.employeeName].weeklyHours[wk] =
          (byConsultant[row.employeeName].weeklyHours[wk] || 0) + hrs;
      }
    }

    // Need is fully met if any consultant covers every week at the required hours
    let fullyMet = false;
    for (const info of Object.values(byConsultant)) {
      if (info.level !== need.resourceLevel) continue;
      if (demandWeeks.every(wk => (info.weeklyHours[wk] || 0) >= hoursNeeded)) {
        fullyMet = true;
        break;
      }
    }

    if (fullyMet) {
      try {
        await closeNeed(needId, 'met');
        closed.push(needId);
      } catch (e) {
        console.error('[checkAndAutoCloseNeeds]', e.message);
      }
    }
  }
  return closed;
}

// POST /api/supply/update — apply add/update/delete changes to supply via Supabase
app.post('/api/supply/update', requireRole('admin', 'resource_manager'), async (req, res) => {
  const { changes } = req.body || {};
  if (!Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({ error: 'changes array is required' });
  }

  try {
    // 1. Read current supply data fresh
    const freshData = await readStaffingData(null, serviceClient, tId(req));
    if (freshData.error) return res.status(503).json({ error: freshData.error });

    const { supply } = freshData;
    const weekKeys = supply.length ? Object.keys(supply[0].weeklyHours) : [];
    const { weekKeyToDate } = freshData._meta;

    function parseDateStr(str) {
      if (!str) return null;
      const parts = String(str).split('/');
      if (parts.length === 3) { let yr = parseInt(parts[2]); if (yr < 100) yr += 2000; return new Date(yr, parseInt(parts[0]) - 1, parseInt(parts[1])); }
      if (str.includes('-')) {
        const [y, mo, d] = str.split('-');
        return new Date(parseInt(y), parseInt(mo) - 1, parseInt(d));
      }
      return null;
    }

    function parseWkDate(wk) {
      const iso = weekKeyToDate[wk];
      if (!iso) return null;
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    // 2. Apply changes via Supabase write operations
    for (const ch of changes) {
      const row = supply.find(r =>
        r.employeeName === ch.employeeName && r.projectAssigned === ch.project
      );
      const consultantId = row?._consultantId ?? await resolveConsultantId(null, ch.employeeName, tId(req));
      if (!consultantId) {
        console.warn(`[supply/update] consultant not found: ${ch.employeeName}`);
        continue;
      }

      if (ch.type === 'delete') {
        const projectId = row?._projectId ?? await resolveProjectId(null, ch.project, false, tId(req));
        if (projectId) await deleteAssignments(null, { consultantId, projectId, tenantId: tId(req) });

      } else if (ch.type === 'update') {
        const projectId = row?._projectId ?? await resolveProjectId(null, ch.project, false, tId(req));
        if (!projectId) continue;

        if (ch.startDate !== undefined && ch.endDate !== undefined && ch.hoursPerWeek !== undefined) {
          const start = parseDateStr(ch.startDate);
          const end   = parseDateStr(ch.endDate);
          if (!start || !end) {
            console.warn(`[supply/update] update: unparseable date range for ${ch.project} — startDate=${ch.startDate} endDate=${ch.endDate}`);
            continue;
          }
          const hrs = Number(ch.hoursPerWeek);
          const matchingWks = weekKeys.filter(wk => { const wkDate = parseWkDate(wk); return wkDate && wkDate >= start && wkDate <= end; });
          if (!matchingWks.length) return res.status(400).json({ error: 'No weeks fall within the specified date range' });
          for (const wk of matchingWks) {
            const weekEnding = weekKeyToDate[wk];
            if (weekEnding) await upsertAssignment(null, { consultantId, projectId, weekEnding, hours: hrs, tenantId: tId(req) }, serviceClient);
          }
        }

      } else if (ch.type === 'add') {
        const projectId = await resolveProjectId(null, ch.project, true, tId(req));
        if (!projectId) continue;

        const start = parseDateStr(ch.startDate);
        const end   = parseDateStr(ch.endDate);
        if (!start || !end) {
          console.warn(`[supply/update] add: unparseable date range for ${ch.project} — startDate=${ch.startDate} endDate=${ch.endDate}`);
          continue;
        }
        const hrs = Number(ch.hoursPerWeek) || 0;
        const matchingWksAdd = weekKeys.filter(wk => { const wkDate = parseWkDate(wk); return wkDate && wkDate >= start && wkDate <= end; });
        if (!matchingWksAdd.length) return res.status(400).json({ error: 'No weeks fall within the specified date range' });
        for (const wk of matchingWksAdd) {
          const weekEnding = weekKeyToDate[wk];
          if (weekEnding) await upsertAssignment(null, { consultantId, projectId, weekEnding, hours: hrs, tenantId: tId(req) }, serviceClient);
        }
      }
    }

    // 3. Auto-close any needs that are now fully covered by accepted assignments
    const freshData2 = await readStaffingData(null, serviceClient, tId(req));
    const affectedNeedIds = [...new Set(changes.filter(c => c.needId).map(c => c.needId))];
    const closedNeedIds = affectedNeedIds.length
      ? await checkAndAutoCloseNeeds(affectedNeedIds, freshData2)
      : [];

    if (closedNeedIds.length) {
      broadcastSSE({ type: 'need-closed', ids: closedNeedIds, reason: 'met', autoClose: true });
    }

    res.json({ success: true, updatedRows: changes.length, closedNeedIds });

  } catch (err) {
    console.error('[supply/update]', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/skill-sets/:skillName/consultants — all active consultants with that skill + current week booked hours
app.get('/api/skill-sets/:skillName/consultants', requireAuth, requireRole('admin', 'resource_manager', 'project_manager', 'executive'), async (req, res) => {
  const skillName = req.params.skillName;
  const tenantId  = tId(req);
  try {
    // 1. Find skill set by name
    const { data: ssRows, error: ssErr } = await serviceClient
      .from('skill_sets')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('name', skillName);
    if (!ssRows || !ssRows.length) return res.json([]);
    const ssId = ssRows[0].id;

    // 2. Get all consultant IDs with this skill
    const { data: cssRows, error: cssErr } = await serviceClient
      .from('consultant_skill_sets')
      .select('consultant_id')
      .eq('tenant_id', tenantId)
      .eq('skill_set_id', ssId);
    if (!cssRows || !cssRows.length) return res.json([]);
    const consultantIds = cssRows.map(r => r.consultant_id);

    // 3. Get active consultants + levels in parallel
    const [{ data: cRows, error: cErr }, { data: levels, error: lErr }] = await Promise.all([
      serviceClient.from('consultants')
        .select('id, name, level_id, location')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .in('id', consultantIds),
      serviceClient.from('levels')
        .select('id, name, sort_order')
        .eq('tenant_id', tenantId)
        .order('sort_order'),
    ]);
    if (cErr) return res.status(500).json({ error: cErr.message });

    const levelMap = Object.fromEntries((levels || []).map(l => [l.id, l.name]));

    // 4. Current week booked hours from fresh data
    const currentWeekHours = {};
    const sd = await readStaffingData(null, serviceClient, tenantId);
    if (sd && !sd.error && sd.supply && sd.supply.length && sd._meta?.weekKeyToDate) {
      const weekKeys = Object.keys(sd.supply[0].weeklyHours);
      const { weekKeyToDate } = sd._meta;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      let currentWk = null;
      for (const wk of weekKeys) {
        const iso = weekKeyToDate[wk];
        if (!iso) continue;
        const [y, m, d] = iso.split('-').map(Number);
        if (new Date(y, m - 1, d) >= today) { currentWk = wk; break; }
      }
      if (currentWk) {
        for (const row of sd.supply) {
          currentWeekHours[row.employeeName] = (currentWeekHours[row.employeeName] || 0) + (row.weeklyHours[currentWk] || 0);
        }
      }
    }

    // 5. Build response — level is always a plain string (levelMap resolves level_id → name)
    const result = (cRows || []).map(c => ({
      id:          c.id,
      name:        c.name,
      level:       levelMap[c.level_id] ?? null,
      location:    c.location  ?? null,
      bookedHours: currentWeekHours[c.name] ?? 0,
    }));
    res.json(result);
  } catch (err) {
    console.error('[skillSets] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Cache for /api/recommendations only — avoids paying the 4s Supabase fetch on every panel open
const RECO_CACHE_TTL = 60_000; // 60 seconds
const recoCacheMap = new Map(); // tenantId → { data, timestamp }

// Sequential testing setting per tenant (in-memory; persists for process lifetime, defaults true)
const sequentialTestingMap = new Map(); // tenantId → boolean

// GET /api/recommendations — AI-matched consultants for each open need
app.get('/api/recommendations', requireRole('admin', 'resource_manager', 'project_manager'), async (req, res) => {
  const t0 = Date.now();

  const tenantId = tId(req);
  let freshData;
  let cacheHit = false;
  const cached = recoCacheMap.get(tenantId);
  if (cached && (Date.now() - cached.timestamp) < RECO_CACHE_TTL) {
    freshData = cached.data;
    cacheHit = true;
  } else {
    freshData = await readStaffingData(null, serviceClient, tenantId);
    if (freshData.error) return res.status(503).json({ error: freshData.error });
    recoCacheMap.set(tenantId, { data: freshData, timestamp: Date.now() });
  }
  const t1 = Date.now();

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
      empWeekMap[name] = { skillSet: row.skillSet || '', allSkillSets: row.allSkillSets || [], level: levelMap[name] || row.level || '', weekTotals: {} };
    }
    for (const [wk, hrs] of Object.entries(row.weeklyHours)) {
      empWeekMap[name].weekTotals[wk] = (empWeekMap[name].weekTotals[wk] || 0) + (hrs || 0);
    }
  }

  // Pre-compute week dates
  const weekDateMap = {};
  for (const wk of weekKeys) weekDateMap[wk] = parseWeekKey(wk);

  // Pass 1: score and filter candidates for every need (pure CPU — no I/O)
  const needsWithMatches = [];

  for (const need of demand) {
    const startDate   = parseDemandDate(need.startDate);
    const endDate     = parseDemandDate(need.endDate);
    const hoursNeeded = Number(need.hoursPerWeek) || 45;

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
      if (!info.allSkillSets || !info.allSkillSets.includes(need.skillSet)) continue;

      let totalHours = 0;
      for (const wk of demandWeeks) {
        totalHours += info.weekTotals[wk] || 0;
      }

      const avgBooked          = totalHours / demandWeeks.length;
      const rawAvailable       = Math.round((45 - avgBooked) * 10) / 10;
      const availableHours     = Math.min(rawAvailable, hoursNeeded);
      const currentUtilization = Math.round((avgBooked / 45) * 100);
      const weeklyBreakdown    = demandWeeks.map(wk => ({
        week: wk,
        bookedHours:    info.weekTotals[wk] || 0,
        availableHours: Math.max(0, 45 - (info.weekTotals[wk] || 0)),
      }));

      if (availableHours > 0) {
        matches.push({ employeeName: name, level: info.level, skillSet: info.skillSet,
                       availableHours, currentUtilization, weeklyBreakdown });
      }
    }

    matches.sort((a, b) => b.availableHours - a.availableHours);
    needsWithMatches.push({ need, matches: matches.slice(0, 5) });
  }

  // Pass 2: fire all Claude reasoning calls in parallel — one promise per need with candidates
  await Promise.all(needsWithMatches.map(async (entry) => {
    if (entry.matches.length === 0) return;
    try {
      const reasonings = await getMatchReasonings(entry.need, entry.matches);
      entry.matches = entry.matches.map((m, i) => ({
        ...m, reasoning: reasonings[i] || 'Strong skill set and availability match.',
      }));
    } catch (err) {
      console.warn('[recommendations] reasoning failed for', entry.need.projectName, '—', err.message);
      entry.matches = entry.matches.map(m => ({
        ...m, reasoning: 'Available capacity meets requirement.',
      }));
    }
  }));

  const t2 = Date.now();
  res.json({ needs: needsWithMatches });
});

// GET /api/needs/:id/candidates — ranked candidates for a single need (#189)
app.get('/api/needs/:id/candidates', requireAuth, requireRole('admin', 'resource_manager'), async (req, res) => {
  try {
    const needId    = req.params.id;
    const freshData = await readStaffingData(null, serviceClient, tId(req));
    if (freshData.error) return res.status(503).json({ error: freshData.error });

    const { supply, demand, employees, _meta } = freshData;
    const { weekKeyToDate, consultantByName }   = _meta;
    const weekKeys = supply.length ? Object.keys(supply[0].weeklyHours) : [];

    const need = demand.find(n => n._needId === needId);
    if (!need) return res.status(404).json({ error: 'Need not found' });

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

    // Build level map
    const levelMap = {};
    for (const emp of employees) levelMap[emp.employeeName] = emp.level;

    // Build per-employee weekly hour totals (supply rows only)
    const empWeekMap = {};
    for (const row of supply) {
      const name = row.employeeName;
      if (!empWeekMap[name]) {
        empWeekMap[name] = { allSkillSets: row.allSkillSets || [], level: levelMap[name] || row.level || '', weekTotals: {} };
      }
      for (const [wk, hrs] of Object.entries(row.weeklyHours)) {
        empWeekMap[name].weekTotals[wk] = (empWeekMap[name].weekTotals[wk] || 0) + (hrs || 0);
      }
    }
    // Include bench consultants (no assignments) so they appear as 100% available
    for (const emp of employees) {
      if (!empWeekMap[emp.employeeName]) {
        const c = consultantByName[emp.employeeName];
        empWeekMap[emp.employeeName] = {
          allSkillSets: c ? (c.allSkillSets || []) : [],
          level:        emp.level || '',
          weekTotals:   {},
        };
      }
    }

    const startDate   = parseDemandDate(need.startDate);
    const endDate     = parseDemandDate(need.endDate);
    const hoursNeeded = Number(need.hoursPerWeek) || 45;

    const weekDateMap = {};
    for (const wk of weekKeys) weekDateMap[wk] = parseWeekKey(wk);

    const demandWeeks = weekKeys.filter(wk => {
      const d = weekDateMap[wk];
      return d && startDate && endDate && d >= startDate && d <= endDate;
    });

    const candidates = [];
    for (const [name, info] of Object.entries(empWeekMap)) {
      if (info.level !== need.resourceLevel) continue;
      if (!info.allSkillSets || !info.allSkillSets.includes(need.skillSet)) continue;
      if (!demandWeeks.length) continue;

      let totalHours = 0;
      for (const wk of demandWeeks) totalHours += info.weekTotals[wk] || 0;

      const avgBooked         = totalHours / demandWeeks.length;
      const rawAvailable      = Math.round((45 - avgBooked) * 10) / 10;
      const avgAvailableHours = Math.min(Math.max(rawAvailable, 0), hoursNeeded);

      if (avgAvailableHours <= 0) continue;

      const matchPct = Math.round((avgAvailableHours / hoursNeeded) * 100);
      const badge    = matchPct >= 100 ? 'green' : matchPct >= 50 ? 'yellow' : 'coral';
      const c        = consultantByName[name];

      candidates.push({
        consultantId:   c ? c.id : null,
        name,
        level:          info.level,
        matchingSkills: info.allSkillSets.filter(s => (need.allSkillSets || []).includes(s)),
        avgAvailableHours,
        matchPct,
        badge,
      });
    }

    candidates.sort((a, b) => b.avgAvailableHours - a.avgAvailableHours);

    res.json({
      need: {
        needId:       need._needId,
        projectName:  need.projectName,
        clientName:   need.clientName,
        level:        need.resourceLevel,
        skills:       need.allSkillSets || [],
        hoursPerWeek: need.hoursPerWeek,
        startDate:    need.startDate,
        endDate:      need.endDate,
      },
      candidates,
    });
  } catch (err) {
    console.error('[candidates] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/needs/:id/bulk-assign — assign multiple consultants to a need (#189)
app.post('/api/needs/:id/bulk-assign', requireAuth, requireRole('admin', 'resource_manager'), async (req, res) => {
  const { consultantIds } = req.body || {};
  if (!Array.isArray(consultantIds) || consultantIds.length === 0) {
    return res.status(400).json({ error: 'consultantIds must be a non-empty array' });
  }

  try {
    const needId    = req.params.id;
    const freshData = await readStaffingData(null, serviceClient, tId(req));
    if (freshData.error) return res.status(503).json({ error: freshData.error });

    const { supply, demand, _meta } = freshData;
    const { weekKeyToDate }         = _meta;

    const need = demand.find(n => n._needId === needId);
    if (!need) return res.status(404).json({ error: 'Need not found' });

    const projectId    = need._projectId;
    const hoursPerWeek = Number(need.hoursPerWeek) || 45;

    function parseDemandDate(str) {
      if (!str) return null;
      const parts = String(str).split('/');
      if (parts.length !== 3) return null;
      return new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    }
    function parseWkDate(wk) {
      const iso = weekKeyToDate[wk];
      if (!iso) return null;
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    const startDate = parseDemandDate(need.startDate);
    const endDate   = parseDemandDate(need.endDate);

    if (!startDate || !endDate || !projectId) {
      return res.status(400).json({ error: 'Need is missing required fields (startDate, endDate, or projectId)' });
    }

    // Collect ISO week_ending dates within the need's date range
    const weekDates = Object.entries(weekKeyToDate)
      .filter(([wk]) => { const d = parseWkDate(wk); return d && d >= startDate && d <= endDate; })
      .map(([, iso]) => iso);

    if (weekDates.length === 0) {
      return res.status(400).json({ error: "No staffing weeks found in the need's date range" });
    }

    // Build current per-consultant per-week booked hours (for capacity capping)
    const supplyMap = {};
    for (const row of supply) {
      if (!supplyMap[row._consultantId]) supplyMap[row._consultantId] = {};
      for (const [wk, hrs] of Object.entries(row.weeklyHours)) {
        const iso = weekKeyToDate[wk];
        if (iso) supplyMap[row._consultantId][iso] = (supplyMap[row._consultantId][iso] || 0) + (hrs || 0);
      }
    }

    // Write assignments for each selected consultant
    for (const consultantId of consultantIds) {
      for (const weekEnding of weekDates) {
        const alreadyBooked = (supplyMap[consultantId] || {})[weekEnding] || 0;
        const available     = Math.max(0, 45 - alreadyBooked);
        const hours         = Math.min(hoursPerWeek, available);
        if (hours <= 0) continue;
        await upsertAssignment(null, { consultantId, projectId, weekEnding, hours, isBillable: true, tenantId: tId(req) }, serviceClient);
      }
    }

    // Reload data and auto-close need if now fully staffed
    const freshData2 = await readStaffingData(null, serviceClient, tId(req));
    const closedIds  = await checkAndAutoCloseNeeds([needId], freshData2);

    broadcastSSE({ type: 'staffing-updated', needId, closedNeedIds: closedIds });

    res.json({ success: true, assignedCount: consultantIds.length, closedNeedIds: closedIds });
  } catch (err) {
    console.error('[bulk-assign] error:', err);
    res.status(500).json({ error: err.message });
  }
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
        status:             u.banned_until ? 'deactivated' : (!u.last_sign_in_at ? 'pending' : 'active'),
        last_sign_in_at:    u.last_sign_in_at,
        email_confirmed_at: u.email_confirmed_at,
        created_at:         u.created_at,
      }));

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/invite — create user + own invite token (7-day TTL)
app.post('/api/admin/users/invite', requireAuth, requireRole('admin'), async (req, res) => {
  const { email, role, display_name } = req.body || {};
  if (!email || !role) {
    return res.status(400).json({ error: 'email and role are required' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  const tenantId = tId(req);
  const inviteToken   = crypto.randomUUID();
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data: { users } } = await serviceClient.auth.admin.listUsers({ perPage: 1000 });
    const existingUser = users.find(u => u.email === email);

    if (existingUser) {
      const existingTenant = existingUser.app_metadata?.tenant_id;
      if (existingTenant && existingTenant !== tenantId) {
        return res.status(400).json({ error: 'User belongs to a different tenant' });
      }
      if (existingUser.last_sign_in_at) {
        return res.status(400).json({ error: 'User is already active. Use Reset Password instead.' });
      }
      // Update token for pending user
      await serviceClient.auth.admin.updateUserById(existingUser.id, {
        app_metadata: {
          ...existingUser.app_metadata,
          role,
          tenant_id: tenantId,
          testing_role: 'tester',
          invite_token:   inviteToken,
          invite_expires: inviteExpires
        }
      });
    } else {
      const { error } = await serviceClient.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: {
          role,
          tenant_id: tenantId,
          testing_role: 'tester',
          display_name: display_name || email,
          invite_token:   inviteToken,
          invite_expires: inviteExpires
        }
      });
      if (error) return res.status(500).json({ error: error.message });
    }

    const baseUrl  = process.env.RAILWAY_URL || `http://localhost:${process.env.PORT || 3000}`;
    const inviteUrl = `${baseUrl}/set-password.html?invite=${inviteToken}`;

    res.status(201).json({ success: true, inviteUrl, invite_url: inviteUrl, email });
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
    // Invalidate the target user's active sessions so the role change takes effect
    // immediately. Skip if the admin is changing their own role.
    const targetId = req.params.id;
    if (targetId !== req.session.user?.id) {
      const sids = userSessionMap.get(targetId);
      if (sids) {
        for (const sid of sids) req.sessionStore.destroy(sid, () => {});
        userSessionMap.delete(targetId);
      }
    }
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
    // Kick the deactivated user off immediately — destroy their active sessions.
    const targetId = req.params.id;
    const sids = userSessionMap.get(targetId);
    if (sids) {
      for (const sid of sids) req.sessionStore.destroy(sid, () => {});
      userSessionMap.delete(targetId);
    }
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

// POST /api/admin/users/:id/resend-invite — regenerate invite token for a pending user
app.post('/api/admin/users/:id/resend-invite', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { data: userData, error: fetchErr } = await serviceClient.auth.admin.getUserById(req.params.id);
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!userData?.user) return res.status(404).json({ error: 'User not found' });

    const user = userData.user;
    if (user.last_sign_in_at) {
      return res.status(400).json({ error: 'User has already logged in — cannot resend invite' });
    }

    const inviteToken   = crypto.randomUUID();
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await serviceClient.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        invite_token:   inviteToken,
        invite_expires: inviteExpires
      }
    });

    const baseUrl  = process.env.RAILWAY_URL || `http://localhost:${process.env.PORT || 3000}`;
    const inviteUrl = `${baseUrl}/set-password.html?invite=${inviteToken}`;

    res.json({ success: true, invite_url: inviteUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:id/reset-password — admin-initiated password reset (active users)
app.post('/api/admin/users/:id/reset-password', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { data: userData, error: fetchErr } = await serviceClient.auth.admin.getUserById(req.params.id);
    if (fetchErr) return res.status(500).json({ error: fetchErr.message });
    if (!userData?.user) return res.status(404).json({ error: 'User not found' });

    const user = userData.user;
    const resetToken   = crypto.randomUUID();
    const resetExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await serviceClient.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        invite_token:   resetToken,
        invite_expires: resetExpires
      }
    });

    const baseUrl  = process.env.RAILWAY_URL || `http://localhost:${process.env.PORT || 3000}`;
    const resetUrl  = `${baseUrl}/set-password.html?invite=${resetToken}`;

    res.json({ success: true, resetUrl, email: user.email });
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

// POST /api/admin/reset-sandbox — reseed this tenant's data with fresh synthetic data
// Safety: rejects requests from the production tenant to prevent accidental data wipe.
// Tenant is read from session — a user can only reset their own tenant.
app.post('/api/admin/reset-sandbox', requireAuth, requireRole('admin'), async (req, res) => {
  const tenantId = req.session.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'No tenant_id in session' });
  if (tenantId === process.env.TENANT_ID) {
    return res.status(403).json({ error: 'Cannot reset the production tenant' });
  }
  try {
    await seedTenant(tenantId, serviceClient, { skipConfirm: true });
    broadcastSSE({ type: 'data-reset' });
    res.json({ success: true, message: 'Sandbox reset complete' });
  } catch (err) {
    console.error('[reset-sandbox] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Testing companion endpoints ──────────────────────────────────────────────

const getTestingRole = (req) => req.session?.testing_role || null;
const isTestAdmin    = (req) => getTestingRole(req) === 'test_admin';
const isTester       = (req) => ['test_admin', 'tester'].includes(getTestingRole(req));

// GET /api/test-results — current user's results (includes submitted_at)
app.get('/api/test-results', requireAuth, async (req, res) => {
  if (!isTester(req)) return res.status(403).json({ error: 'Testing access required' });
  try {
    const { data, error } = await serviceClient
      .from('test_results')
      .select('test_case_id, status, notes, tested_at, submitted_at')
      .eq('tenant_id', tId(req))
      .eq('user_id', req.session.user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/test-results — upsert a single result
// Blocked if this specific test case is submitted, unless it has been marked 'retest' by admin.
app.post('/api/test-results', requireAuth, async (req, res) => {
  if (!isTester(req)) return res.status(403).json({ error: 'Testing access required' });
  const { test_case_id, status, notes } = req.body || {};
  if (!test_case_id || !status) {
    return res.status(400).json({ error: 'test_case_id and status are required' });
  }
  if (!['pass', 'fail', 'skip', 'note'].includes(status)) {
    return res.status(400).json({ error: 'status must be pass, fail, skip, or note' });
  }
  try {
    // Block writes only if this specific test case is locked (submitted and not marked for retest)
    const { data: existing } = await serviceClient
      .from('test_results')
      .select('submitted_at, status, notes')
      .eq('tenant_id', tId(req))
      .eq('user_id', req.session.user.id)
      .eq('test_case_id', test_case_id)
      .limit(1);
    const row = existing?.[0];
    if (row?.submitted_at && row?.status !== 'retest') {
      return res.status(403).json({ error: 'This test has been submitted. Ask the test admin to mark it for retest.' });
    }
    // General feedback: append new notes to existing rather than overwriting
    let resolvedNotes = notes || null;
    if (test_case_id === 'general-feedback' && notes && row?.notes) {
      const ts = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      resolvedNotes = `${row.notes}\n\n--- ${ts} ---\n${notes}`;
    }
    const { error } = await serviceClient
      .from('test_results')
      .upsert({
        tenant_id:    tId(req),
        test_case_id,
        user_id:      req.session.user.id,
        user_email:   req.session.user.email,
        status,
        notes:        resolvedNotes,
        tested_at:    new Date().toISOString()
      }, { onConflict: 'tenant_id,test_case_id,user_id' });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/test-results/:testCaseId — remove a single result (blocked if submitted)
app.delete('/api/test-results/:testCaseId', requireAuth, async (req, res) => {
  if (!isTester(req)) return res.status(403).json({ error: 'Testing access required' });
  const { testCaseId } = req.params;
  try {
    // Only block if THIS specific test case is submitted (not if other tests are submitted)
    const { data: existing } = await serviceClient
      .from('test_results')
      .select('submitted_at, status')
      .eq('tenant_id', tId(req))
      .eq('user_id', req.session.user.id)
      .eq('test_case_id', testCaseId)
      .not('submitted_at', 'is', null)
      .limit(1);
    if (existing && existing.length > 0 && existing[0].status !== 'retest') {
      return res.status(403).json({ error: 'Tests already submitted.' });
    }
    const { error } = await serviceClient
      .from('test_results')
      .delete()
      .eq('tenant_id', tId(req))
      .eq('user_id', req.session.user.id)
      .eq('test_case_id', testCaseId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/test-results/submit — lock all current user's results
app.post('/api/test-results/submit', requireAuth, async (req, res) => {
  if (!isTester(req)) return res.status(403).json({ error: 'Testing access required' });
  try {
    const now = new Date().toISOString();
    const { error } = await serviceClient
      .from('test_results')
      .update({ submitted_at: now })
      .eq('tenant_id', tId(req))
      .eq('user_id', req.session.user.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, submitted_at: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/test-results/summary — test_admin only, all tenants
app.get('/api/test-results/summary', requireAuth, async (req, res) => {
  if (!isTestAdmin(req)) return res.status(403).json({ error: 'Test admin access required' });
  try {
    const { data, error } = await serviceClient
      .from('test_results')
      .select('test_case_id, user_id, user_email, tenant_id, status, notes, tested_at, submitted_at, tenants(name)');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/test-results/reset — test_admin only; body: { user_id? } omit = reset all
app.post('/api/test-results/reset', requireAuth, async (req, res) => {
  if (!isTestAdmin(req)) return res.status(403).json({ error: 'Test admin access required' });
  const { user_id } = req.body || {};
  try {
    let query = serviceClient.from('test_results').delete();
    if (user_id) query = query.eq('user_id', user_id);
    else         query = query.neq('id', '00000000-0000-0000-0000-000000000000'); // delete all
    const { error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Testing lifecycle endpoints (#212) ──────────────────────────────────────

// GET /api/testing/results — admin: all users in tenant; tester: own results only
app.get('/api/testing/results', requireAuth, async (req, res) => {
  if (!isTester(req)) return res.status(403).json({ error: 'Testing access required' });
  try {
    let query = serviceClient
      .from('test_results')
      .select('test_case_id, user_id, user_email, status, notes, submitted_at')
      .eq('tenant_id', tId(req));
    if (!isTestAdmin(req)) {
      query = query.eq('user_id', req.session.user.id);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    res.json((data || []).map(r => ({ ...r, email: r.user_email })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/testing/results/retest — admin only; mark specific test cases for retest
// Body: { user_id, test_case_ids: [...] }
app.patch('/api/testing/results/retest', requireAuth, async (req, res) => {
  if (!isTestAdmin(req)) return res.status(403).json({ error: 'Test admin access required' });
  const { user_id, test_case_ids } = req.body || {};
  if (!user_id || !Array.isArray(test_case_ids) || test_case_ids.length === 0) {
    return res.status(400).json({ error: 'user_id and non-empty test_case_ids array are required' });
  }
  try {
    const { error } = await serviceClient
      .from('test_results')
      .update({ status: 'retest', submitted_at: null })
      .eq('tenant_id', tId(req))
      .eq('user_id', user_id)
      .in('test_case_id', test_case_ids);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, count: test_case_ids.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/testing/results/retest-all-failed — admin only; flip all failed → retest for a user
// Body: { user_id }
app.patch('/api/testing/results/retest-all-failed', requireAuth, async (req, res) => {
  if (!isTestAdmin(req)) return res.status(403).json({ error: 'Test admin access required' });
  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });
  try {
    const { data, error } = await serviceClient
      .from('test_results')
      .update({ status: 'retest', submitted_at: null })
      .eq('tenant_id', tId(req))
      .eq('user_id', user_id)
      .eq('status', 'fail')
      .select('test_case_id');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, count: (data || []).length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/testing/results/reset — admin: body { user_id }; tester: resets own
app.delete('/api/testing/results/reset', requireAuth, async (req, res) => {
  if (!isTester(req)) return res.status(403).json({ error: 'Testing access required' });
  const { user_id } = req.body || {};
  // Non-admins can only reset their own results
  const targetUserId = isTestAdmin(req) && user_id ? user_id : req.session.user.id;
  if (!isTestAdmin(req) && user_id && user_id !== req.session.user.id) {
    return res.status(403).json({ error: 'Testers can only reset their own results' });
  }
  try {
    const { error } = await serviceClient
      .from('test_results')
      .delete()
      .eq('tenant_id', tId(req))
      .eq('user_id', targetUserId);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/testing/results/reset-all — admin only; wipe all results for tenant
app.delete('/api/testing/results/reset-all', requireAuth, async (req, res) => {
  if (!isTestAdmin(req)) return res.status(403).json({ error: 'Test admin access required' });
  try {
    const { error } = await serviceClient
      .from('test_results')
      .delete()
      .eq('tenant_id', tId(req));
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/testing/settings — read sequential_testing flag (in-memory, default true)
app.get('/api/testing/settings', requireAuth, (req, res) => {
  if (!isTester(req)) return res.status(403).json({ error: 'Testing access required' });
  const sequential_testing = sequentialTestingMap.has(tId(req))
    ? sequentialTestingMap.get(tId(req))
    : true;
  res.json({ sequential_testing });
});

// PATCH /api/testing/settings — update sequential_testing flag (test_admin only, in-memory)
app.patch('/api/testing/settings', requireAuth, (req, res) => {
  if (!isTestAdmin(req)) return res.status(403).json({ error: 'Test admin access required' });
  const { sequential_testing } = req.body || {};
  if (typeof sequential_testing !== 'boolean') {
    return res.status(400).json({ error: 'sequential_testing must be boolean' });
  }
  sequentialTestingMap.set(tId(req), sequential_testing);
  res.json({ ok: true });
});

// GET /api/events — Server-Sent Events endpoint
app.get('/api/events', (req, res) => {
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

// GET /reset-password — serve reset page (no auth required; tokens arrive in URL hash)
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// Serve static files after API routes so they don't shadow API paths
app.use(express.static(path.join(__dirname, 'public')));

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Staffing app running on http://localhost:${PORT}`);
});
