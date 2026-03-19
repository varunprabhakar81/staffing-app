'use strict';

/**
 * importRealData.js
 * Imports real staffing data from data/Staffing_Data.xlsx into data/resourcing.xlsx.
 * Updates: Employee Master, Project Master, Resource Levels, Supply tabs.
 * Demand tab is left unchanged.
 */

const ExcelJS = require('exceljs');
const path    = require('path');

const SOURCE_FILE = path.join(__dirname, 'data', 'Staffing_Data.xlsx');
const TARGET_FILE = path.join(__dirname, 'data', 'resourcing.xlsx');

// ── Week mapping: columns 14-25 in source → sequential week labels ─
const WEEK_LABELS = [
  'Week ending 3/21', 'Week ending 3/28', 'Week ending 4/4',
  'Week ending 4/11', 'Week ending 4/18', 'Week ending 4/25',
  'Week ending 5/2',  'Week ending 5/9',  'Week ending 5/16',
  'Week ending 5/23', 'Week ending 5/30', 'Week ending 6/6',
];
const WEEK_COL_START = 14; // 1-indexed, corresponds to 3/21/2026
const WEEK_COL_END   = 25; // 1-indexed, corresponds to 6/6

// ── Skill sets — assigned evenly across 25 employees ──────────────
const SKILL_SETS = [
  'NetSuite - Record to Report',
  'NetSuite - Procure to Pay',
  'NetSuite - Order to Cash',
  'NetSuite - Supply Chain',
  'Pigment',
];

// ── Resource levels ────────────────────────────────────────────────
const RESOURCE_LEVELS = [
  'Analyst', 'Consultant', 'Senior Consultant', 'Manager', 'Senior Manager',
];

// ── Cell color coding (ARGB) ───────────────────────────────────────
function cellArgb(hours) {
  if (hours === 0)  return 'FF8B0000'; // dark red — bench
  if (hours < 40)   return 'FFFFB3B3'; // pastel coral — under
  if (hours < 45)   return 'FFFFF3A3'; // pastel yellow — nominal
  if (hours === 45) return 'FFA8E6CF'; // pastel mint — full
  if (hours <= 50)  return 'FFFF9999'; // light coral — over
  return              'FFFF8A80';       // deep coral — over+
}

// ── Safely extract a cell's text/numeric value ─────────────────────
function cellText(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && v.richText) return v.richText.map(r => r.text).join('').trim();
  if (typeof v === 'object' && v.result !== undefined) return String(v.result).trim();
  if (typeof v === 'object') return ''; // formula with no result (e.g. SUM placeholders)
  return String(v).trim();
}

function cellNum(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return 0;
  if (typeof v === 'object' && v.result !== undefined) return Number(v.result) || 0;
  if (typeof v === 'object') return 0;
  return Number(v) || 0;
}

// ── Fix known data quality issues in level names ───────────────────
function fixLevel(raw) {
  const l = String(raw || '').trim();
  if (l === 'Senior Consultat') return 'Senior Consultant';
  return l || 'Analyst';
}

