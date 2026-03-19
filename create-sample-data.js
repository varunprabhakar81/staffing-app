const ExcelJS = require('exceljs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, 'data', 'resourcing.xlsx');

// ── Master data ────────────────────────────────────────────────────────────

// Employees: id used as VLOOKUP key in Supply and Demand tabs
// Col A = Emp ID, Col B = Employee Name, Col C = Level
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

// Skills: id used as VLOOKUP key in Supply and Demand tabs
// Col A = Skill ID, Col B = Skill Set
const skills = [
  { id: 'S01', skillSet: 'NetSuite - Record to Report' },
  { id: 'S02', skillSet: 'NetSuite - Procure to Pay'   },
  { id: 'S03', skillSet: 'NetSuite - Order to Cash'    },
  { id: 'S04', skillSet: 'NetSuite - Supply Chain'     },
];

// Lookup helpers (for formula result caching)
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

// Supply rows — empId & skillId are stored as keys; VLOOKUP resolves display values
// Columns: Emp ID (A), Employee Name (B=VLOOKUP), Skill ID (C), Skill Set (D=VLOOKUP),
//          Project Assigned (E), Week cols (F+)
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
// empId = reference employee whose Level is returned by VLOOKUP (col C)
// skillId = key whose Skill Set is returned by VLOOKUP (col E)
const demandData = [
  { project: 'Harrington Manufacturing – ERP Implementation',    empId: 'E07', skillId: 'S01', startDate: '04/01/2026', endDate: '06/30/2026' },
  { project: 'Clearwater Retail – O2C Optimization',             empId: 'E10', skillId: 'S03', startDate: '04/01/2026', endDate: '05/31/2026' },
  { project: 'Pinnacle Logistics – Supply Chain Rollout',        empId: 'E13', skillId: 'S04', startDate: '03/21/2026', endDate: '06/27/2026' },
  { project: 'Meridian Financial – R2R Consolidation',           empId: 'E04', skillId: 'S01', startDate: '05/01/2026', endDate: '07/31/2026' },
  { project: 'Summit Healthcare – P2P Upgrade',                  empId: 'E08', skillId: 'S02', startDate: '04/15/2026', endDate: '07/15/2026' },
  { project: 'Vantage Distribution – Full Suite Implementation', empId: 'E11', skillId: 'S02', startDate: '04/01/2026', endDate: '06/30/2026' },
  { project: 'Apex Pharma – NetSuite ERP Assessment',            empId: 'E02', skillId: 'S01', startDate: '05/15/2026', endDate: '08/31/2026' },
  { project: 'Internal – Pre-Sales Support',                     empId: 'E14', skillId: 'S03', startDate: '03/21/2026', endDate: '05/30/2026' },
];

// ── Styling helpers ─────────────────────────────────────────────────────────

const BLUE   = 'FF2F5496';
const STRIPE = 'FFE9EFF7';
const YELLOW = 'FFFFF2CC';
const GREY   = 'FFD9D9D9';
const SILVER = 'FFF2F2F2'; // for ID key columns

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

// ── Main ───────────────────────────────────────────────────────────────────

async function createResourcingFile() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Staffing App';
  workbook.created = new Date();

  // Tab order: Supply → Demand → Employees → Skills

  // ── Tab 1: Supply ─────────────────────────────────────────────────────────
  // Columns: Emp ID (A), Employee Name (B=VLOOKUP), Skill ID (C),
  //          Skill Set (D=VLOOKUP), Project Assigned (E), Week cols (F+)
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
    const r   = supplySheet.rowCount + 1; // next row number
    const emp = empById[sr.empId];
    const sk  = skillById[sr.skillId];

    const row = supplySheet.addRow({ empId: sr.empId, skillId: sr.skillId, project: sr.project });

    // Employee Name — VLOOKUP against Employees!$A:$B, return col 2 (Name)
    row.getCell('empName').value = {
      formula: `=VLOOKUP(A${r},Employees!$A:$B,2,FALSE)`,
      result:  emp.name,
    };

    // Skill Set — VLOOKUP against Skills!$A:$B, return col 2 (Skill Set)
    row.getCell('skillSet').value = {
      formula: `=VLOOKUP(C${r},Skills!$A:$B,2,FALSE)`,
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

    // Stripe fixed display columns
    stripeRow(row, ['empId', 'empName', 'skillId', 'skillSet', 'project']);

    // Shade ID columns subtly
    row.getCell('empId').fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: SILVER } };
    row.getCell('skillId').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SILVER } };
  }

  // ── Tab 2: Demand ─────────────────────────────────────────────────────────
  // Columns: Project/Client Name (A), Emp ID (B), Resource Level (C=VLOOKUP),
  //          Skill ID (D), Resource Skill Set (E=VLOOKUP), Start Date (F), End Date (G)
  const demandSheet = workbook.addWorksheet('Demand');
  demandSheet.columns = [
    { header: 'Project/Client Name',  key: 'project',   width: 48 },
    { header: 'Emp ID',               key: 'empId',     width: 10 },
    { header: 'Resource Level',       key: 'level',     width: 20 },
    { header: 'Skill ID',             key: 'skillId',   width: 10 },
    { header: 'Resource Skill Set',   key: 'skillSet',  width: 34 },
    { header: 'Start Date',           key: 'startDate', width: 14 },
    { header: 'End Date',             key: 'endDate',   width: 14 },
  ];
  styleHeader(demandSheet.getRow(1));
  demandSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const d of demandData) {
    const r   = demandSheet.rowCount + 1;
    const emp = empById[d.empId];
    const sk  = skillById[d.skillId];

    const row = demandSheet.addRow({
      project:   d.project,
      empId:     d.empId,
      skillId:   d.skillId,
      startDate: d.startDate,
      endDate:   d.endDate,
    });

    // Resource Level — VLOOKUP against Employees!$A:$C, return col 3 (Level)
    row.getCell('level').value = {
      formula: `=VLOOKUP(B${r},Employees!$A:$C,3,FALSE)`,
      result:  emp.level,
    };

    // Resource Skill Set — VLOOKUP against Skills!$A:$B, return col 2 (Skill Set)
    row.getCell('skillSet').value = {
      formula: `=VLOOKUP(D${r},Skills!$A:$B,2,FALSE)`,
      result:  sk.skillSet,
    };

    row.getCell('startDate').alignment = { horizontal: 'center' };
    row.getCell('endDate').alignment   = { horizontal: 'center' };

    // Shade ID columns
    row.getCell('empId').fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: SILVER } };
    row.getCell('skillId').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SILVER } };

    stripeRow(row, ['project', 'empId', 'level', 'skillId', 'skillSet', 'startDate', 'endDate']);
  }

  // ── Tab 3: Employees ──────────────────────────────────────────────────────
  // Col A = Emp ID (VLOOKUP key), Col B = Employee Name, Col C = Level
  const empSheet = workbook.addWorksheet('Employees');
  empSheet.columns = [
    { header: 'Emp ID',        key: 'id',    width: 10 },
    { header: 'Employee Name', key: 'name',  width: 24 },
    { header: 'Level',         key: 'level', width: 20 },
  ];
  styleHeader(empSheet.getRow(1));
  empSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const emp of employees) {
    const row = empSheet.addRow(emp);
    row.getCell('id').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SILVER } };
    stripeRow(row, ['name', 'level']);
  }

  // ── Tab 4: Skills ─────────────────────────────────────────────────────────
  // Col A = Skill ID (VLOOKUP key), Col B = Skill Set
  const skillSheet = workbook.addWorksheet('Skills');
  skillSheet.columns = [
    { header: 'Skill ID',  key: 'id',       width: 10 },
    { header: 'Skill Set', key: 'skillSet', width: 36 },
  ];
  styleHeader(skillSheet.getRow(1));
  skillSheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const s of skills) {
    const row = skillSheet.addRow(s);
    row.getCell('id').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SILVER } };
    stripeRow(row, ['skillSet']);
  }

  // ── Write ─────────────────────────────────────────────────────────────────
  await workbook.xlsx.writeFile(OUTPUT_PATH);
  console.log(`Created: ${OUTPUT_PATH}`);
}

createResourcingFile().catch(err => {
  console.error('Failed to create resourcing.xlsx:', err);
  process.exit(1);
});
