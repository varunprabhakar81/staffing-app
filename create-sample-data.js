const ExcelJS = require('exceljs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, 'data', 'resourcing.xlsx');

// ── Master data ────────────────────────────────────────────────────────────

const LEVELS = [
  'Analyst',
  'Consultant',
  'Senior Consultant',
  'Manager',
  'Senior Manager',
  'Partner/MD',
];

const SKILL_SETS = [
  'NetSuite - Record to Report',
  'NetSuite - Procure to Pay',
  'NetSuite - Order to Cash',
  'NetSuite - Supply Chain',
];

const employees = [
  // Partner/MD
  { name: 'Sarah Mitchell',    level: 'Partner/MD' },
  // Senior Manager
  { name: 'James Okafor',      level: 'Senior Manager' },
  { name: 'Rachel Torres',     level: 'Senior Manager' },
  // Manager
  { name: 'David Chen',        level: 'Manager' },
  { name: 'Priya Sharma',      level: 'Manager' },
  { name: 'Marcus Webb',       level: 'Manager' },
  // Senior Consultant
  { name: 'Luke Bennett',      level: 'Senior Consultant' },
  { name: 'Nina Patel',        level: 'Senior Consultant' },
  { name: 'Carlos Rivera',     level: 'Senior Consultant' },
  // Consultant
  { name: 'Emily Walsh',       level: 'Consultant' },
  { name: 'Tom Nguyen',        level: 'Consultant' },
  { name: 'Aisha Kamara',      level: 'Consultant' },
  // Analyst
  { name: 'Ben Foster',        level: 'Analyst' },
  { name: 'Maya Johansson',    level: 'Analyst' },
  { name: "Ryan O'Brien",      level: 'Analyst' },
];

// Weekly columns: every Friday from 3/21 to 6/27 (2026) — 15 weeks
const WEEKS = [
  '3/21', '3/28', '4/4',  '4/11', '4/18', '4/25',
  '5/2',  '5/9',  '5/16', '5/23', '5/30',
  '6/6',  '6/13', '6/20', '6/27',
];

// helper: constant hours across all 15 weeks
const w = (h) => Array(15).fill(h);

// helper: hours that ramp up mid-engagement (first n weeks at lo, rest at hi)
const ramp = (lo, hi, n) => [...Array(n).fill(lo), ...Array(15 - n).fill(hi)];

// helper: hours that taper off (first n weeks at hi, rest at lo)
const taper = (hi, lo, n) => [...Array(n).fill(hi), ...Array(15 - n).fill(lo)];

// Supply rows — each employee appears on 2+ rows; total ~45 h/week per employee
// Columns: name, skillSet, project, hours[15]
const supplyRows = [
  // ── Sarah Mitchell (Partner/MD) — 20 + 25 = 45 ───────────────────────────
  { name: 'Sarah Mitchell',  skillSet: 'NetSuite - Record to Report',
    project: 'Harrington Manufacturing – ERP Implementation',   hours: w(20) },
  { name: 'Sarah Mitchell',  skillSet: 'NetSuite - Record to Report',
    project: 'Crestline Energy – NetSuite ERP Assessment',       hours: w(25) },

  // ── James Okafor (Senior Manager) — 30 + 15 = 45 ────────────────────────
  { name: 'James Okafor',    skillSet: 'NetSuite - Supply Chain',
    project: 'Pinnacle Logistics – Supply Chain Rollout',        hours: w(30) },
  { name: 'James Okafor',    skillSet: 'NetSuite - Supply Chain',
    project: 'Internal – Practice Development',                  hours: w(15) },

  // ── Rachel Torres (Senior Manager) — 35 + 10 = 45 ───────────────────────
  { name: 'Rachel Torres',   skillSet: 'NetSuite - Order to Cash',
    project: 'Clearwater Retail – O2C Optimization',             hours: w(35) },
  { name: 'Rachel Torres',   skillSet: 'NetSuite - Order to Cash',
    project: 'Vantage Distribution – Full Suite Implementation', hours: w(10) },

  // ── David Chen (Manager) — 40 + 5 = 45 ──────────────────────────────────
  { name: 'David Chen',      skillSet: 'NetSuite - Procure to Pay',
    project: 'Harrington Manufacturing – ERP Implementation',    hours: w(40) },
  { name: 'David Chen',      skillSet: 'NetSuite - Procure to Pay',
    project: 'Summit Healthcare – P2P Upgrade',                  hours: w(5) },

  // ── Priya Sharma (Manager) — 40 + 5 = 45 ────────────────────────────────
  { name: 'Priya Sharma',    skillSet: 'NetSuite - Record to Report',
    project: 'Meridian Financial – R2R Consolidation',           hours: w(40) },
  { name: 'Priya Sharma',    skillSet: 'NetSuite - Record to Report',
    project: 'Crestline Energy – NetSuite ERP Assessment',       hours: w(5) },

  // ── Marcus Webb (Manager) — 25 + 20 = 45 ────────────────────────────────
  { name: 'Marcus Webb',     skillSet: 'NetSuite - Order to Cash',
    project: 'Vantage Distribution – Full Suite Implementation', hours: w(25) },
  { name: 'Marcus Webb',     skillSet: 'NetSuite - Supply Chain',
    project: 'Pinnacle Logistics – Supply Chain Rollout',        hours: w(20) },

  // ── Luke Bennett (Senior Consultant) — 30 + 15 = 45 ─────────────────────
  { name: 'Luke Bennett',    skillSet: 'NetSuite - Supply Chain',
    project: 'Pinnacle Logistics – Supply Chain Rollout',        hours: w(30) },
  { name: 'Luke Bennett',    skillSet: 'NetSuite - Supply Chain',
    project: 'Vantage Distribution – Full Suite Implementation', hours: w(15) },

  // ── Nina Patel (Senior Consultant) — 35 + 10 = 45 ───────────────────────
  { name: 'Nina Patel',      skillSet: 'NetSuite - Order to Cash',
    project: 'Clearwater Retail – O2C Optimization',             hours: w(35) },
  { name: 'Nina Patel',      skillSet: 'NetSuite - Order to Cash',
    project: 'Harrington Manufacturing – ERP Implementation',    hours: w(10) },

  // ── Carlos Rivera (Senior Consultant) — 40 + 5 = 45 ─────────────────────
  { name: 'Carlos Rivera',   skillSet: 'NetSuite - Procure to Pay',
    project: 'Summit Healthcare – P2P Upgrade',                  hours: w(40) },
  { name: 'Carlos Rivera',   skillSet: 'NetSuite - Procure to Pay',
    project: 'Internal – Practice Development',                  hours: w(5) },

  // ── Emily Walsh (Consultant) — 40 + taper(5→0) ≈ 45 early weeks ─────────
  { name: 'Emily Walsh',     skillSet: 'NetSuite - Record to Report',
    project: 'Meridian Financial – R2R Consolidation',           hours: w(40) },
  { name: 'Emily Walsh',     skillSet: 'NetSuite - Record to Report',
    project: 'Harrington Manufacturing – ERP Implementation',    hours: taper(5, 0, 8) },

  // ── Tom Nguyen (Consultant) — 40 + 5 = 45 ───────────────────────────────
  { name: 'Tom Nguyen',      skillSet: 'NetSuite - Supply Chain',
    project: 'Pinnacle Logistics – Supply Chain Rollout',        hours: w(40) },
  { name: 'Tom Nguyen',      skillSet: 'NetSuite - Supply Chain',
    project: 'Internal – Practice Development',                  hours: w(5) },

  // ── Aisha Kamara (Consultant) — 30 + 15 = 45 ────────────────────────────
  { name: 'Aisha Kamara',    skillSet: 'NetSuite - Order to Cash',
    project: 'Clearwater Retail – O2C Optimization',             hours: w(30) },
  { name: 'Aisha Kamara',    skillSet: 'NetSuite - Order to Cash',
    project: 'Vantage Distribution – Full Suite Implementation', hours: w(15) },

  // ── Ben Foster (Analyst) — 40 + 5 = 45 ──────────────────────────────────
  { name: 'Ben Foster',      skillSet: 'NetSuite - Procure to Pay',
    project: 'Summit Healthcare – P2P Upgrade',                  hours: w(40) },
  { name: 'Ben Foster',      skillSet: 'NetSuite - Procure to Pay',
    project: 'Harrington Manufacturing – ERP Implementation',    hours: w(5) },

  // ── Maya Johansson (Analyst) — 40 + ramp(5→0) ≈ 45 early weeks ──────────
  { name: 'Maya Johansson',  skillSet: 'NetSuite - Record to Report',
    project: 'Meridian Financial – R2R Consolidation',           hours: w(40) },
  { name: 'Maya Johansson',  skillSet: 'NetSuite - Order to Cash',
    project: 'Clearwater Retail – O2C Optimization',             hours: taper(5, 0, 6) },

  // ── Ryan O'Brien (Analyst) — 40 + 5 = 45 ────────────────────────────────
  { name: "Ryan O'Brien",    skillSet: 'NetSuite - Supply Chain',
    project: 'Pinnacle Logistics – Supply Chain Rollout',        hours: w(40) },
  { name: "Ryan O'Brien",    skillSet: 'NetSuite - Order to Cash',
    project: 'Vantage Distribution – Full Suite Implementation', hours: w(5) },
];

// Needs — 8 open roles
const needsData = [
  { project: 'Harrington Manufacturing – ERP Implementation',   level: 'Senior Consultant', skillSet: 'NetSuite - Record to Report',  startDate: '01/04/2026', endDate: '30/06/2026' },
  { project: 'Clearwater Retail – O2C Optimization',            level: 'Consultant',         skillSet: 'NetSuite - Order to Cash',     startDate: '01/04/2026', endDate: '31/05/2026' },
  { project: 'Pinnacle Logistics – Supply Chain Rollout',       level: 'Analyst',            skillSet: 'NetSuite - Supply Chain',      startDate: '21/03/2026', endDate: '27/06/2026' },
  { project: 'Meridian Financial – R2R Consolidation',          level: 'Manager',            skillSet: 'NetSuite - Record to Report',  startDate: '01/05/2026', endDate: '31/07/2026' },
  { project: 'Summit Healthcare – P2P Upgrade',                 level: 'Senior Consultant',  skillSet: 'NetSuite - Procure to Pay',    startDate: '15/04/2026', endDate: '15/07/2026' },
  { project: 'Vantage Distribution – Full Suite Implementation',level: 'Consultant',         skillSet: 'NetSuite - Procure to Pay',    startDate: '01/04/2026', endDate: '30/06/2026' },
  { project: 'Apex Pharma – NetSuite ERP Assessment',           level: 'Senior Manager',     skillSet: 'NetSuite - Record to Report',  startDate: '15/05/2026', endDate: '31/08/2026' },
  { project: 'Internal – Pre-Sales Support',                    level: 'Analyst',            skillSet: 'NetSuite - Order to Cash',     startDate: '21/03/2026', endDate: '30/05/2026' },
];

// ── Styling helpers ─────────────────────────────────────────────────────────

const BLUE   = 'FF2F5496';
const STRIPE = 'FFE9EFF7';
const YELLOW = 'FFFFF2CC';
const GREY   = 'FFD9D9D9';

function styleHeader(row) {
  row.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
  });
  row.height = 30;
}

