const ExcelJS = require('exceljs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, 'data', 'resourcing.xlsx');

const employees = [
  { id: 'E001', name: 'Alice Nguyen',    role: 'Senior Developer',    department: 'Engineering' },
  { id: 'E002', name: 'Ben Carter',      role: 'Developer',           department: 'Engineering' },
  { id: 'E003', name: 'Clara Osei',      role: 'UX Designer',         department: 'Design' },
  { id: 'E004', name: 'David Kim',       role: 'Project Manager',     department: 'PMO' },
  { id: 'E005', name: 'Eva Martins',     role: 'Business Analyst',    department: 'Consulting' },
  { id: 'E006', name: 'Frank O\'Brien',  role: 'Developer',           department: 'Engineering' },
  { id: 'E007', name: 'Grace Liu',       role: 'QA Engineer',         department: 'Engineering' },
  { id: 'E008', name: 'Henry Patel',     role: 'Architect',           department: 'Engineering' },
  { id: 'E009', name: 'Isla Robertson', role: 'Scrum Master',        department: 'PMO' },
  { id: 'E010', name: 'James Adeyemi',  role: 'Data Engineer',       department: 'Data' },
];

const projects = [
  { id: 'P001', name: 'Portal Redesign',     client: 'Acme Corp',       status: 'Active' },
  { id: 'P002', name: 'Data Migration',      client: 'Beta Ltd',        status: 'Active' },
  { id: 'P003', name: 'Mobile App v2',       client: 'Gamma Inc',       status: 'Active' },
  { id: 'P004', name: 'Analytics Dashboard', client: 'Delta Solutions', status: 'Active' },
  { id: 'P005', name: 'Infrastructure Uplift', client: 'Internal',      status: 'Pipeline' },
];

const allocations = [
  { employeeId: 'E001', projectId: 'P001', allocation: 80, startDate: '2026-01-05', endDate: '2026-06-30', notes: 'Lead developer' },
  { employeeId: 'E001', projectId: 'P003', allocation: 20, startDate: '2026-01-05', endDate: '2026-03-31', notes: 'Support role' },
  { employeeId: 'E002', projectId: 'P002', allocation: 100, startDate: '2026-02-01', endDate: '2026-07-31', notes: '' },
  { employeeId: 'E003', projectId: 'P001', allocation: 50, startDate: '2026-01-05', endDate: '2026-04-30', notes: 'UX phase only' },
  { employeeId: 'E003', projectId: 'P003', allocation: 50, startDate: '2026-01-05', endDate: '2026-06-30', notes: '' },
  { employeeId: 'E004', projectId: 'P001', allocation: 40, startDate: '2026-01-05', endDate: '2026-06-30', notes: '' },
  { employeeId: 'E004', projectId: 'P002', allocation: 60, startDate: '2026-02-01', endDate: '2026-07-31', notes: '' },
  { employeeId: 'E005', projectId: 'P004', allocation: 100, startDate: '2026-03-01', endDate: '2026-09-30', notes: 'Requirements phase' },
  { employeeId: 'E006', projectId: 'P003', allocation: 100, startDate: '2026-01-05', endDate: '2026-06-30', notes: '' },
  { employeeId: 'E007', projectId: 'P001', allocation: 50, startDate: '2026-02-01', endDate: '2026-06-30', notes: '' },
  { employeeId: 'E007', projectId: 'P002', allocation: 50, startDate: '2026-02-01', endDate: '2026-05-31', notes: '' },
  { employeeId: 'E008', projectId: 'P005', allocation: 60, startDate: '2026-04-01', endDate: '2026-12-31', notes: 'Architecture lead' },
  { employeeId: 'E008', projectId: 'P004', allocation: 40, startDate: '2026-03-01', endDate: '2026-06-30', notes: 'Advisory' },
  { employeeId: 'E009', projectId: 'P003', allocation: 50, startDate: '2026-01-05', endDate: '2026-06-30', notes: '' },
  { employeeId: 'E009', projectId: 'P002', allocation: 50, startDate: '2026-02-01', endDate: '2026-07-31', notes: '' },
  { employeeId: 'E010', projectId: 'P004', allocation: 100, startDate: '2026-03-01', endDate: '2026-09-30', notes: 'Pipeline build' },
];

async function createResourcingFile() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Staffing App';
  workbook.created = new Date();

  // ── Sheet 1: Allocations ──────────────────────────────────────────────────
  const allocSheet = workbook.addWorksheet('Allocations');

  allocSheet.columns = [
    { header: 'Employee ID',   key: 'employeeId',   width: 14 },
    { header: 'Employee Name', key: 'employeeName',  width: 22 },
    { header: 'Role',          key: 'role',          width: 22 },
    { header: 'Department',    key: 'department',    width: 16 },
    { header: 'Project ID',    key: 'projectId',     width: 12 },
    { header: 'Project Name',  key: 'projectName',   width: 26 },
    { header: 'Client',        key: 'client',        width: 18 },
    { header: 'Allocation %',  key: 'allocation',    width: 14 },
    { header: 'Start Date',    key: 'startDate',     width: 14 },
    { header: 'End Date',      key: 'endDate',       width: 14 },
    { header: 'Notes',         key: 'notes',         width: 30 },
  ];

  // Style the header row
  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5496' } },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border: {
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
    },
  };
  allocSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle));
  allocSheet.getRow(1).height = 20;

  for (const alloc of allocations) {
    const emp = employees.find(e => e.id === alloc.employeeId);
    const proj = projects.find(p => p.id === alloc.projectId);

    const row = allocSheet.addRow({
      employeeId:   alloc.employeeId,
      employeeName: emp.name,
      role:         emp.role,
      department:   emp.department,
      projectId:    alloc.projectId,
      projectName:  proj.name,
      client:       proj.client,
      allocation:   alloc.allocation / 100,
      startDate:    new Date(alloc.startDate),
      endDate:      new Date(alloc.endDate),
      notes:        alloc.notes,
    });

    // Format allocation as percentage
    row.getCell('allocation').numFmt = '0%';
    // Format dates
    row.getCell('startDate').numFmt = 'dd/mm/yyyy';
    row.getCell('endDate').numFmt   = 'dd/mm/yyyy';

    // Alternate row shading
    if (row.number % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EFF7' } };
      });
    }
  }

  // Freeze the header row
  allocSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ── Sheet 2: Employees ────────────────────────────────────────────────────
  const empSheet = workbook.addWorksheet('Employees');

  empSheet.columns = [
    { header: 'Employee ID', key: 'id',         width: 14 },
    { header: 'Name',        key: 'name',        width: 22 },
    { header: 'Role',        key: 'role',        width: 22 },
    { header: 'Department',  key: 'department',  width: 16 },
  ];

  empSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle));
  empSheet.getRow(1).height = 20;

  for (const emp of employees) {
    empSheet.addRow(emp);
  }

  empSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ── Sheet 3: Projects ─────────────────────────────────────────────────────
  const projSheet = workbook.addWorksheet('Projects');

  projSheet.columns = [
    { header: 'Project ID',   key: 'id',     width: 12 },
    { header: 'Project Name', key: 'name',   width: 26 },
    { header: 'Client',       key: 'client', width: 18 },
    { header: 'Status',       key: 'status', width: 12 },
  ];

  projSheet.getRow(1).eachCell(cell => Object.assign(cell, headerStyle));
  projSheet.getRow(1).height = 20;

  for (const proj of projects) {
    projSheet.addRow(proj);
  }

  projSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ── Write file ────────────────────────────────────────────────────────────
  await workbook.xlsx.writeFile(OUTPUT_PATH);
  console.log(`Created: ${OUTPUT_PATH}`);
}

createResourcingFile().catch(err => {
  console.error('Failed to create resourcing.xlsx:', err);
  process.exit(1);
});
