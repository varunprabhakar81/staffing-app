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
const supplyRows = [
  // Sarah Mitchell (Partner/MD) — 20 + 25 = 45
  { name: 'Sarah Mitchell',  skillSet: 'NetSuite - Record to Report', project: 'Harrington Manufacturing – NetSuite ERP Implementation',   hours: w(20) },
  { name: 'Sarah Mitchell',  skillSet: 'NetSuite - Record to Report', project: 'Crestline Energy – NetSuite ERP Assessment',               hours: w(25) },
  // James Okafor (Senior Manager) — 30 + 15 = 45
  { name: 'James Okafor',    skillSet: 'NetSuite - Supply Chain',     project: 'Pinnacle Logistics – Supply Chain Rollout',                hours: w(30) },
  { name: 'James Okafor',    skillSet: 'NetSuite - Supply Chain',     project: 'Internal – Practice Development',                          hours: w(15) },
  // Rachel Torres (Senior Manager) — 35 + 10 = 45
  { name: 'Rachel Torres',   skillSet: 'NetSuite - Order to Cash',    project: 'Clearwater Retail – O2C Optimization',                    hours: w(35) },
  { name: 'Rachel Torres',   skillSet: 'NetSuite - Order to Cash',    project: 'Vantage Distribution – Full Suite Implementation',        hours: w(10) },
  // David Chen (Manager) — 40 + 5 = 45
  { name: 'David Chen',      skillSet: 'NetSuite - Procure to Pay',   project: 'Harrington Manufacturing – NetSuite ERP Implementation',   hours: w(40) },
  { name: 'David Chen',      skillSet: 'NetSuite - Procure to Pay',   project: 'Summit Healthcare – P2P Upgrade',                         hours: w(5)  },
  // Priya Sharma (Manager) — 40 + 5 = 45
  { name: 'Priya Sharma',    skillSet: 'NetSuite - Record to Report', project: 'Meridian Financial – R2R Consolidation',                  hours: w(40) },
  { name: 'Priya Sharma',    skillSet: 'NetSuite - Record to Report', project: 'Crestline Energy – NetSuite ERP Assessment',               hours: w(5)  },
  // Marcus Webb (Manager) — 25 + 20 = 45
  { name: 'Marcus Webb',     skillSet: 'NetSuite - Order to Cash',    project: 'Vantage Distribution – Full Suite Implementation',        hours: w(25) },
  { name: 'Marcus Webb',     skillSet: 'NetSuite - Supply Chain',     project: 'Pinnacle Logistics – Supply Chain Rollout',                hours: w(20) },
  // Luke Bennett (Senior Consultant) — 30 + 15 = 45
  { name: 'Luke Bennett',    skillSet: 'NetSuite - Supply Chain',     project: 'Pinnacle Logistics – Supply Chain Rollout',                hours: w(30) },
  { name: 'Luke Bennett',    skillSet: 'NetSuite - Supply Chain',     project: 'Vantage Distribution – Full Suite Implementation',        hours: w(15) },
  // Nina Patel (Senior Consultant) — 35 + 10 = 45
  { name: 'Nina Patel',      skillSet: 'NetSuite - Order to Cash',    project: 'Clearwater Retail – O2C Optimization',                    hours: w(35) },
  { name: 'Nina Patel',      skillSet: 'NetSuite - Order to Cash',    project: 'Harrington Manufacturing – NetSuite ERP Implementation',   hours: w(10) },
  // Carlos Rivera (Senior Consultant) — 40 + 5 = 45
  { name: 'Carlos Rivera',   skillSet: 'NetSuite - Procure to Pay',   project: 'Summit Healthcare – P2P Upgrade',                         hours: w(40) },
  { name: 'Carlos Rivera',   skillSet: 'NetSuite - Procure to Pay',   project: 'Internal – Practice Development',                          hours: w(5)  },
  // Emily Walsh (Consultant) — 40 + taper = ~45 early weeks
  { name: 'Emily Walsh',     skillSet: 'NetSuite - Record to Report', project: 'Meridian Financial – R2R Consolidation',                  hours: w(40) },
  { name: 'Emily Walsh',     skillSet: 'NetSuite - Record to Report', project: 'Harrington Manufacturing – NetSuite ERP Implementation',   hours: taper(5, 0, 8) },
  // Tom Nguyen (Consultant) — 40 + 5 = 45
  { name: 'Tom Nguyen',      skillSet: 'NetSuite - Supply Chain',     project: 'Pinnacle Logistics – Supply Chain Rollout',                hours: w(40) },
  { name: 'Tom Nguyen',      skillSet: 'NetSuite - Supply Chain',     project: 'Internal – Practice Development',                          hours: w(5)  },
  // Aisha Kamara (Consultant) — 30 + 15 = 45
  { name: 'Aisha Kamara',    skillSet: 'NetSuite - Order to Cash',    project: 'Clearwater Retail – O2C Optimization',                    hours: w(30) },
  { name: 'Aisha Kamara',    skillSet: 'NetSuite - Order to Cash',    project: 'Vantage Distribution – Full Suite Implementation',        hours: w(15) },
  // Ben Foster (Analyst) — 40 + 5 = 45
  { name: 'Ben Foster',      skillSet: 'NetSuite - Procure to Pay',   project: 'Summit Healthcare – P2P Upgrade',                         hours: w(40) },
  { name: 'Ben Foster',      skillSet: 'NetSuite - Procure to Pay',   project: 'Harrington Manufacturing – NetSuite ERP Implementation',   hours: w(5)  },
  // Maya Johansson (Analyst) — 40 + taper = ~45 early weeks
  { name: 'Maya Johansson',  skillSet: 'NetSuite - Record to Report', project: 'Meridian Financial – R2R Consolidation',                  hours: w(40) },
  { name: 'Maya Johansson',  skillSet: 'NetSuite - Order to Cash',    project: 'Clearwater Retail – O2C Optimization',                    hours: taper(5, 0, 6) },
  // Ryan O'Brien (Analyst) — 40 + 5 = 45
  { name: "Ryan O'Brien",    skillSet: 'NetSuite - Supply Chain',     project: 'Pinnacle Logistics – Supply Chain Rollout',                hours: w(40) },
  { name: "Ryan O'Brien",    skillSet: 'NetSuite - Order to Cash',    project: 'Vantage Distribution – Full Suite Implementation',        hours: w(5)  },
];

