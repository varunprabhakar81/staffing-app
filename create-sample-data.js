const ExcelJS = require('exceljs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, 'data', 'resourcing.xlsx');

// ── Master data ────────────────────────────────────────────────────────────

// Employee Master: Col A = Emp ID (VLOOKUP key), Col B = Employee Name, Col C = Level
const employees = [
  { id: 'E01', name: 'Sarah Mitchell',  level: 'Partner/MD'        },
  { id: 'E02', name: 'James Okafor',    level: 'Senior Manager'     },
  { id: 'E03', name: 'Rachel Torres',   level: 'Senior Manager'     },
  { id: 'E04', name: 'David Chen',      level: 'Manager'            },
  { id: 'E05', name: 'Priya Sharma',    level: 'Manager'            },
  { id: 'E06', name: 'Marcus Webb',     level: 'Manager'            },
  { id: 'E07', name: 'Luke Bennett',    level: 'Senior Consultant'  },
  { id: 'E08', name: 'Nina Patel',      level: 'Senior Consultant'  },
  { id: 'E09', name: 'Carlos Rivera',   level: 'Senior Consultant'  },
  { id: 'E10', name: 'Emily Walsh',     level: 'Consultant'         },
  { id: 'E11', name: 'Tom Nguyen',      level: 'Consultant'         },
  { id: 'E12', name: 'Aisha Kamara',    level: 'Consultant'         },
  { id: 'E13', name: 'Ben Foster',      level: 'Analyst'            },
  { id: 'E14', name: 'Maya Johansson',  level: 'Analyst'            },
  { id: 'E15', name: "Ryan O'Brien",    level: 'Analyst'            },
];

// Skills Master: Col A = Skill ID (VLOOKUP key), Col B = Skill Set
const skills = [
  { id: 'S01', skillSet: 'NetSuite - Record to Report' },
  { id: 'S02', skillSet: 'NetSuite - Procure to Pay'   },
  { id: 'S03', skillSet: 'NetSuite - Order to Cash'    },
  { id: 'S04', skillSet: 'NetSuite - Supply Chain'     },
];

// Resource Levels: Col A = Level (single column, used as VLOOKUP key in Demand)
const resourceLevels = [
  'Analyst',
  'Consultant',
  'Senior Consultant',
  'Manager',
  'Senior Manager',
  'Partner/MD',
];

// Lookup helpers (for VLOOKUP result caching)
const empById   = Object.fromEntries(employees.map(e => [e.id, e]));
const skillById = Object.fromEntries(skills.map(s => [s.id, s]));

// Weekly columns: every Friday from 3/21 to 6/27 (2026) — 15 weeks
const WEEKS = [
  '3/21', '3/28', '4/4',  '4/11', '4/18', '4/25',
  '5/2',  '5/9',  '5/16', '5/23', '5/30',
  '6/6',  '6/13', '6/20', '6/27',
];

const w     = (h)         => Array(15).fill(h);
const taper = (hi, lo, n) => [...Array(n).fill(hi), ...Array(15 - n).fill(lo)];

// Supply rows
// Emp ID (A) → VLOOKUP → Employee Name (B)
// Skill ID (C) → VLOOKUP → Skill Set (D)
// Project Assigned (E), weekly hours (F+)
const supplyRows = [
  // Sarah Mitchell (E01) — 20 + 25 = 45
  { empId: 'E01', skillId: 'S01', project: 'Harrington Manufacturing – ERP Implementation',   hours: w(20) },
  { empId: 'E01', skillId: 'S01', project: 'Crestline Energy – NetSuite ERP Assessment',       hours: w(25) },
  // James Okafor (E02) — 30 + 15 = 45
  { empId: 'E02', skillId: 'S04', project: 'Pinnacle Logistics – Supply Chain Rollout',        hours: w(30) },
  { empId: 'E02', skillId: 'S04', project: 'Internal – Practice Development',                  hours: w(15) },
  // Rachel Torres (E03) — 35 + 10 = 45
  { empId: 'E03', skillId: 'S03', project: 'Clearwater Retail – O2C Optimization',             hours: w(35) },
  { empId: 'E03', skillId: 'S03', project: 'Vantage Distribution – Full Suite Implementation', hours: w(10) },
  // David Chen (E04) — 40 + 5 = 45
  { empId: 'E04', skillId: 'S02', project: 'Harrington Manufacturing – ERP Implementation',    hours: w(40) },
  { empId: 'E04', skillId: 'S02', project: 'Summit Healthcare – P2P Upgrade',                  hours: w(5)  },
  // Priya Sharma (E05) — 40 + 5 = 45
  { empId: 'E05', skillId: 'S01', project: 'Meridian Financial – R2R Consolidation',           hours: w(40) },
  { empId: 'E05', skillId: 'S01', project: 'Crestline Energy – NetSuite ERP Assessment',       hours: w(5)  },
  // Marcus Webb (E06) — 25 + 20 = 45
  { empId: 'E06', skillId: 'S03', project: 'Vantage Distribution – Full Suite Implementation', hours: w(25) },
  { empId: 'E06', skillId: 'S04', project: 'Pinnacle Logistics – Supply Chain Rollout',        hours: w(20) },
  // Luke Bennett (E07) — 30 + 15 = 45
  { empId: 'E07', skillId: 'S04', project: 'Pinnacle Logistics – Supply Chain Rollout',        hours: w(30) },
  { empId: 'E07', skillId: 'S04', project: 'Vantage Distribution – Full Suite Implementation', hours: w(15) },
  // Nina Patel (E08) — 35 + 10 = 45
  { empId: 'E08', skillId: 'S03', project: 'Clearwater Retail – O2C Optimization',             hours: w(35) },
  { empId: 'E08', skillId: 'S03', project: 'Harrington Manufacturing – ERP Implementation',    hours: w(10) },
  // Carlos Rivera (E09) — 40 + 5 = 45
  { empId: 'E09', skillId: 'S02', project: 'Summit Healthcare – P2P Upgrade',                  hours: w(40) },
  { empId: 'E09', skillId: 'S02', project: 'Internal – Practice Development',                  hours: w(5)  },
  // Emily Walsh (E10) — 40 + taper = ~45 early weeks
  { empId: 'E10', skillId: 'S01', project: 'Meridian Financial – R2R Consolidation',           hours: w(40) },
  { empId: 'E10', skillId: 'S01', project: 'Harrington Manufacturing – ERP Implementation',    hours: taper(5, 0, 8) },
  // Tom Nguyen (E11) — 40 + 5 = 45
  { empId: 'E11', skillId: 'S04', project: 'Pinnacle Logistics – Supply Chain Rollout',        hours: w(40) },
  { empId: 'E11', skillId: 'S04', project: 'Internal – Practice Development',                  hours: w(5)  },
  // Aisha Kamara (E12) — 30 + 15 = 45
  { empId: 'E12', skillId: 'S03', project: 'Clearwater Retail – O2C Optimization',             hours: w(30) },
  { empId: 'E12', skillId: 'S03', project: 'Vantage Distribution – Full Suite Implementation', hours: w(15) },
  // Ben Foster (E13) — 40 + 5 = 45
  { empId: 'E13', skillId: 'S02', project: 'Summit Healthcare – P2P Upgrade',                  hours: w(40) },
  { empId: 'E13', skillId: 'S02', project: 'Harrington Manufacturing – ERP Implementation',    hours: w(5)  },
  // Maya Johansson (E14) — 40 + taper = ~45 early weeks
  { empId: 'E14', skillId: 'S01', project: 'Meridian Financial – R2R Consolidation',           hours: w(40) },
  { empId: 'E14', skillId: 'S03', project: 'Clearwater Retail – O2C Optimization',             hours: taper(5, 0, 6) },
  // Ryan O'Brien (E15) — 40 + 5 = 45
  { empId: 'E15', skillId: 'S04', project: 'Pinnacle Logistics – Supply Chain Rollout',        hours: w(40) },
  { empId: 'E15', skillId: 'S03', project: 'Vantage Distribution – Full Suite Implementation', hours: w(5)  },
];

// Demand — 8 open roles
// levelKey: level text stored as VLOOKUP key against Resource Levels col A
// skillId: Skill ID stored as VLOOKUP key against Skills Master col A
const demandData = [
  { project: 'Harrington Manufacturing – ERP Implementation',    levelKey: 'Senior Consultant', skillId: 'S01', startDate: '04/01/2026', endDate: '06/30/2026' },
  { project: 'Clearwater Retail – O2C Optimization',             levelKey: 'Consultant',         skillId: 'S03', startDate: '04/01/2026', endDate: '05/31/2026' },
  { project: 'Pinnacle Logistics – Supply Chain Rollout',        levelKey: 'Analyst',            skillId: 'S04', startDate: '03/21/2026', endDate: '06/27/2026' },
  { project: 'Meridian Financial – R2R Consolidation',           levelKey: 'Manager',            skillId: 'S01', startDate: '05/01/2026', endDate: '07/31/2026' },
  { project: 'Summit Healthcare – P2P Upgrade',                  levelKey: 'Senior Consultant',  skillId: 'S02', startDate: '04/15/2026', endDate: '07/15/2026' },
  { project: 'Vantage Distribution – Full Suite Implementation', levelKey: 'Consultant',         skillId: 'S02', startDate: '04/01/2026', endDate: '06/30/2026' },
  { project: 'Apex Pharma – NetSuite ERP Assessment',            levelKey: 'Senior Manager',     skillId: 'S01', startDate: '05/15/2026', endDate: '08/31/2026' },
  { project: 'Internal – Pre-Sales Support',                     levelKey: 'Analyst',            skillId: 'S03', startDate: '03/21/2026', endDate: '05/30/2026' },
];

// ── Styling helpers ─────────────────────────────────────────────────────────

const BLUE   = 'FF2F5496';
const STRIPE = 'FFE9EFF7';
const YELLOW = 'FFFFF2CC';
const GREY   = 'FFD9D9D9';
const SILVER = 'FFF2F2F2'; // key/input columns

function styleHeader(row) {
  row.eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
  });
  row.height = 30;
}

