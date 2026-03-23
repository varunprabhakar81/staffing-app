/**
 * supabaseReader.js
 * Replaces excelReader.js. Returns the same data shape the rest of the app
 * expects: { supply, demand, employees, skills, resourceLevels, projects }
 *
 * Two clients:
 *   serviceClient — SUPABASE_SERVICE_KEY, bypasses RLS. Exported for
 *                   import-to-supabase.js only. Never called from request handlers.
 *   getClient(userToken) — returns a request-scoped anon client that carries
 *                          the caller's JWT in the Authorization header so RLS
 *                          enforces tenant isolation via app_metadata.tenant_id.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY ||
    !process.env.SUPABASE_ANON_KEY || !process.env.TENANT_ID) {
  throw new Error('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, TENANT_ID');
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const TENANT_ID   = process.env.TENANT_ID;

// Service client — bypasses RLS. Import script only.
const serviceClient = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

/**
 * Returns a request-scoped Supabase client authenticated as the calling user.
 * The JWT carries tenant_id in app_metadata (set by custom_access_token_hook),
 * which RLS policies read via auth.jwt() -> 'app_metadata' ->> 'tenant_id'.
 * If userToken is null (transitional — before #32d wires up auth middleware),
 * queries run as anon role and RLS returns empty results.
 */
function getClient(userToken) {
  const opts = { auth: { persistSession: false } };
  if (userToken) {
    opts.global = { headers: { Authorization: `Bearer ${userToken}` } };
  }
  return createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY, opts);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Format a date string or Date object → "MM/DD/YYYY" to match what the
 * rest of the app (dashboard, heatmap, recommendations) already expects.
 */
function toDisplayDate(val) {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d)) return String(val);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  return `${String(m).padStart(2, '0')}/${String(day).padStart(2, '0')}/${y}`;
}

/**
 * Format a date → "Week ending M/D" to match the weeklyHours key format
 * the heatmap, dashboard, and save logic all depend on.
 */