// ── Clear data rows (row 2 onward) from a worksheet ───────────────
function clearDataRows(sheet) {
  const last = sheet.lastRow;
  if (last && last.number > 1) {
    sheet.spliceRows(2, last.number - 1);
  }
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {

  // ── STEP 1: Parse Staffing_Data.xlsx ────────────────────────────
  console.log('Reading source:', SOURCE_FILE);
  const srcWb = new ExcelJS.Workbook();
  await srcWb.xlsx.readFile(SOURCE_FILE);
  const srcWs = srcWb.worksheets[0];
  console.log(`  Sheet: "${srcWs.name}", rows: ${srcWs.rowCount}, cols: ${srcWs.columnCount}`);

  // employees[]: { name, level, skillSet, projects: [{ name, hours:[12] }] }
  const employees  = [];
  let   currentEmp = null;

  srcWs.eachRow((row, rn) => {
    if (rn === 1) return; // skip header

    const colA = cellText(row.getCell(1)); // Employee name
    const colB = cellText(row.getCell(2)); // User Level
    const colC = cellText(row.getCell(3)); // Project name

    if (colA) {
      // ── Employee header row ──────────────────────────────────────
      currentEmp = { name: colA, level: fixLevel(colB), projects: [] };
      employees.push(currentEmp);
    } else if (currentEmp) {
      // ── Project sub-row ──────────────────────────────────────────
      const projName = colC || 'Unassigned';

      // Read hours from the 12 relevant week columns
      const hours = [];
      for (let c = WEEK_COL_START; c <= WEEK_COL_END; c++) {
        hours.push(cellNum(row.getCell(c)));
      }

      const totalHours = hours.reduce((a, b) => a + b, 0);

      // Skip truly empty rows (no project name, no hours in any column)
      if (projName === 'Unassigned' && totalHours === 0) return;

      // Merge rows that share the same project name (handles duplicate blank rows)
      const existing = currentEmp.projects.find(p => p.name === projName);
      if (existing) {
        for (let i = 0; i < 12; i++) existing.hours[i] += hours[i];
      } else {
        currentEmp.projects.push({ name: projName, hours });
      }
    }
  });

  console.log(`  Parsed ${employees.length} employees`);

  // ── STEP 2: Assign skill sets evenly ────────────────────────────
  employees.forEach((emp, i) => {
    emp.skillSet = SKILL_SETS[i % SKILL_SETS.length];
  });

  // ── STEP 3: Build supply rows & collect all project names ────────
  const supplyRows = [];
  const projectSet = new Set();

  for (const emp of employees) {
    for (const proj of emp.projects) {
      projectSet.add(proj.name);
      const weeklyHours = {};
      WEEK_LABELS.forEach((wk, i) => { weeklyHours[wk] = proj.hours[i] || 0; });
      supplyRows.push({
        employeeName:    emp.name,
        level:           emp.level,
        skillSet:        emp.skillSet,
        projectAssigned: proj.name,
        weeklyHours,
      });
    }
  }

  const allProjects = [...projectSet].sort();

  // ── STEP 4: Update resourcing.xlsx ──────────────────────────────
  console.log('\nReading target:', TARGET_FILE);
  const tgtWb = new ExcelJS.Workbook();
  await tgtWb.xlsx.readFile(TARGET_FILE);
  console.log('  Sheets found:', tgtWb.worksheets.map(s => s.name).join(', '));

  // ── Employee Master ──────────────────────────────────────────────
  const empSheet = tgtWb.getWorksheet('Employee Master');
  if (!empSheet) throw new Error('Sheet "Employee Master" not found in resourcing.xlsx');
  clearDataRows(empSheet);
  employees.forEach((emp, i) => {
    empSheet.getRow(i + 2).values = [emp.name, emp.level];
  });
  console.log(`  Employee Master: wrote ${employees.length} rows`);

  // ── Project Master ───────────────────────────────────────────────
  const projSheet = tgtWb.getWorksheet('Project Master');
  if (!projSheet) throw new Error('Sheet "Project Master" not found in resourcing.xlsx');
  clearDataRows(projSheet);
  allProjects.forEach((proj, i) => {
    const id = `P${String(i + 1).padStart(3, '0')}`;
    projSheet.getRow(i + 2).values = [id, proj];
  });
  console.log(`  Project Master:  wrote ${allProjects.length} rows`);

  // ── Resource Levels ──────────────────────────────────────────────
  const levelSheet = tgtWb.getWorksheet('Resource Levels');
  if (!levelSheet) throw new Error('Sheet "Resource Levels" not found in resourcing.xlsx');
  clearDataRows(levelSheet);
  RESOURCE_LEVELS.forEach((l, i) => {
    levelSheet.getRow(i + 2).values = [l];
  });
  console.log(`  Resource Levels: wrote ${RESOURCE_LEVELS.length} rows`);

  // ── Supply tab ───────────────────────────────────────────────────
  const supplySheet = tgtWb.getWorksheet('Supply');
  if (!supplySheet) throw new Error('Sheet "Supply" not found in resourcing.xlsx');
  clearDataRows(supplySheet);

  // Write header row
  supplySheet.getRow(1).values = [
    'Employee Name', 'Level', 'Skill Set', 'Project Assigned',
    ...WEEK_LABELS,
  ];

  // Write data rows with color coding
  supplyRows.forEach((sr, i) => {
    const rowNum = i + 2;
    const row    = supplySheet.getRow(rowNum);
    row.values   = [
      sr.employeeName, sr.level, sr.skillSet, sr.projectAssigned,
      ...WEEK_LABELS.map(wk => sr.weeklyHours[wk]),
    ];
    // Apply fill color to each week cell
    WEEK_LABELS.forEach((wk, wi) => {
      const h    = sr.weeklyHours[wk];
      const cell = row.getCell(5 + wi);
      cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: cellArgb(h) } };
    });
    row.commit();
  });
  console.log(`  Supply:          wrote ${supplyRows.length} rows`);

  // ── Save ─────────────────────────────────────────────────────────
  await tgtWb.xlsx.writeFile(TARGET_FILE);
  console.log('\n✓ Saved:', TARGET_FILE);

  // ── STEP 5: Verification summary ────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log(`Employees imported : ${employees.length}`);
  console.log(`Projects imported  : ${allProjects.length}`);
  console.log(`Supply rows created: ${supplyRows.length}`);

  console.log('\nEmployees with skill set assignments:');
  employees.forEach(e =>
    console.log(`  ${e.name.padEnd(24)} ${e.level.padEnd(20)} → ${e.skillSet}`)
  );

  console.log('\nProjects found:');
  allProjects.forEach(p => console.log(`  ${p}`));

  console.log('\nFirst 5 supply rows:');
  supplyRows.slice(0, 5).forEach(r => {
    const wks = WEEK_LABELS.slice(0, 4)
      .map(w => `${w.replace('Week ending ', '')}:${r.weeklyHours[w]}h`).join('  ');
    console.log(`  ${r.employeeName.padEnd(22)} | ${r.projectAssigned.padEnd(28)} | ${wks}`);
  });
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n✗ IMPORT FAILED:', err.message);
  process.exit(1);
});
