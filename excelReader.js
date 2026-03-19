const ExcelJS = require('exceljs');
const path    = require('path');

const FILE_PATH = path.join(__dirname, 'data', 'resourcing.xlsx');

// Parse a worksheet into an array of plain objects using the header row as keys.
// Skips rows where every cell is empty.
function sheetToObjects(worksheet) {
  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cell.value ? String(cell.value).trim() : null;
  });

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const obj = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const key = headers[col];
      if (!key) return;
      let val = cell.value;
      // Unwrap rich-text objects
      if (val && typeof val === 'object' && val.richText) {
        val = val.richText.map(r => r.text).join('');
      }
      // Unwrap formula results
      if (val && typeof val === 'object' && val.result !== undefined) {
        val = val.result;
      }
      // Normalize dates to mm/dd/yyyy strings
      if (val instanceof Date) {
        const m = val.getMonth() + 1;
        const d = val.getDate();
        const y = val.getFullYear();
        val = `${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}/${y}`;
      }
      obj[key] = val ?? null;
      if (val !== null && val !== '') hasValue = true;
    });
    if (hasValue) rows.push(obj);
  });
  return rows;
}

async function readStaffingData() {
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.readFile(FILE_PATH);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { error: `File not found: ${FILE_PATH}` };
    }
    return { error: `Failed to open file: ${err.message}` };
  }

  const required = ['Supply', 'Demand', 'Employee Master', 'Skills Master', 'Resource Levels', 'Project Master'];
  const missing  = required.filter(name => !workbook.getWorksheet(name));
  if (missing.length) {
    return { error: `Missing tabs: ${missing.join(', ')}` };
  }

  // ── Supply ────────────────────────────────────────────────────────────────
  // Columns: Employee Name, Skill Set, Project Assigned, Week ending 3/21 … 6/27
  const rawSupply = sheetToObjects(workbook.getWorksheet('Supply'));
  const supply = rawSupply.map(row => {
    const weekly = {};
    for (const [key, val] of Object.entries(row)) {
      if (key.startsWith('Week ending ')) weekly[key] = val ?? 0;
    }
    return {
      employeeName:    row['Employee Name']    ?? null,
      skillSet:        row['Skill Set']        ?? null,
      projectAssigned: row['Project Assigned'] ?? null,
      weeklyHours:     weekly,
    };
  });

  // ── Demand ────────────────────────────────────────────────────────────────
  // Columns: Project/Client Name, Resource Level, Resource Skill Set, Start Date, End Date, Hours Per Week
  const demand = sheetToObjects(workbook.getWorksheet('Demand')).map(row => ({
    projectName:   row['Project/Client Name'] ?? null,
    resourceLevel: row['Resource Level']      ?? null,
    skillSet:      row['Resource Skill Set']  ?? null,
    startDate:     row['Start Date']          ?? null,
    endDate:       row['End Date']            ?? null,
    hoursPerWeek:  row['Hours Per Week']      ?? null,
  }));

  // ── Employee Master ───────────────────────────────────────────────────────
  // Columns: Employee Name, Level
  const employees = sheetToObjects(workbook.getWorksheet('Employee Master')).map(row => ({
    employeeName: row['Employee Name'] ?? null,
    level:        row['Level']         ?? null,
  }));

  // ── Skills Master ─────────────────────────────────────────────────────────
  // Columns: Skill Set
  const skills = sheetToObjects(workbook.getWorksheet('Skills Master')).map(row => ({
    skillSet: row['Skill Set'] ?? null,
  }));

  // ── Resource Levels ───────────────────────────────────────────────────────
  // Columns: Level
  const resourceLevels = sheetToObjects(workbook.getWorksheet('Resource Levels')).map(row => ({
    level: row['Level'] ?? null,
  }));

  // ── Project Master ────────────────────────────────────────────────────────
  // Columns: Project ID, Project Name
  const projects = sheetToObjects(workbook.getWorksheet('Project Master')).map(row => ({
    projectId:   row['Project ID']   ?? null,
    projectName: row['Project Name'] ?? null,
  }));

  return { supply, demand, employees, skills, resourceLevels, projects };
}

module.exports = { readStaffingData };

// ── Quick test when run directly ─────────────────────────────────────────────
if (require.main === module) {
  readStaffingData().then(data => {
    if (data.error) {
      console.error('Error:', data.error);
      process.exit(1);
    }
    console.log('resourcing.xlsx loaded successfully\n');
    console.log(`  Supply rows       : ${data.supply.length}`);
    console.log(`  Demand rows       : ${data.demand.length}`);
    console.log(`  Employees         : ${data.employees.length}`);
    console.log(`  Skills            : ${data.skills.length}`);
    console.log(`  Resource Levels   : ${data.resourceLevels.length}`);
    console.log(`  Projects          : ${data.projects.length}`);

    console.log('\nSample supply row:');
    const s = data.supply[0];
    console.log(`  ${s.employeeName} | ${s.skillSet} | ${s.projectAssigned}`);
    console.log(`  Weekly hours (first 3 weeks):`, Object.entries(s.weeklyHours).slice(0, 3).map(([k,v]) => `${k}: ${v}h`).join(', '));

    console.log('\nSample demand row:');
    const d = data.demand[0];
    console.log(`  ${d.projectName} | ${d.resourceLevel} | ${d.skillSet} | ${d.startDate} – ${d.endDate}`);
  });
}
