/**
 * import-to-supabase.js
 * Imports resourcing.xlsx into Supabase. Safe to re-run.
 * Usage: node import-to-supabase.js
 */

require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');
const path = require('path');

const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL  || 'https://pybmpknumxshailjatok.supabase.co',
  supabaseKey: process.env.SUPABASE_SERVICE_KEY,
  tenantName:  process.env.TENANT_NAME   || 'Deloitte NetSuite Practice',
  excelPath:   process.env.EXCEL_PATH    || path.join(__dirname, 'data', 'resourcing.xlsx'),
};

const LEVELS = [
  { name: 'Analyst',                             sort_order: 1, default_cost_rate: 150, default_bill_rate: 450,  target_billable_pct: 80 },
  { name: 'Consultant',                          sort_order: 2, default_cost_rate: 200, default_bill_rate: 550,  target_billable_pct: 80 },
  { name: 'Senior Consultant',                   sort_order: 3, default_cost_rate: 300, default_bill_rate: 750,  target_billable_pct: 75 },
  { name: 'Manager',                             sort_order: 4, default_cost_rate: 350, default_bill_rate: 788,  target_billable_pct: 70 },
  { name: 'Senior Manager',                      sort_order: 5, default_cost_rate: 400, default_bill_rate: 800,  target_billable_pct: 60 },
  { name: 'Partner/Principal/Managing Director', sort_order: 6, default_cost_rate: 600, default_bill_rate: 1050, target_billable_pct: 50 },
];

const LEVEL_MAP = {
  'Analyst': 'Analyst', 'Consultant': 'Consultant',
  'Senior Consultant': 'Senior Consultant', 'Manager': 'Manager',
  'Senior Manager': 'Senior Manager', 'Partner/MD': 'Partner/Principal/Managing Director',
};

const PROBABILITY_DEFAULTS = { 'Proposed': 25, 'Verbal Commit': 75, 'Sold': 100 };

const NON_BILLABLE_PROJECTS = new Set([
  'Unassigned','Assessment','Evaluation','ERP Evaluation','L2C Assessment','Secondment'
]);
const NON_BILLABLE_DEMAND_PROJECTS = new Set(['Pre-Sales Support']);

function isBillable(name, isDemand) {
  return isDemand ? !NON_BILLABLE_DEMAND_PROJECTS.has(name) : !NON_BILLABLE_PROJECTS.has(name);
}

function log(msg)     { console.log(`  ✓ ${msg}`); }
function section(msg) { console.log(`\n── ${msg}`); }
function warn(msg)    { console.warn(`  ⚠ ${msg}`); }

function parseSkillSet(raw) {
  if (!raw) return null;
  const idx = raw.indexOf(' - ');
  if (idx === -1) return { technology: null, practiceArea: raw.trim() };
  return { technology: raw.slice(0, idx).trim(), practiceArea: raw.slice(idx + 3).trim() };
}

function parseWeekHeader(header, year = 2026) {
  const m = header.match(/(\d+)\/(\d+)/);
  if (!m) return null;
  return new Date(year, parseInt(m[1]) - 1, parseInt(m[2])).toISOString().split('T')[0];
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const m = String(val).match(/(\d+)\/(\d+)\/(\d+)/);
  return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : null;
}

function splitClientProject(raw) {
  const str = String(raw).trim();
  // handle em-dash (–) and regular dash
  const sep = str.includes(' \u2013 ') ? ' \u2013 ' : str.includes(' - ') ? ' - ' : null;
  if (!sep) return { client: str, project: str };
  const parts = str.split(sep);
  return { client: parts[0].trim(), project: parts[1].trim() };
}

async function dbInsert(supabase, tenantId, table, rows) {
  if (!rows.length) { warn(`No rows for ${table} — skipping`); return []; }
  const { data, error } = await supabase.from(table).insert(rows.map(r => ({ ...r, tenant_id: tenantId }))).select();
  if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  log(`Inserted ${data.length} rows → ${table}`);
  return data;
}