// Demand — 8 open roles, plain values only
// Columns: Project/Client Name (A), Resource Level (B), Resource Skill Set (C),
//          Start Date (D), End Date (E)
const demandData = [
  { project: 'Harrington Manufacturing – NetSuite ERP Implementation',  level: 'Senior Consultant', skillSet: 'NetSuite - Record to Report', startDate: '04/01/2026', endDate: '06/30/2026' },
  { project: 'Clearwater Retail – O2C Optimization',                    level: 'Consultant',         skillSet: 'NetSuite - Order to Cash',    startDate: '04/01/2026', endDate: '05/31/2026' },
  { project: 'Pinnacle Logistics – Supply Chain Rollout',               level: 'Analyst',            skillSet: 'NetSuite - Supply Chain',     startDate: '03/21/2026', endDate: '06/27/2026' },
  { project: 'Meridian Financial – R2R Consolidation',                  level: 'Manager',            skillSet: 'NetSuite - Record to Report', startDate: '05/01/2026', endDate: '07/31/2026' },
  { project: 'Summit Healthcare – P2P Upgrade',                         level: 'Senior Consultant',  skillSet: 'NetSuite - Procure to Pay',   startDate: '04/15/2026', endDate: '07/15/2026' },
  { project: 'Vantage Distribution – Full Suite Implementation',        level: 'Consultant',         skillSet: 'NetSuite - Procure to Pay',   startDate: '04/01/2026', endDate: '06/30/2026' },
  { project: 'Apex Pharma – NetSuite Assessment',                       level: 'Senior Manager',     skillSet: 'NetSuite - Record to Report', startDate: '05/15/2026', endDate: '08/31/2026' },
  { project: 'Internal – Pre-Sales Support',                            level: 'Analyst',            skillSet: 'NetSuite - Order to Cash',    startDate: '03/21/2026', endDate: '05/30/2026' },
];

// ── Row/range counts for data validation formulae ──────────────────────────
const EMP_LAST_ROW   = employees.length + 1;      // e.g. 16
const SKILL_LAST_ROW = skillSets.length + 1;       // e.g. 5
const LEVEL_LAST_ROW = resourceLevels.length + 1;  // e.g. 7
const PROJ_LAST_ROW  = projects.length + 1;        // e.g. 13

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
      const cell = row.getCell(`w_${wk.replace('/', '_')}`);
      cell.value     = sr.hours[i];
      cell.alignment = { horizontal: 'center' };
      if (sr.hours[i] === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY } };
      } else if (sr.hours[i] < 40) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
      }
    });

    stripeRow(row, ['name', 'skillSet', 'project']);
  }

  // Data validation dropdowns for Supply
  addDropdown(supplySheet, 'A', `'Employee Master'!$A$2:$A$${EMP_LAST_ROW}`);
  addDropdown(supplySheet, 'B', `'Skills Master'!$A$2:$A$${SKILL_LAST_ROW}`);
  addDropdown(supplySheet, 'C', `'Project Master'!$B$2:$B$${PROJ_LAST_ROW}`);

  // ── Tab 2: Demand ─────────────────────────────────────────────────────────
  // Columns: Project/Client Name (A), Resource Level (B), Resource Skill Set (C),
  //          Start Date (D), End Date (E)
  const demandSheet = workbook.addWorksheet('Demand');
  demandSheet.columns = [
    { header: 'Project/Client Name',  key: 'project',   width: 52 },
    { header: 'Resource Level',       key: 'level',     width: 20 },
    { header: 'Resource Skill Set',   key: 'skillSet',  width: 34 },
    { header: 'Start Date',           key: 'startDate', width: 14 },
    { header: 'End Date',             key: 'endDate',   width: 14 },
  ];
  styleHeader(demandSheet.getRow(1));
  demandSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const d of demandData) {
    const row = demandSheet.addRow(d);
    row.getCell('startDate').alignment = { horizontal: 'center' };
    row.getCell('endDate').alignment   = { horizontal: 'center' };
    stripeRow(row, ['project', 'level', 'skillSet', 'startDate', 'endDate']);
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