function stripeRow(row, cols) {
  if (row.number % 2 === 0) {
    (cols || []).forEach(key => {
      const cell = row.getCell(key);
      if (!cell.fill || !cell.fill.fgColor || cell.fill.fgColor.argb === 'FF000000') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE } };
      }
    });
  }
}

function silverCell(cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SILVER } };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function createResourcingFile() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Staffing App';
  workbook.created = new Date();

  // Tab order: Supply → Demand → Employee Master → Skills Master → Resource Levels

  // ── Tab 1: Supply ─────────────────────────────────────────────────────────
  // Emp ID (A, key) → Employee Name (B, VLOOKUP from Employee Master col A)
  // Skill ID (C, key) → Skill Set (D, VLOOKUP from Skills Master col A)
  // Project Assigned (E), weekly hours (F+)
  const supplySheet = workbook.addWorksheet('Supply');
  supplySheet.columns = [
    { header: 'Emp ID',           key: 'empId',    width: 10 },
    { header: 'Employee Name',    key: 'empName',  width: 24 },
    { header: 'Skill ID',         key: 'skillId',  width: 10 },
    { header: 'Skill Set',        key: 'skillSet', width: 34 },
    { header: 'Project Assigned', key: 'project',  width: 48 },
    ...WEEKS.map(wk => ({
      header: `Week ending ${wk}`,
      key:    `w_${wk.replace('/', '_')}`,
      width:  14,
    })),
  ];
  styleHeader(supplySheet.getRow(1));
  supplySheet.views = [{ state: 'frozen', xSplit: 5, ySplit: 1 }];

  for (const sr of supplyRows) {
    const r   = supplySheet.rowCount + 1;
    const emp = empById[sr.empId];
    const sk  = skillById[sr.skillId];

    const row = supplySheet.addRow({ empId: sr.empId, skillId: sr.skillId, project: sr.project });

    // Employee Name: VLOOKUP pulling from Employee Master column A
    row.getCell('empName').value = {
      formula: `=VLOOKUP(A${r},'Employee Master'!$A:$B,2,FALSE)`,
      result:  emp.name,
    };

    // Skill Set: VLOOKUP pulling from Skills Master column A
    row.getCell('skillSet').value = {
      formula: `=VLOOKUP(C${r},'Skills Master'!$A:$B,2,FALSE)`,
      result:  sk.skillSet,
    };

    // Weekly hours
    WEEKS.forEach((wk, i) => {
      const cell = row.getCell(`w_${wk.replace('/', '_')}`);
      cell.value     = sr.hours[i];
      cell.alignment = { horizontal: 'center' };
      if (sr.hours[i] === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
      } else if (sr.hours[i] < 40) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      }
    });

    silverCell(row.getCell('empId'));
    silverCell(row.getCell('skillId'));
    stripeRow(row, ['empName', 'skillSet', 'project']);
  }

  // ── Tab 2: Demand ─────────────────────────────────────────────────────────
  // Project/Client Name (A)
  // Level Key (B, key — level text) → Resource Level (C, VLOOKUP from Resource Levels col A)
  // Skill ID (D, key) → Resource Skill Set (E, VLOOKUP from Skills Master col A)
  // Start Date (F), End Date (G)
  const demandSheet = workbook.addWorksheet('Demand');
  demandSheet.columns = [
    { header: 'Project/Client Name',  key: 'project',    width: 48 },
    { header: 'Level Key',            key: 'levelKey',   width: 20 },
    { header: 'Resource Level',       key: 'level',      width: 20 },
    { header: 'Skill ID',             key: 'skillId',    width: 10 },
    { header: 'Resource Skill Set',   key: 'skillSet',   width: 34 },
    { header: 'Start Date',           key: 'startDate',  width: 14 },
    { header: 'End Date',             key: 'endDate',    width: 14 },
  ];
  styleHeader(demandSheet.getRow(1));
  demandSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const d of demandData) {
    const r  = demandSheet.rowCount + 1;
    const sk = skillById[d.skillId];

    const row = demandSheet.addRow({
      project:   d.project,
      levelKey:  d.levelKey,
      skillId:   d.skillId,
      startDate: d.startDate,
      endDate:   d.endDate,
    });

    // Resource Level: VLOOKUP pulling from Resource Levels column A
    row.getCell('level').value = {
      formula: `=VLOOKUP(B${r},'Resource Levels'!$A:$A,1,FALSE)`,
      result:  d.levelKey,
    };

    // Resource Skill Set: VLOOKUP pulling from Skills Master column A
    row.getCell('skillSet').value = {
      formula: `=VLOOKUP(D${r},'Skills Master'!$A:$B,2,FALSE)`,
      result:  sk.skillSet,
    };

    row.getCell('startDate').alignment = { horizontal: 'center' };
    row.getCell('endDate').alignment   = { horizontal: 'center' };

    silverCell(row.getCell('levelKey'));
    silverCell(row.getCell('skillId'));
    stripeRow(row, ['project', 'level', 'skillSet', 'startDate', 'endDate']);
  }

  // ── Tab 3: Employee Master ────────────────────────────────────────────────
  // Col A = Emp ID (VLOOKUP key), Col B = Employee Name, Col C = Level
  const empSheet = workbook.addWorksheet('Employee Master');
  empSheet.columns = [
    { header: 'Emp ID',        key: 'id',    width: 10 },
    { header: 'Employee Name', key: 'name',  width: 24 },
    { header: 'Level',         key: 'level', width: 20 },
  ];
  styleHeader(empSheet.getRow(1));
  empSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const emp of employees) {
    const row = empSheet.addRow(emp);
    silverCell(row.getCell('id'));
    stripeRow(row, ['name', 'level']);
  }

  // ── Tab 4: Skills Master ──────────────────────────────────────────────────
  // Col A = Skill ID (VLOOKUP key), Col B = Skill Set
  const skillSheet = workbook.addWorksheet('Skills Master');
  skillSheet.columns = [
    { header: 'Skill ID',  key: 'id',       width: 10 },
    { header: 'Skill Set', key: 'skillSet', width: 36 },
  ];
  styleHeader(skillSheet.getRow(1));
  skillSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const s of skills) {
    const row = skillSheet.addRow(s);
    silverCell(row.getCell('id'));
    stripeRow(row, ['skillSet']);
  }

  // ── Tab 5: Resource Levels ────────────────────────────────────────────────
  // Col A = Level (VLOOKUP key used by Demand tab)
  const levelsSheet = workbook.addWorksheet('Resource Levels');
  levelsSheet.columns = [
    { header: 'Level', key: 'level', width: 22 },
  ];
  styleHeader(levelsSheet.getRow(1));
  levelsSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const level of resourceLevels) {
    const row = levelsSheet.addRow({ level });
    stripeRow(row, ['level']);
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  await workbook.xlsx.writeFile(OUTPUT_PATH);
  console.log(`Created: ${OUTPUT_PATH}`);
}

createResourcingFile().catch(err => {
  console.error('Failed to create resourcing.xlsx:', err);
  process.exit(1);
});