function stripeRow(row) {
  if (row.number % 2 === 0) {
    row.eachCell({ includeEmpty: true }, cell => {
      if (!cell.fill || cell.fill.fgColor?.argb === undefined ||
          cell.fill.fgColor.argb === 'FF000000') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
      }
    });
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function createResourcingFile() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Staffing App';
  workbook.created = new Date();

  // ── Tab 1: Employees ──────────────────────────────────────────────────────
  const empSheet = workbook.addWorksheet('Employees');
  empSheet.columns = [
    { header: 'Employee Name', key: 'name',  width: 24 },
    { header: 'Level',         key: 'level', width: 20 },
  ];
  styleHeader(empSheet.getRow(1));
  empSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const emp of employees) {
    const row = empSheet.addRow(emp);
    stripeRow(row);
  }

  // ── Tab 2: Skills ─────────────────────────────────────────────────────────
  const skillSheet = workbook.addWorksheet('Skills');
  skillSheet.columns = [
    { header: 'Skill Set', key: 'skillSet', width: 36 },
  ];
  styleHeader(skillSheet.getRow(1));
  skillSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const s of SKILL_SETS) {
    const row = skillSheet.addRow({ skillSet: s });
    stripeRow(row);
  }

  // ── Tab 3: Supply ─────────────────────────────────────────────────────────
  const supplySheet = workbook.addWorksheet('Supply');
  supplySheet.columns = [
    { header: 'Employee Name',    key: 'name',     width: 24 },
    { header: 'Skill Set',        key: 'skillSet', width: 34 },
    { header: 'Project Assigned', key: 'project',  width: 48 },
    ...WEEKS.map(wk => ({
      header: `Week ending ${wk}`,
      key:    `w_${wk.replace('/', '_')}`,
      width:  14,
    })),
  ];
  styleHeader(supplySheet.getRow(1));
  supplySheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];

  for (const sr of supplyRows) {
    const rowData = { name: sr.name, skillSet: sr.skillSet, project: sr.project };
    WEEKS.forEach((wk, i) => { rowData[`w_${wk.replace('/', '_')}`] = sr.hours[i]; });

    const row = supplySheet.addRow(rowData);

    // Colour weekly cells
    WEEKS.forEach((wk, i) => {
      const cell = row.getCell(`w_${wk.replace('/', '_')}`);
      cell.alignment = { horizontal: 'center' };
      if (sr.hours[i] === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
      } else if (sr.hours[i] < 40) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      }
    });

    // Stripe fixed columns only
    if (row.number % 2 === 0) {
      ['name', 'skillSet', 'project'].forEach(key => {
        row.getCell(key).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
      });
    }
  }

  // ── Tab 4: Needs ──────────────────────────────────────────────────────────
  const needsSheet = workbook.addWorksheet('Needs');
  needsSheet.columns = [
    { header: 'Project/Client Name',  key: 'project',   width: 48 },
    { header: 'Resource Level',       key: 'level',     width: 20 },
    { header: 'Resource Skill Set',   key: 'skillSet',  width: 34 },
    { header: 'Start Date',           key: 'startDate', width: 14 },
    { header: 'End Date',             key: 'endDate',   width: 14 },
  ];
  styleHeader(needsSheet.getRow(1));
  needsSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const need of needsData) {
    const row = needsSheet.addRow(need);
    row.getCell('startDate').alignment = { horizontal: 'center' };
    row.getCell('endDate').alignment   = { horizontal: 'center' };
    stripeRow(row);
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  await workbook.xlsx.writeFile(OUTPUT_PATH);
  console.log(`Created: ${OUTPUT_PATH}`);
}

createResourcingFile().catch(err => {
  console.error('Failed to create resourcing.xlsx:', err);
  process.exit(1);
});
