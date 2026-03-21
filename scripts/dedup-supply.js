// One-time script: deduplicate Supply tab by employeeName+project, keep first occurrence.
const ExcelJS = require('exceljs');
const path    = require('path');

const FILE_PATH = path.join(__dirname, '..', 'data', 'resourcing.xlsx');

(async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);

  const ws = workbook.getWorksheet('Supply');
  if (!ws) { console.error('Supply worksheet not found'); process.exit(1); }

  // Read header row (row 1)
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cell.value ? String(cell.value).trim() : null;
  });

  // Find column indices for Employee Name and Project Assigned
  const nameCol    = headers.indexOf('Employee Name');
  const projectCol = headers.indexOf('Project Assigned');
  if (nameCol === -1 || projectCol === -1) {
    console.error('Could not find Employee Name or Project Assigned columns');
    console.error('Headers:', headers.filter(Boolean));
    process.exit(1);
  }

  // Collect all data rows with their raw cell values
  const dataRows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const rowVals = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      rowVals[col] = cell.value;
    });
    dataRows.push({ rowNumber, rowVals });
  });

  console.log(`Before dedup: ${dataRows.length} data rows`);

  // Deduplicate: keep first occurrence of each employeeName+project combo
  const seen = new Set();
  const dedupedRows = [];
  const removed = [];
  for (const { rowNumber, rowVals } of dataRows) {
    const name    = rowVals[nameCol]    ? String(rowVals[nameCol]).trim()    : '';
    const project = rowVals[projectCol] ? String(rowVals[projectCol]).trim() : '';
    const key = `${name}|${project}`;
    if (seen.has(key)) {
      removed.push({ rowNumber, name, project });
    } else {
      seen.add(key);
      dedupedRows.push(rowVals);
    }
  }

  console.log(`After dedup:  ${dedupedRows.length} data rows`);
  if (removed.length > 0) {
    console.log(`Removed ${removed.length} duplicate(s):`);
    for (const r of removed) {
      console.log(`  Row ${r.rowNumber}: ${r.name} | ${r.project}`);
    }
  } else {
    console.log('No duplicates found.');
  }

  // Rebuild worksheet
  workbook.removeWorksheet(ws.id);
  const newWs = workbook.addWorksheet('Supply');

  // Re-add header
  const headerVals = headers.slice(1); // headers array is 1-indexed; slice removes the undefined at 0
  newWs.addRow(headerVals);

  // Re-add deduped data rows
  for (const rowVals of dedupedRows) {
    newWs.addRow(rowVals.slice(1)); // slice off index-0 placeholder
  }

  await workbook.xlsx.writeFile(FILE_PATH);
  console.log(`Wrote ${dedupedRows.length} data rows back to Supply tab.`);
})();