function toWeekKey(dateStr) {
  const d = new Date(dateStr);
  return `Week ending ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// ─── MAIN READ ────────────────────────────────────────────────────────────────

async function readStaffingData(userToken, _client = null) {
  const supabase = _client || getClient(userToken);
  try {

    // ── 1. Levels ─────────────────────────────────────────────────────────────
    const { data: levelsData, error: levelsErr } = await supabase
      .from('levels')
      .select('id, name, sort_order, default_cost_rate, default_bill_rate, target_billable_pct')
      .eq('tenant_id', TENANT_ID)
      .order('sort_order');
    if (levelsErr) throw levelsErr;

    const levelById = {};
    for (const l of levelsData) levelById[l.id] = l.name;

    const resourceLevels = levelsData.map(l => ({ level: l.name }));

    // ── 2. Skill Sets ─────────────────────────────────────────────────────────
    const { data: skillSetsData, error: skillSetsErr } = await supabase
      .from('skill_sets')
      .select('id, name, type')
      .eq('tenant_id', TENANT_ID);
    if (skillSetsErr) throw skillSetsErr;

    const skillSetById = {};
    for (const s of skillSetsData) skillSetById[s.id] = s;

    const skills = skillSetsData.map(s => ({ skillSet: s.name, type: s.type }));

    // ── 3. Consultants + their skill sets ────────────────────────────────────
    const { data: consultantsData, error: consultantsErr } = await supabase
      .from('consultants')
      .select('id, name, level_id, location, capacity_hours_per_week, cost_rate_override, bill_rate_override')
      .eq('tenant_id', TENANT_ID);
    if (consultantsErr) throw consultantsErr;

    const { data: cssData, error: cssErr } = await supabase
      .from('consultant_skill_sets')
      .select('consultant_id, skill_set_id')
      .eq('tenant_id', TENANT_ID);
    if (cssErr) throw cssErr;

    // Build consultant skill set map: consultantId → { practiceAreas: [], technologies: [] }
    const consultantSkillMap = {};
    for (const css of cssData) {
      if (!consultantSkillMap[css.consultant_id]) {
        consultantSkillMap[css.consultant_id] = { practiceAreas: [], technologies: [], all: [] };
      }
      const ss = skillSetById[css.skill_set_id];
      if (ss) {
        consultantSkillMap[css.consultant_id].all.push(ss.name);
        if (ss.type === 'Practice Area') consultantSkillMap[css.consultant_id].practiceAreas.push(ss.name);
        if (ss.type === 'Technology')    consultantSkillMap[css.consultant_id].technologies.push(ss.name);
      }
    }

    // Build consultant lookup maps
    const consultantById   = {};
    const consultantByName = {};
    for (const c of consultantsData) {
      const skillInfo = consultantSkillMap[c.id] || { practiceAreas: [], technologies: [], all: [] };
      // Primary skill set = first practice area (for display/matching compat with old app)
      const primarySkillSet = skillInfo.practiceAreas[0] || skillInfo.all[0] || null;
      const enriched = {
        ...c,
        levelName:      levelById[c.level_id] || null,
        skillSet:       primarySkillSet,
        allSkillSets:   skillInfo.all,
        practiceAreas:  skillInfo.practiceAreas,
        technologies:   skillInfo.technologies,
      };
      consultantById[c.id]     = enriched;
      consultantByName[c.name] = enriched;
    }

    // employees array — matches old excelReader shape
    const employees = consultantsData.map(c => ({
      employeeName: c.name,
      level:        levelById[c.level_id] || null,
    }));

    // ── 4. Projects + clients ─────────────────────────────────────────────────
    const { data: projectsData, error: projectsErr } = await supabase
      .from('projects')
      .select('id, name, status, probability_pct, start_date, end_date, client_id')
      .eq('tenant_id', TENANT_ID);
    if (projectsErr) throw projectsErr;

    const { data: clientsData, error: clientsErr } = await supabase
      .from('clients')
      .select('id, name')
      .eq('tenant_id', TENANT_ID);
    if (clientsErr) throw clientsErr;

    const clientById = {};
    for (const c of clientsData) clientById[c.id] = c.name;

    const projectById   = {};
    const projectByName = {};
    for (const p of projectsData) {
      const enriched = {
        ...p,
        clientName: p.client_id ? clientById[p.client_id] : null,
      };
      projectById[p.id]     = enriched;
      projectByName[p.name] = enriched;
    }

    // projects array — matches old excelReader shape
    const projects = projectsData.map(p => ({
      projectId:   p.id,
      projectName: p.name,
      status:      p.status,
      probability: p.probability_pct,
      clientName:  p.client_id ? clientById[p.client_id] : null,
    }));

    // ── 5. Resource Assignments ───────────────────────────────────────────────
    const { data: assignmentsData, error: assignmentsErr } = await supabase
      .from('resource_assignments')
      .select('id, consultant_id, project_id, week_ending, hours, is_billable')
      .eq('tenant_id', TENANT_ID)
      .order('consultant_id')
      .order('project_id')
      .order('week_ending');
    if (assignmentsErr) throw assignmentsErr;

    // Collect all unique week_ending dates → sorted → build weeklyHours keys
    const weekEndingDates = [...new Set(assignmentsData.map(a => a.week_ending))].sort();
    const weekKeys = weekEndingDates.map(toWeekKey);
    // Map weekKey label → ISO date string (so server.js can reverse-lookup without guessing year)
    const weekKeyToDate = Object.fromEntries(weekKeys.map((wk, i) => [wk, weekEndingDates[i]]));

    // Group assignments: consultantId+projectId → { weekKey: hours }
    const assignmentMap = {};
    for (const a of assignmentsData) {
      const key = `${a.consultant_id}|${a.project_id}`;
      if (!assignmentMap[key]) {
        assignmentMap[key] = {
          consultantId: a.consultant_id,
          projectId:    a.project_id,
          isBillable:   a.is_billable,
          weeklyHours:  Object.fromEntries(weekKeys.map(wk => [wk, 0])),
        };
      }
      const wk = toWeekKey(a.week_ending);
      assignmentMap[key].weeklyHours[wk] = a.hours;
    }

    // Build supply array — matches old excelReader shape exactly
    const supply = Object.values(assignmentMap).map(entry => {
      const consultant = consultantById[entry.consultantId];
      const project    = projectById[entry.projectId];
      return {
        employeeName:    consultant ? consultant.name      : `Unknown (${entry.consultantId})`,
        level:           consultant ? consultant.levelName : null,
        skillSet:        consultant ? consultant.skillSet  : null,
        allSkillSets:    consultant ? consultant.allSkillSets : [],
        projectAssigned: project    ? project.name         : `Unknown (${entry.projectId})`,
        projectStatus:   project    ? project.status       : null,
        isBillable:      entry.isBillable,
        weeklyHours:     entry.weeklyHours,
        // IDs preserved for write-back operations
        _consultantId:   entry.consultantId,
        _projectId:      entry.projectId,
      };
    });

    // ── 6. Needs ──────────────────────────────────────────────────────────────
    const { data: needsData, error: needsErr } = await supabase
      .from('needs')
      .select('id, project_id, level_id, hours_per_week, start_date, end_date')
      .eq('tenant_id', TENANT_ID);
    if (needsErr) throw needsErr;

    const { data: nssData, error: nssErr } = await supabase
      .from('need_skill_sets')
      .select('need_id, skill_set_id')
      .eq('tenant_id', TENANT_ID);
    if (nssErr) throw nssErr;

    // Build need skill set map: needId → { practiceAreas: [], technologies: [], all: [] }
    const needSkillMap = {};
    for (const nss of nssData) {
      if (!needSkillMap[nss.need_id]) needSkillMap[nss.need_id] = { practiceAreas: [], technologies: [], all: [] };
      const ss = skillSetById[nss.skill_set_id];
      if (ss) {
        needSkillMap[nss.need_id].all.push(ss.name);
        if (ss.type === 'Practice Area') needSkillMap[nss.need_id].practiceAreas.push(ss.name);
        if (ss.type === 'Technology')    needSkillMap[nss.need_id].technologies.push(ss.name);
      }
    }

    // demand array — matches old excelReader shape + new fields
    const demand = needsData.map(n => {
      const project   = projectById[n.project_id];
      const skillInfo = needSkillMap[n.id] || { practiceAreas: [], technologies: [], all: [] };
      const primarySkillSet = skillInfo.practiceAreas[0] || skillInfo.all[0] || null;
      return {
        projectName:    project ? project.name       : null,
        clientName:     project ? project.clientName : null,
        projectStatus:  project ? project.status     : null,
        probability:    project ? project.probability_pct : null,
        resourceLevel:  levelById[n.level_id]        || null,
        skillSet:       primarySkillSet,
        allSkillSets:   skillInfo.all,
        practiceAreas:  skillInfo.practiceAreas,
        technologies:   skillInfo.technologies,
        startDate:      toDisplayDate(n.start_date),
        endDate:        toDisplayDate(n.end_date),
        hoursPerWeek:   n.hours_per_week,
        // ID preserved for future write-back
        _needId:        n.id,
        _projectId:     n.project_id,
      };
    });

    return {
      supply,
      demand,
      employees,
      skills,
      resourceLevels,
      projects,
      // Extra context available to endpoints that want it
      _meta: {
        weekKeys,
        weekKeyToDate,
        levelById,
        skillSetById,
        consultantById,
        consultantByName,
        projectById,
        projectByName,
        tenantId: TENANT_ID,
      },
    };

  } catch (err) {
    console.error('[supabaseReader] error:', err.message);
    return { error: err.message };
  }
}

// ─── WRITE OPERATIONS ─────────────────────────────────────────────────────────

/**
 * Upsert a single resource assignment cell (used by /api/save-staffing).
 * Finds or creates the assignment row for consultant+project, then sets hours
 * for the given week.
 */
async function upsertAssignment(userToken, { consultantId, projectId, weekEnding, hours, isBillable }, _client = null) {
  const supabase = _client || getClient(userToken);

  const { error } = await supabase
    .from('resource_assignments')
    .upsert(
      {
        tenant_id:     TENANT_ID,
        consultant_id: consultantId,
        project_id:    projectId,
        week_ending:   weekEnding,
        hours,
        is_billable:   isBillable ?? true,
      },
      { onConflict: 'consultant_id,project_id,week_ending' }
    );
  if (error) throw error;
}

/**
 * Delete all assignment rows for a consultant+project combination.
 * Used by /api/supply/update delete operations.
 */
async function deleteAssignments(userToken, { consultantId, projectId }) {
  const supabase = getClient(userToken);
  const { error } = await supabase
    .from('resource_assignments')
    .delete()
    .eq('tenant_id',     TENANT_ID)
    .eq('consultant_id', consultantId)
    .eq('project_id',    projectId);
  if (error) throw error;
}

/**
 * Resolve a consultant name → id. Returns null if not found.
 */
async function resolveConsultantId(userToken, name) {
  const supabase = getClient(userToken);
  const { data, error } = await supabase
    .from('consultants')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('name', name)
    .maybeSingle();
  if (error) throw error;
  return data ? data.id : null;
}

/**
 * Resolve a project name → id. Returns null if not found.
 * Creates the project if createIfMissing = true.
 */
async function resolveProjectId(userToken, name, createIfMissing = false) {
  const supabase = getClient(userToken);
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('tenant_id', TENANT_ID)
    .eq('name', name)
    .maybeSingle();
  if (error) throw error;
  if (data) return data.id;

  if (createIfMissing) {
    const { data: created, error: createErr } = await supabase
      .from('projects')
      .insert({ tenant_id: TENANT_ID, name, status: 'Sold' })
      .select('id')
      .single();
    if (createErr) throw createErr;
    return created.id;
  }
  return null;
}

module.exports = {
  serviceClient,
  readStaffingData,
  upsertAssignment,
  deleteAssignments,
  resolveConsultantId,
  resolveProjectId,
};