async function main() {
  console.log('\n🚀 Staffing Intelligence — Supabase Import');
  console.log(`   Tenant : ${CONFIG.tenantName}`);
  console.log(`   Excel  : ${CONFIG.excelPath}`);
  console.log(`   DB     : ${CONFIG.supabaseUrl}`);

  const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

  section('Loading Excel');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(CONFIG.excelPath);
  log('Workbook loaded');

  const sheetSupply    = wb.getWorksheet('Supply');
  const sheetDemand    = wb.getWorksheet('Demand');
  const sheetEmployees = wb.getWorksheet('Employee Master');
  const sheetProjects  = wb.getWorksheet('Project Master');
  if (!sheetSupply || !sheetDemand || !sheetEmployees || !sheetProjects)
    throw new Error('Missing sheet. Expected: Supply, Demand, Employee Master, Project Master');

  // Tenant
  section('Tenant');
  let tenantId;
  const { data: existing, error: fe } = await supabase.from('tenants').select('id').eq('name', CONFIG.tenantName);
  if (fe) throw new Error(fe.message);

  if (existing && existing.length > 0) {
    tenantId = existing[0].id;
    log(`Found existing tenant: ${tenantId}`);
    section('Clearing existing tenant data');
    for (const t of ['need_skill_sets','needs','resource_assignments','consultant_skill_sets','consultants','projects','clients','skill_sets','levels']) {
      const { error } = await supabase.from(t).delete().eq('tenant_id', tenantId);
      if (error) throw new Error(`Clear ${t}: ${error.message}`);
      log(`Cleared ${t}`);
    }
  } else {
    const { data, error } = await supabase.from('tenants').insert({ name: CONFIG.tenantName }).select().single();
    if (error) throw new Error(error.message);
    tenantId = data.id;
    log(`Created tenant: ${tenantId}`);
  }

  // Levels
  section('Levels');
  const insertedLevels = await dbInsert(supabase, tenantId, 'levels', LEVELS);
  const levelMap = Object.fromEntries(insertedLevels.map(l => [l.name, l.id]));

  // Skill Sets
  section('Skill Sets');
  const rawSkills = new Set();
  sheetSupply.eachRow((r,i) => { if (i>1 && r.getCell(3).value) rawSkills.add(String(r.getCell(3).value).trim()); });
  sheetDemand.eachRow((r,i) => { if (i>1 && r.getCell(3).value) rawSkills.add(String(r.getCell(3).value).trim()); });

  const technologies = new Set(), practiceAreas = new Set(), skillParseMap = {};
  for (const raw of rawSkills) {
    const p = parseSkillSet(raw);
    skillParseMap[raw] = p;
    if (p.technology)   technologies.add(p.technology);
    if (p.practiceArea) practiceAreas.add(p.practiceArea);
  }
  const insertedSkillSets = await dbInsert(supabase, tenantId, 'skill_sets', [
    ...Array.from(technologies).map(name  => ({ name, type: 'Technology' })),
    ...Array.from(practiceAreas).map(name => ({ name, type: 'Practice Area' })),
  ]);
  const skillSetMap = Object.fromEntries(insertedSkillSets.map(s => [s.name, s.id]));

  // Clients
  section('Clients');
  const clientNames = new Set();
  sheetDemand.eachRow((r,i) => { if (i>1 && r.getCell(1).value) clientNames.add(splitClientProject(String(r.getCell(1).value)).client); });
  const insertedClients = await dbInsert(supabase, tenantId, 'clients', Array.from(clientNames).map(name => ({ name })));
  const clientMap = Object.fromEntries(insertedClients.map(c => [c.name, c.id]));

  // Projects
  section('Projects');
  const allProjects = new Map();
  sheetProjects.eachRow((r,i) => {
    if (i===1 || !r.getCell(2).value) return;
    const n = String(r.getCell(2).value).trim();
    allProjects.set(n, { name: n, client_id: null, status: 'Sold', probability_pct: 100, is_billable: isBillable(n, false) });
  });
  sheetDemand.eachRow((r,i) => {
    if (i===1 || !r.getCell(1).value) return;
    const { client, project } = splitClientProject(String(r.getCell(1).value));
    if (!allProjects.has(project))
      allProjects.set(project, { name: project, client_id: clientMap[client]||null, status: 'Proposed', probability_pct: 25, is_billable: isBillable(project, true) });
  });
  const insertedProjects = await dbInsert(supabase, tenantId, 'projects', Array.from(allProjects.values()));
  const projectMap = Object.fromEntries(insertedProjects.map(p => [p.name, p.id]));

  // Consultants
  section('Consultants');
  const consultantRows = [];
  sheetEmployees.eachRow((r,i) => {
    if (i===1 || !r.getCell(1).value) return;
    const name  = String(r.getCell(1).value).trim();
    const level = String(r.getCell(2).value||'').trim();
    consultantRows.push({ name, level_id: levelMap[LEVEL_MAP[level]||level]||null, location: null, cost_rate_override: null, bill_rate_override: null, capacity_hours_per_week: 45 });
  });
  const insertedConsultants = await dbInsert(supabase, tenantId, 'consultants', consultantRows);
  const consultantMap = Object.fromEntries(insertedConsultants.map(c => [c.name, c.id]));

  // Consultant Skill Sets
  section('Consultant Skill Sets');
  const cSkills = {};
  sheetSupply.eachRow((r,i) => {
    if (i===1) return;
    const name = r.getCell(1).value, raw = r.getCell(3).value;
    if (!name||!raw) return;
    const cId = consultantMap[String(name).trim()], p = skillParseMap[String(raw).trim()];
    if (!cId||!p) return;
    if (!cSkills[cId]) cSkills[cId] = new Set();
    if (p.technology   && skillSetMap[p.technology])   cSkills[cId].add(skillSetMap[p.technology]);
    if (p.practiceArea && skillSetMap[p.practiceArea]) cSkills[cId].add(skillSetMap[p.practiceArea]);
  });
  const cssRows = [];
  for (const [cId, sIds] of Object.entries(cSkills)) for (const sId of sIds) cssRows.push({ consultant_id: cId, skill_set_id: sId });
  await dbInsert(supabase, tenantId, 'consultant_skill_sets', cssRows);

  // Resource Assignments
  section('Resource Assignments');
  const weekCols = [];
  sheetSupply.getRow(1).eachCell((cell, col) => {
    const h = cell.value ? String(cell.value).trim() : null;
    if (h && h.startsWith('Week ending')) { const d = parseWeekHeader(h); if (d) weekCols.push({ col, weekEnding: d }); }
  });
  log(`Found ${weekCols.length} week columns`);

  const assignmentRows = [];
  sheetSupply.eachRow((r,i) => {
    if (i===1) return;
    const name = r.getCell(1).value, proj = r.getCell(4).value;
    if (!name||!proj) return;
    const cId = consultantMap[String(name).trim()], pName = String(proj).trim(), pId = projectMap[pName];
    if (!cId) { warn(`Unknown consultant: ${name}`); return; }
    if (!pId) { warn(`Unknown project: ${pName}`); return; }
    for (const { col, weekEnding } of weekCols) {
      const hours = parseFloat(r.getCell(col).value)||0;
      if (hours > 0) assignmentRows.push({ consultant_id: cId, project_id: pId, week_ending: weekEnding, hours, is_billable: isBillable(pName, false) });
    }
  });
  await dbInsert(supabase, tenantId, 'resource_assignments', assignmentRows);

  // Needs
  section('Needs');
  const needRows = [], needSkillData = [];
  sheetDemand.eachRow((r,i) => {
    if (i===1||!r.getCell(1).value) return;
    const { project } = splitClientProject(String(r.getCell(1).value));
    const pId = projectMap[project];
    if (!pId) { warn(`Unknown project in Demand: ${project}`); return; }
    const level = String(r.getCell(2).value||'').trim();
    needRows.push({ project_id: pId, level_id: levelMap[LEVEL_MAP[level]||level]||null, hours_per_week: parseFloat(r.getCell(6).value)||0, start_date: parseDate(r.getCell(4).value), end_date: parseDate(r.getCell(5).value) });
    const raw = r.getCell(3).value;
    needSkillData.push(raw ? skillParseMap[String(raw).trim()] : null);
  });
  const insertedNeeds = await dbInsert(supabase, tenantId, 'needs', needRows);

  // Need Skill Sets
  section('Need Skill Sets');
  const nssRows = [];
  for (let i=0; i<insertedNeeds.length; i++) {
    const p = needSkillData[i]; if (!p) continue;
    const nId = insertedNeeds[i].id;
    if (p.technology   && skillSetMap[p.technology])   nssRows.push({ need_id: nId, skill_set_id: skillSetMap[p.technology] });
    if (p.practiceArea && skillSetMap[p.practiceArea]) nssRows.push({ need_id: nId, skill_set_id: skillSetMap[p.practiceArea] });
  }
  await dbInsert(supabase, tenantId, 'need_skill_sets', nssRows);

  console.log('\n✅ Import complete!\n');
  console.log(`   Tenant ID    : ${tenantId}`);
  console.log(`   Levels       : ${insertedLevels.length}`);
  console.log(`   Skill Sets   : ${insertedSkillSets.length}`);
  console.log(`   Clients      : ${insertedClients.length}`);
  console.log(`   Projects     : ${insertedProjects.length}`);
  console.log(`   Consultants  : ${insertedConsultants.length}`);
  console.log(`   Assignments  : ${assignmentRows.length}`);
  console.log(`   Needs        : ${insertedNeeds.length}`);
  console.log(`\n   ⚠ Save this Tenant ID — needed for #31:`);
  console.log(`   ${tenantId}\n`);
}

main().catch(err => { console.error('\n❌ Import failed:', err.message); process.exit(1); });
