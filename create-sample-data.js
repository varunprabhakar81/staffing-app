const ExcelJS = require('exceljs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, 'data', 'resourcing.xlsx');

// ── Master data ────────────────────────────────────────────────────────────

// Employee Master: Col A = Employee Name, Col B = Level  (no ID column)
const employees = [
  { name: 'Sarah Mitchell',  level: 'Partner/MD'        },
  { name: 'James Okafor',    level: 'Senior Manager'     },
  { name: 'Rachel Torres',   level: 'Senior Manager'     },
  { name: 'David Chen',      level: 'Manager'            },
  { name: 'Priya Sharma',    level: 'Manager'            },
  { name: 'Marcus Webb',     level: 'Manager'            },
  { name: 'Luke Bennett',    level: 'Senior Consultant'  },
  { name: 'Nina Patel',      level: 'Senior Consultant'  },
  { name: 'Carlos Rivera',   level: 'Senior Consultant'  },
  { name: 'Emily Walsh',     level: 'Consultant'         },
  { name: 'Tom Nguyen',      level: 'Consultant'         },
  { name: 'Aisha Kamara',    level: 'Consultant'         },
  { name: 'Ben Foster',      level: 'Analyst'            },
  { name: 'Maya Johansson',  level: 'Analyst'            },
  { name: "Ryan O'Brien",    level: 'Analyst'            },
];

// Skills Master: Col A = Skill Set  (no ID column)
const skillSets = [
  'NetSuite - Record to Report',
  'NetSuite - Procure to Pay',
  'NetSuite - Order to Cash',
  'NetSuite - Supply Chain',
];

// Resource Levels: Col A = Level
const resourceLevels = [
  'Analyst',
  'Consultant',
  'Senior Consultant',
  'Manager',
  'Senior Manager',
  'Partner/MD',
];

// Project Master: Col A = Project ID, Col B = Project Name
const projects = [
  { id: 'P001', name: 'Harrington Manufacturing – NetSuite ERP Implementation'  },
  { id: 'P002', name: 'Clearwater Retail – O2C Optimization'                    },
  { id: 'P003', name: 'Pinnacle Logistics – Supply Chain Rollout'               },
  { id: 'P004', name: 'Meridian Financial – R2R Consolidation'                  },
  { id: 'P005', name: 'Summit Healthcare – P2P Upgrade'                         },
  { id: 'P006', name: 'Vantage Distribution – Full Suite Implementation'        },
  { id: 'P007', name: 'Crestline Energy – NetSuite ERP Assessment'              },
  { id: 'P008', name: 'Internal – Practice Development'                         },
  { id: 'P009', name: 'Apex Pharma – NetSuite Assessment'                       },
  { id: 'P010', name: 'Internal – Pre-Sales Support'                            },
  { id: 'P011', name: 'Brightfield Group – NetSuite O2C Implementation'         },
  { id: 'P012', name: 'Coastal Medical – NetSuite P2P Rollout'                  },
];

// Weekly columns: every Friday from 3/21 to 6/27 (2026) — 15 weeks
const WEEKS = [
  '3/21', '3/28', '4/4',  '4/11', '4/18', '4/25',
  '5/2',  '5/9',  '5/16', '5/23', '5/30',
  '6/6',  '6/13', '6/20', '6/27',
];

const w     = (h)         => Array(15).fill(h);
const taper = (hi, lo, n) => [...Array(n).fill(hi), ...Array(15 - n).fill(lo)];

// Supply rows — plain values only, no IDs or formulas
// Columns: Employee Name (A), Skill Set (B), Project Assigned (C), weekly hours (D+)
//
// Utilization distribution (total per employee per week, consistent across all 15 weeks):
//   0h  (bench)           : James Okafor, Emily Walsh
//   10h (very underutil.) : Priya Sharma, Aisha Kamara
//   20h (underutilized)   : Luke Bennett, Maya Johansson
//   45h (fully utilized)  : Sarah Mitchell, David Chen, Marcus Webb,
//                           Nina Patel, Tom Nguyen, Ben Foster, Ryan O'Brien
//   50h (overbooked)      : Rachel Torres, Carlos Rivera
//
// Rows follow employee master order so colors appear scattered across the sheet.
const supplyRows = [
  // ── 45h — Sarah Mitchell (Partner/MD): 20 + 25 ──────────────────────────
  { name: 'Sarah Mitchell',  skillSet: 'NetSuite - Record to Report', project: 'Harrington Manufacturing – NetSuite ERP Implementation',  hours: w(20) },
  { name: 'Sarah Mitchell',  skillSet: 'NetSuite - Record to Report', project: 'Crestline Energy – NetSuite ERP Assessment',              hours: w(25) },
  // ── 0h  — James Okafor (Senior Manager): bench ──────────────────────────
  { name: 'James Okafor',    skillSet: 'NetSuite - Supply Chain',     project: 'Pinnacle Logistics – Supply Chain Rollout',               hours: w(0)  },
  { name: 'James Okafor',    skillSet: 'NetSuite - Supply Chain',     project: 'Internal – Practice Development',                         hours: w(0)  },
  // ── 50h — Rachel Torres (Senior Manager): 30 + 20 ───────────────────────
  { name: 'Rachel Torres',   skillSet: 'NetSuite - Order to Cash',    project: 'Clearwater Retail – O2C Optimization',                   hours: w(30) },
  { name: 'Rachel Torres',   skillSet: 'NetSuite - Order to Cash',    project: 'Vantage Distribution – Full Suite Implementation',       hours: w(20) },
  // ── 45h — David Chen (Manager): 40 + 5 ──────────────────────────────────
  { name: 'David Chen',      skillSet: 'NetSuite - Procure to Pay',   project: 'Harrington Manufacturing – NetSuite ERP Implementation',  hours: w(40) },
  { name: 'David Chen',      skillSet: 'NetSuite - Procure to Pay',   project: 'Summit Healthcare – P2P Upgrade',                        hours: w(5)  },
  // ── 10h — Priya Sharma (Manager): 8 + 2 ─────────────────────────────────
  { name: 'Priya Sharma',    skillSet: 'NetSuite - Record to Report', project: 'Meridian Financial – R2R Consolidation',                 hours: w(8)  },
  { name: 'Priya Sharma',    skillSet: 'NetSuite - Record to Report', project: 'Crestline Energy – NetSuite ERP Assessment',              hours: w(2)  },
  // ── 45h — Marcus Webb (Manager): 25 + 20 ────────────────────────────────
  { name: 'Marcus Webb',     skillSet: 'NetSuite - Order to Cash',    project: 'Vantage Distribution – Full Suite Implementation',       hours: w(25) },
  { name: 'Marcus Webb',     skillSet: 'NetSuite - Supply Chain',     project: 'Pinnacle Logistics – Supply Chain Rollout',               hours: w(20) },
  // ── Variable — Luke Bennett (Senior Consultant): 36→0 + 4 ──────────────
  { name: 'Luke Bennett',    skillSet: 'NetSuite - Supply Chain',     project: 'Pinnacle Logistics – Supply Chain Rollout',               hours: taper(36, 0, 5) },
  { name: 'Luke Bennett',    skillSet: 'NetSuite - Supply Chain',     project: 'Vantage Distribution – Full Suite Implementation',       hours: w(4)  },
  // ── 45h — Nina Patel (Senior Consultant): 35 + 10 ───────────────────────
  { name: 'Nina Patel',      skillSet: 'NetSuite - Order to Cash',    project: 'Clearwater Retail – O2C Optimization',                   hours: w(35) },
  { name: 'Nina Patel',      skillSet: 'NetSuite - Order to Cash',    project: 'Harrington Manufacturing – NetSuite ERP Implementation',  hours: w(10) },
  // ── 50h — Carlos Rivera (Senior Consultant): 45 + 5 ─────────────────────
  { name: 'Carlos Rivera',   skillSet: 'NetSuite - Procure to Pay',   project: 'Summit Healthcare – P2P Upgrade',                        hours: w(45) },
  { name: 'Carlos Rivera',   skillSet: 'NetSuite - Procure to Pay',   project: 'Internal – Practice Development',                         hours: w(5)  },
  // ── 0h  — Emily Walsh (Consultant): bench ───────────────────────────────
  { name: 'Emily Walsh',     skillSet: 'NetSuite - Record to Report', project: 'Meridian Financial – R2R Consolidation',                 hours: w(0)  },
  { name: 'Emily Walsh',     skillSet: 'NetSuite - Record to Report', project: 'Harrington Manufacturing – NetSuite ERP Implementation',  hours: w(0)  },
  // ── 45h — Tom Nguyen (Consultant): 40 + 5 ───────────────────────────────
  { name: 'Tom Nguyen',      skillSet: 'NetSuite - Supply Chain',     project: 'Pinnacle Logistics – Supply Chain Rollout',               hours: w(40) },
  { name: 'Tom Nguyen',      skillSet: 'NetSuite - Supply Chain',     project: 'Internal – Practice Development',                         hours: w(5)  },
  // ── 10h — Aisha Kamara (Consultant): 8 + 2 ──────────────────────────────
  { name: 'Aisha Kamara',    skillSet: 'NetSuite - Order to Cash',    project: 'Clearwater Retail – O2C Optimization',                   hours: w(8)  },
  { name: 'Aisha Kamara',    skillSet: 'NetSuite - Order to Cash',    project: 'Vantage Distribution – Full Suite Implementation',       hours: w(2)  },
  // ── 45h — Ben Foster (Analyst): 40 + 5 ──────────────────────────────────
  { name: 'Ben Foster',      skillSet: 'NetSuite - Procure to Pay',   project: 'Summit Healthcare – P2P Upgrade',                        hours: w(40) },
  { name: 'Ben Foster',      skillSet: 'NetSuite - Procure to Pay',   project: 'Harrington Manufacturing – NetSuite ERP Implementation',  hours: w(5)  },
  // ── 20h — Maya Johansson (Analyst): 16 + 4 ──────────────────────────────
  { name: 'Maya Johansson',  skillSet: 'NetSuite - Record to Report', project: 'Meridian Financial – R2R Consolidation',                 hours: w(16) },
  { name: 'Maya Johansson',  skillSet: 'NetSuite - Order to Cash',    project: 'Clearwater Retail – O2C Optimization',                   hours: w(4)  },
  // ── 45h — Ryan O'Brien (Analyst): 40 + 5 ────────────────────────────────
  { name: "Ryan O'Brien",    skillSet: 'NetSuite - Supply Chain',     project: 'Pinnacle Logistics – Supply Chain Rollout',               hours: w(40) },
  { name: "Ryan O'Brien",    skillSet: 'NetSuite - Order to Cash',    project: 'Vantage Distribution – Full Suite Implementation',       hours: w(5)  },
];

// Demand — 8 open roles, plain values only
// Columns: Project/Client Name (A), Resource Level (B), Resource Skill Set (C),
//          Start Date (D), End Date (E), Hours Per Week (F)
const demandData = [
  // UNMET: no Senior Consultant with R2R available
  { project: 'Harrington Manufacturing – NetSuite ERP Implementation',  level: 'Senior Consultant', skillSet: 'NetSuite - Record to Report', startDate: '04/01/2026', endDate: '06/30/2026', hoursPerWeek: 40 },
  // UNMET: Aisha Kamara (O2C Consultant) has only 35h free, needs 40h
  { project: 'Clearwater Retail – O2C Optimization',                    level: 'Consultant',         skillSet: 'NetSuite - Order to Cash',    startDate: '03/20/2026', endDate: '05/31/2026', hoursPerWeek: 40 },
  // PARTIALLY MET: Luke Bennett covers weeks 6-15 only (first 5 weeks he's heavily booked)
  { project: 'Pinnacle Logistics – Supply Chain Rollout',               level: 'Senior Consultant',  skillSet: 'NetSuite - Supply Chain',     startDate: '03/21/2026', endDate: '06/27/2026', hoursPerWeek: 30 },
  // FULLY MET: Priya Sharma (Manager, R2R) has 35h free every week
  { project: 'Meridian Financial – R2R Consolidation',                  level: 'Manager',            skillSet: 'NetSuite - Record to Report', startDate: '05/01/2026', endDate: '07/31/2026', hoursPerWeek: 30 },
  // UNMET: Carlos Rivera (P2P Senior Consultant) is overbooked at 50h
  { project: 'Summit Healthcare – P2P Upgrade',                         level: 'Senior Consultant',  skillSet: 'NetSuite - Procure to Pay',   startDate: '04/15/2026', endDate: '07/15/2026', hoursPerWeek: 40 },
  // FULLY MET: Emily Walsh (Consultant, R2R) is fully on bench at 0h
  { project: 'Vantage Distribution – Full Suite Implementation',        level: 'Consultant',         skillSet: 'NetSuite - Record to Report', startDate: '04/01/2026', endDate: '06/30/2026', hoursPerWeek: 30 },
  // FULLY MET: James Okafor (Senior Manager, SC) is on bench at 0h
  { project: 'Apex Pharma – NetSuite Assessment',                       level: 'Senior Manager',     skillSet: 'NetSuite - Supply Chain',     startDate: '05/15/2026', endDate: '08/31/2026', hoursPerWeek: 20 },
  // UNMET: no Analyst with O2C skill set available
  { project: 'Internal – Pre-Sales Support',                            level: 'Analyst',            skillSet: 'NetSuite - Order to Cash',    startDate: '03/21/2026', endDate: '05/30/2026', hoursPerWeek: 20 },
];

// ── Row/range counts for data validation formulae ──────────────────────────
const EMP_LAST_ROW   = employees.length + 1;      // e.g. 16
const SKILL_LAST_ROW = skillSets.length + 1;       // e.g. 5
const LEVEL_LAST_ROW = resourceLevels.length + 1;  // e.g. 7
const PROJ_LAST_ROW  = projects.length + 1;        // e.g. 13

// ── Styling helpers ─────────────────────────────────────────────────────────

const BLUE      = 'FF2F5496';
const STRIPE    = 'FFE9EFF7';

// Utilization colors (applied per-employee per-week based on TOTAL hours)
const CLR_UNDER    = 'FF8B0000'; // dark red   — total < 40 (underutilized)
const CLR_NOMINAL  = 'FFFFD700'; // yellow     — total 40–44
const CLR_TARGET   = 'FF00B050'; // green      — total exactly 45
const CLR_OVER     = 'FFFF9999'; // salmon     — total > 45 (overbooked)

// Pre-compute total hours per employee per week index
// empWeekTotals[employeeName][weekIndex] = sum across all their rows
const empWeekTotals = {};
for (const sr of supplyRows) {
  if (!empWeekTotals[sr.name]) {
    empWeekTotals[sr.name] = Array(WEEKS.length).fill(0);
  }
  sr.hours.forEach((h, i) => { empWeekTotals[sr.name][i] += h; });
}

function utilizationColor(total) {
  if (total < 40)  return CLR_UNDER;
  if (total === 45) return CLR_TARGET;
  if (total <= 44) return CLR_NOMINAL;
  return CLR_OVER;
}

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

// Add a list-type data validation to a column range (rows 2 → maxRow)
function addDropdown(sheet, colLetter, sourceFormula, maxRow = 500) {
  sheet.dataValidations.add(`${colLetter}2:${colLetter}${maxRow}`, {
    type:             'list',
    allowBlank:       true,
    showErrorMessage: true,
    errorStyle:       'warning',
    errorTitle:       'Invalid value',
    error:            'Please select a value from the dropdown list.',
    formulae:         [sourceFormula],
  });
}

// ── Main ───────────────────────────────────────────────────────────────────

async function createResourcingFile() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Staffing App';
  workbook.created = new Date();

  // Tab order: Supply → Demand → Employee Master → Skills Master → Resource Levels → Project Master

  // ── Tab 1: Supply ─────────────────────────────────────────────────────────
  // Columns: Employee Name (A), Skill Set (B), Project Assigned (C), weekly hours (D+)
  const supplySheet = workbook.addWorksheet('Supply');
  supplySheet.columns = [
    { header: 'Employee Name',    key: 'name',     width: 24 },
    { header: 'Skill Set',        key: 'skillSet', width: 34 },
    { header: 'Project Assigned', key: 'project',  width: 52 },
    ...WEEKS.map(wk => ({
      header: `Week ending ${wk}`,
      key:    `w_${wk.replace('/', '_')}`,
      width:  14,
    })),
  ];
  styleHeader(supplySheet.getRow(1));
  supplySheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];

  for (const sr of supplyRows) {
    const row = supplySheet.addRow({ name: sr.name, skillSet: sr.skillSet, project: sr.project });

    WEEKS.forEach((wk, i) => {
      const cell  = row.getCell(`w_${wk.replace('/', '_')}`);
      cell.value     = sr.hours[i];
      cell.alignment = { horizontal: 'center' };
      // Color based on employee's TOTAL hours that week across all their rows
      const total = empWeekTotals[sr.name][i];
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: utilizationColor(total) } };
    });

    stripeRow(row, ['name', 'skillSet', 'project']);
  }

  // Data validation dropdowns for Supply
  addDropdown(supplySheet, 'A', `'Employee Master'!$A$2:$A$${EMP_LAST_ROW}`);
  addDropdown(supplySheet, 'B', `'Skills Master'!$A$2:$A$${SKILL_LAST_ROW}`);
  addDropdown(supplySheet, 'C', `'Project Master'!$B$2:$B$${PROJ_LAST_ROW}`);

  // ── Tab 2: Demand ─────────────────────────────────────────────────────────
  // Columns: Project/Client Name (A), Resource Level (B), Resource Skill Set (C),
  //          Start Date (D), End Date (E), Hours Per Week (F)
  const demandSheet = workbook.addWorksheet('Demand');
  demandSheet.columns = [
    { header: 'Project/Client Name',  key: 'project',      width: 52 },
    { header: 'Resource Level',       key: 'level',        width: 20 },
    { header: 'Resource Skill Set',   key: 'skillSet',     width: 34 },
    { header: 'Start Date',           key: 'startDate',    width: 14 },
    { header: 'End Date',             key: 'endDate',      width: 14 },
    { header: 'Hours Per Week',       key: 'hoursPerWeek', width: 14 },
  ];
  styleHeader(demandSheet.getRow(1));
  demandSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const d of demandData) {
    const row = demandSheet.addRow(d);
    row.getCell('startDate').alignment    = { horizontal: 'center' };
    row.getCell('endDate').alignment      = { horizontal: 'center' };
    row.getCell('hoursPerWeek').alignment = { horizontal: 'center' };
    stripeRow(row, ['project', 'level', 'skillSet', 'startDate', 'endDate', 'hoursPerWeek']);
  }

  // Data validation dropdowns for Demand
  addDropdown(demandSheet, 'A', `'Project Master'!$B$2:$B$${PROJ_LAST_ROW}`);
  addDropdown(demandSheet, 'B', `'Resource Levels'!$A$2:$A$${LEVEL_LAST_ROW}`);
  addDropdown(demandSheet, 'C', `'Skills Master'!$A$2:$A$${SKILL_LAST_ROW}`);

  // ── Tab 3: Employee Master ────────────────────────────────────────────────
  // Col A = Employee Name, Col B = Level  (no ID column)
  const empSheet = workbook.addWorksheet('Employee Master');
  empSheet.columns = [
    { header: 'Employee Name', key: 'name',  width: 24 },
    { header: 'Level',         key: 'level', width: 20 },
  ];
  styleHeader(empSheet.getRow(1));
  empSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const emp of employees) {
    const row = empSheet.addRow(emp);
    stripeRow(row, ['name', 'level']);
  }

  // ── Tab 4: Skills Master ──────────────────────────────────────────────────
  // Col A = Skill Set  (no ID column)
  const skillSheet = workbook.addWorksheet('Skills Master');
  skillSheet.columns = [
    { header: 'Skill Set', key: 'skillSet', width: 36 },
  ];
  styleHeader(skillSheet.getRow(1));
  skillSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const s of skillSets) {
    const row = skillSheet.addRow({ skillSet: s });
    stripeRow(row, ['skillSet']);
  }

  // ── Tab 5: Resource Levels ────────────────────────────────────────────────
  // Col A = Level
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

  // ── Tab 6: Project Master ─────────────────────────────────────────────────
  // Col A = Project ID, Col B = Project Name
  const projectSheet = workbook.addWorksheet('Project Master');
  projectSheet.columns = [
    { header: 'Project ID',   key: 'id',   width: 12 },
    { header: 'Project Name', key: 'name', width: 52 },
  ];
  styleHeader(projectSheet.getRow(1));
  projectSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const proj of projects) {
    const row = projectSheet.addRow(proj);
    stripeRow(row, ['id', 'name']);
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  await workbook.xlsx.writeFile(OUTPUT_PATH);
  console.log(`Created: ${OUTPUT_PATH}`);
}

createResourcingFile().catch(err => {
  console.error('Failed to create resourcing.xlsx:', err);
  process.exit(1);
});
