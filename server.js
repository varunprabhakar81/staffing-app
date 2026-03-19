require('dotenv').config();

const express            = require('express');
const cors               = require('cors');
const path               = require('path');
const { readStaffingData } = require('./excelReader');

const app  = express();
const PORT = process.env.PORT || 3000;

// Load staffing data at startup
let staffingData = null;
readStaffingData().then(data => {
  if (data.error) {
    console.warn('Warning: could not load Excel data —', data.error);
  } else {
    staffingData = data;
    console.log(`Data loaded: ${data.supply.length} supply rows, ${data.demand.length} demand rows`);
  }
});

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ─────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Staffing app is running' });
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Staffing app running on http://localhost:${PORT}`);
});
