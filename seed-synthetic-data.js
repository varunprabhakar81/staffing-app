/**
 * seed-synthetic-data.js
 * Replaces all tenant staffing data with a synthetic dataset for demos and UAT.
 * Does NOT touch: levels, skill_sets, auth users, tenants table.
 *
 * CLI usage:
 *   node seed-synthetic-data.js                         # uses TENANT_ID from .env
 *   node seed-synthetic-data.js --tenant-id <uuid>      # seeds a specific tenant
 *
 * Programmatic usage (from server.js):
 *   const { seedTenant } = require('./seed-synthetic-data');
 *   await seedTenant(tenantId, serviceClient, { skipConfirm: true });
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

// Module-level client for CLI use only
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ---------------------------------------------------------------------------
// Week date helpers
// ---------------------------------------------------------------------------

function getWeekEndings(count = 12) {
  const today = new Date();
  const day = today.getDay(); // 0=Sun … 6=Sat
  const saturday = new Date(today);
  // Advance to the current or next Saturday (Deloitte weeks run Sun–Sat)
  const diff = (6 - day + 7) % 7;
  saturday.setDate(today.getDate() + diff);

  const weeks = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(saturday);
    d.setDate(saturday.getDate() + i * 7);
    weeks.push(d.toISOString().split('T')[0]); // YYYY-MM-DD
  }
  return weeks;
}

function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// Returns YYYY-MM-DD for today + n days (used for need start/end dates)
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Confirmation prompt
// ---------------------------------------------------------------------------

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ---------------------------------------------------------------------------
// Deterministic RNG — seeded per tenant so same tenant always reseeds to
// the same synthetic names, but different tenants get different datasets.
// ---------------------------------------------------------------------------

function hashTenantId(tenantId) {
  // FNV-1a 32-bit hash of the UUID string → uint32
  let h = 2166136261 >>> 0;
  for (let i = 0; i < tenantId.length; i++) {
    h = Math.imul(h ^ tenantId.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

function makePrng(seed) {
  // Mulberry32 — fast, deterministic 32-bit PRNG
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61) >>> 0;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates shuffle, returns first n unique items from pool
function pickUnique(pool, n, rng) {
  if (n > pool.length) throw new Error(`Need ${n} items but pool only has ${pool.length}`);
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

// ---------------------------------------------------------------------------
// Name pools — large enough to give each tenant a unique set
// ---------------------------------------------------------------------------

const FIRST_NAME_POOL = [
  'Aaron', 'Alice', 'Amber', 'Andre', 'Angela', 'Anna', 'Ben', 'Beth',
  'Blake', 'Brenda', 'Carlos', 'Carmen', 'Chris', 'Claire', 'David', 'Diana',
  'Dylan', 'Elena', 'Ethan', 'Eva', 'Felix', 'Fiona', 'George', 'Hannah',
  'Ian', 'Jack', 'Jamie', 'Jason', 'Jessica', 'Jordan', 'Julia', 'Kevin',
  'Laura', 'Lena', 'Lucas', 'Marcus', 'Maria', 'Mark', 'Maya', 'Michael',
  'Mila', 'Nathan', 'Nicole', 'Oliver', 'Owen', 'Patrick', 'Paula', 'Rachel',
  'Ryan', 'Sarah', 'Sophie', 'Steven', 'Susan', 'Thomas', 'Tina', 'Tyler',
  'Victor', 'Wendy', 'William', 'Zach', 'Zoe',
];

const LAST_NAME_POOL = [
  'Adams', 'Allen', 'Anderson', 'Baker', 'Bell', 'Brooks', 'Brown', 'Carter',
  'Clark', 'Collins', 'Cook', 'Cooper', 'Davis', 'Dixon', 'Edwards', 'Evans',
  'Fisher', 'Foster', 'Garcia', 'Gibson', 'Grant', 'Gray', 'Green', 'Hall',
  'Harris', 'Hayes', 'Hill', 'Howard', 'Hughes', 'Hunt', 'Jackson', 'James',
  'Johnson', 'Jones', 'Kelly', 'Kim', 'King', 'Lee', 'Lewis', 'Long',
  'Martin', 'Mason', 'Mitchell', 'Moore', 'Morgan', 'Morris', 'Murphy', 'Nelson',
  'Parker', 'Patel', 'Peterson', 'Phillips', 'Powell', 'Price', 'Reed', 'Robinson',
  'Rogers', 'Ross', 'Scott', 'Shaw', 'Smith', 'Stewart', 'Taylor', 'Thomas',
  'Thompson', 'Torres', 'Turner', 'Walker', 'Ward', 'Watson', 'White', 'Williams',
  'Wilson', 'Wood', 'Wright', 'Young',
];

const CLIENT_PREFIX_POOL = [
  'Acme', 'Apex', 'Atlas', 'Axiom', 'Blue', 'Bright', 'Capital', 'Cascade',
  'Crest', 'Crown', 'Delta', 'Echo', 'Elite', 'Empire', 'Falcon', 'Frontier',
  'Galaxy', 'Globe', 'Harbor', 'Helix', 'Horizon', 'Iris', 'Iron', 'Jupiter',
  'Legacy', 'Lumen', 'Lynx', 'Maple', 'Mercury', 'Metro', 'Monarch', 'Nova',
  'Nexus', 'Oak', 'Orion', 'Pacific', 'Pinnacle', 'Pioneer', 'Prism', 'Ridge',
  'River', 'Sapphire', 'Silver', 'Solaris', 'Stellar', 'Summit', 'Titan',
  'Triumph', 'Vector', 'Vertex', 'Vantage', 'Vista', 'Zenith', 'Zephyr',
];

const CLIENT_SUFFIX_POOL = [
  'Corp', 'Industries', 'Systems', 'Foods', 'Retail', 'Manufacturing',
  'Logistics', 'Health', 'Solutions', 'Group', 'Partners', 'Holdings',
  'Enterprises', 'Technologies', 'Services', 'Ventures',
];

const EXT_PROJECT_NAME_POOL = [
  'ERP Rollout', 'P2P Implementation', 'Finance Transformation',
  'Supply Chain Optimization', 'Order Management System', 'NetSuite Migration',
  'Inventory Optimization', 'Procure-to-Pay Rollout', 'Phase 2 ERP',
  'O2C Implementation', 'Record-to-Report', 'Process Improvement',
  'Finance Modernization', 'Source-to-Pay', 'Integrated Planning',
  'ERP Assessment', 'AP Automation', 'GL Transformation',
  'Order-to-Cash Rollout', 'FP&A Implementation', 'Supply Chain Visibility',
  'Demand Planning', 'NetSuite Optimization', 'ERP Upgrade',
  'Revenue Recognition', 'Close Acceleration', 'Working Capital',
  'Procure-to-Pay Assessment', 'Inventory Planning', 'Treasury Transformation',
];

// ---------------------------------------------------------------------------
// Generate per-tenant name substitutions (deterministic, seeded by tenant_id)
// ---------------------------------------------------------------------------

/**
 * Returns name substitution maps for a given tenant.
 * - consultantNameMap: template name → generated name (25 consultants)
 * - clientNameMap:     template name → generated name (8 clients)
 * - projectNameMap:    template name → generated name (10 external projects)
 * Internal projects ('Pre-Sales Support', 'Internal Training') are unchanged.
 */
function generateTenantNames(tenantId) {
  const rng = makePrng(hashTenantId(tenantId));

  // 25 unique consultant names: shuffle first + last pools independently
  const firstNames = pickUnique(FIRST_NAME_POOL, 25, rng);
  const lastNames  = pickUnique(LAST_NAME_POOL,  25, rng);
  const generatedConsultants = firstNames.map((f, i) => `${f} ${lastNames[i]}`);

  // 8 unique client names: prefix + suffix pairs
  const prefixes = pickUnique(CLIENT_PREFIX_POOL, 8, rng);
  const suffixes = pickUnique(CLIENT_SUFFIX_POOL, 8, rng);
  const generatedClients = prefixes.map((p, i) => `${p} ${suffixes[i]}`);

  // 10 unique external project names
  const extTypes = pickUnique(EXT_PROJECT_NAME_POOL, 10, rng);
  // Prefix each project name with a short client identifier for realism
  const generatedProjects = extTypes.map((type, i) => `${prefixes[i % 8]} ${type}`);

  // Build maps: TEMPLATE_NAME → GENERATED_NAME
  const templateConsultants = CONSULTANT_DEFS.map(c => c.name);
  const consultantNameMap = Object.fromEntries(
    templateConsultants.map((name, i) => [name, generatedConsultants[i]])
  );

  const templateClients = CLIENT_NAMES; // matches CLIENT_NAMES array order
  const clientNameMap = Object.fromEntries(
    templateClients.map((name, i) => [name, generatedClients[i]])
  );

  // External projects: PROJECT_DEFS indices 0-9 (non-internal)
  const externalProjectDefs = PROJECT_DEFS.filter(p => p.client !== null);
  const projectNameMap = Object.fromEntries(
    externalProjectDefs.map((p, i) => [p.name, generatedProjects[i]])
  );
  // Internal projects keep their template names
  PROJECT_DEFS.filter(p => p.client === null).forEach(p => {
    projectNameMap[p.name] = p.name;
  });

  return { consultantNameMap, clientNameMap, projectNameMap };
}

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const CLIENT_NAMES = [
  'Acme Corp',
  'Bright Industries',
  'Cascade Systems',
  'Delta Foods',
  'Echo Retail',
  'Falcon Manufacturing',
  'Globe Logistics',
  'Harbor Health',
];

// Projects: date offsets relative to week[0] (the first Saturday week_ending).
// "week 1 Sunday" ≈ week_ending[0] - 6 days (the Sunday that opens that week).
// We compute start/end as offsets from that Monday.
const PROJECT_DEFS = [
  { name: 'Acme ERP Rollout',            client: 'Acme Corp',           status: 'Sold',          is_billable: true,  startOff: -14, endOff: 84  },
  { name: 'Bright P2P Implementation',   client: 'Bright Industries',   status: 'Sold',          is_billable: true,  startOff: -14, endOff: 84  },
  { name: 'Cascade Finance Transform',   client: 'Cascade Systems',     status: 'Sold',          is_billable: true,  startOff: -7,  endOff: 84  },
  { name: 'Delta Supply Chain',          client: 'Delta Foods',         status: 'Verbal Commit', is_billable: true,  startOff: 0,   endOff: 56  },
  { name: 'Echo Order Management',       client: 'Echo Retail',         status: 'Verbal Commit', is_billable: true,  startOff: 0,   endOff: 84  },
  { name: 'Falcon Procure-to-Pay',       client: 'Falcon Manufacturing',status: 'Proposed',      is_billable: true,  startOff: 28,  endOff: 84  },
  { name: 'Globe Inventory Optimization',client: 'Globe Logistics',     status: 'Sold',          is_billable: true,  startOff: -14, endOff: 28  },
  { name: 'Harbor NetSuite Migration',   client: 'Harbor Health',       status: 'Verbal Commit', is_billable: true,  startOff: 0,   endOff: 84  },
  { name: 'Acme Phase 2 Supply Chain',         client: 'Acme Corp',           status: 'Proposed',      is_billable: true,  startOff: 42,  endOff: 112 },
  { name: 'Bright Procure to Pay Rollout',      client: 'Bright Industries',   status: 'Sold',          is_billable: true,  startOff: -7,  endOff: 84  },
  { name: 'Pre-Sales Support',           client: null,                  status: 'Sold',          is_billable: false, startOff: -30, endOff: 84  },
  { name: 'Internal Training',           client: null,                  status: 'Sold',          is_billable: false, startOff: -30, endOff: 84  },
];

const PROBABILITY_MAP = { 'Proposed': 25, 'Verbal Commit': 75, 'Sold': 100 };

const SEED_INDUSTRIES = [
  'Consumer',
  'Energy, Resources & Industrials',
  'Financial Services',
  'Life Sciences & Health Care',
  'Technology, Media & Telecommunication',
];
const SEED_COUNTRIES = ['United States', 'India'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const CONSULTANT_DEFS = [
  { name: 'Abby Adams',    level: 'Analyst',                             location: 'Chicago',       skills: ['Order to Cash', 'NetSuite'] },
  { name: 'Brad Baker',    level: 'Analyst',                             location: 'Detroit',       skills: ['Procure to Pay', 'NetSuite'] },
  { name: 'Chad Chen',     level: 'Analyst',                             location: 'New York',      skills: ['Record to Report', 'NetSuite'] },
  { name: 'Dana Davis',    level: 'Analyst',                             location: 'Dallas',        skills: ['Supply Chain', 'NetSuite'] },
  { name: 'Emma Evans',    level: 'Consultant',                          location: 'Chicago',       skills: ['Order to Cash', 'NetSuite', 'Procure to Pay', 'Record to Report'] },
  { name: 'Frank Fisher',  level: 'Consultant',                          location: 'Detroit',       skills: ['Procure to Pay', 'Supply Chain', 'NetSuite'] },
  { name: 'Grace Garcia',  level: 'Consultant',                          location: 'San Francisco', skills: ['Record to Report', 'NetSuite'] },
  { name: 'Henry Hall',    level: 'Consultant',                          location: 'New York',      skills: ['Supply Chain', 'NetSuite'] },
  { name: 'Ivy Ibrahim',   level: 'Consultant',                          location: 'Atlanta',       skills: ['Procure to Pay', 'NetSuite'] },
  { name: 'Jake Jensen',   level: 'Senior Consultant',                   location: 'Detroit',       skills: ['Order to Cash', 'NetSuite', 'Procure to Pay'] },
  { name: 'Kate Kim',      level: 'Senior Consultant',                   location: 'Chicago',       skills: ['Procure to Pay', 'Supply Chain', 'NetSuite'] },
  { name: 'Leo Lopez',     level: 'Senior Consultant',                   location: 'Dallas',        skills: ['Record to Report', 'NetSuite'] },
  { name: 'Mia Martin',    level: 'Senior Consultant',                   location: 'New York',      skills: ['Supply Chain', 'NetSuite'] },
  { name: 'Noah Nguyen',   level: 'Senior Consultant',                   location: 'San Francisco', skills: ['Procure to Pay', 'NetSuite', 'Supply Chain'] },
  { name: 'Olivia Owen',   level: 'Manager',                             location: 'Detroit',       skills: ['Order to Cash', 'Record to Report', 'NetSuite'] },
  { name: 'Pete Patel',    level: 'Manager',                             location: 'Chicago',       skills: ['Procure to Pay', 'Supply Chain', 'NetSuite'] },
  { name: 'Quinn Quinn',   level: 'Manager',                             location: 'New York',      skills: ['Supply Chain', 'NetSuite', 'Program Manager'] },
  { name: 'Rosa Reed',     level: 'Manager',                             location: 'Dallas',        skills: ['Record to Report', 'NetSuite', 'Procure to Pay'] },
  { name: 'Sam Shaw',      level: 'Senior Manager',                      location: 'Detroit',       skills: ['Order to Cash', 'Procure to Pay', 'NetSuite', 'Supply Chain'] },
  { name: 'Tara Torres',   level: 'Senior Manager',                      location: 'Chicago',       skills: ['Record to Report', 'Supply Chain', 'NetSuite'] },
  { name: 'Uma Upton',     level: 'Senior Manager',                      location: 'New York',      skills: ['Procure to Pay', 'NetSuite', 'Program Manager'] },
  { name: 'Victor Voss',   level: 'Partner/Principal/Managing Director', location: 'Detroit',       skills: ['Order to Cash', 'Procure to Pay', 'Record to Report', 'NetSuite'] },
  { name: 'Wendy Walsh',   level: 'Partner/Principal/Managing Director', location: 'Chicago',       skills: ['Supply Chain', 'Procure to Pay', 'NetSuite', 'Supply Chain'] },
  { name: 'Xavier Xu',     level: 'Analyst',                             location: 'Detroit',       skills: ['Record to Report', 'NetSuite'] },
  { name: 'Yara York',     level: 'Consultant',                          location: 'Dallas',        skills: ['Order to Cash', 'NetSuite'] },
];

// Assignment definitions: { consultant, project, hours, weekRange: [startWeek, endWeek] (1-based), is_billable }
// weekRange is inclusive, 1-based index into weeks array
const ASSIGNMENT_DEFS = [
  // Fully Utilized
  { consultant: 'Jake Jensen',  project: 'Acme ERP Rollout',             hours: 45, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Kate Kim',     project: 'Bright P2P Implementation',    hours: 45, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Olivia Owen',  project: 'Cascade Finance Transform',    hours: 45, weekRange: [1, 12], is_billable: true  },
  // Overallocated
  { consultant: 'Sam Shaw',     project: 'Acme ERP Rollout',             hours: 25, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Sam Shaw',     project: 'Bright P2P Implementation',    hours: 25, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Pete Patel',   project: 'Bright P2P Implementation',    hours: 30, weekRange: [1, 8],  is_billable: true  },
  { consultant: 'Pete Patel',   project: 'Delta Supply Chain',           hours: 20, weekRange: [1, 8],  is_billable: true  },
  // Partial Utilization
  { consultant: 'Emma Evans',   project: 'Echo Order Management',        hours: 30, weekRange: [1, 12], is_billable: true  },
  // Emma Evans: 30h Echo + 5h Internal = 35h/wk → 10h avail → ~33% (coral) for Cascade Finance Consultant need
  { consultant: 'Emma Evans',   project: 'Internal Training',            hours: 5,  weekRange: [1, 12], is_billable: false },
  { consultant: 'Frank Fisher', project: 'Bright P2P Implementation',    hours: 20, weekRange: [1, 12], is_billable: true  },
  // Grace Garcia: free weeks 1-6 (10h avail in later weeks) → partial match for Cascade Finance Consultant need
  { consultant: 'Grace Garcia', project: 'Cascade Finance Transform',    hours: 35, weekRange: [7, 12], is_billable: true  },
  // Henry Hall: free weeks 1-2 (20h avail in later weeks) → partial match for Globe Inventory Consultant need
  { consultant: 'Henry Hall',   project: 'Globe Inventory Optimization', hours: 25, weekRange: [3, 12], is_billable: true  },
  { consultant: 'Leo Lopez',    project: 'Cascade Finance Transform',    hours: 40, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Chad Chen',    project: 'Acme ERP Rollout',             hours: 40, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Yara York',    project: 'Echo Order Management',        hours: 30, weekRange: [1, 12], is_billable: true  },
  // Bench
  // Brad Baker: mostly free (40h avail later weeks) → partial match for Bright P2P Analyst need
  { consultant: 'Brad Baker',   project: 'Pre-Sales Support',            hours: 5,  weekRange: [7, 12], is_billable: false },
  // Abby Adams: mostly free (40h avail later weeks) → partial match for Echo O2C Analyst need
  { consultant: 'Abby Adams',   project: 'Internal Training',            hours: 5,  weekRange: [7, 12], is_billable: false },
  { consultant: 'Xavier Xu',    project: 'Internal Training',            hours: 5,  weekRange: [1, 12], is_billable: false },
  // Rolling Off
  { consultant: 'Mia Martin',   project: 'Globe Inventory Optimization', hours: 45, weekRange: [1, 2],  is_billable: true  },
  { consultant: 'Noah Nguyen',  project: 'Delta Supply Chain',           hours: 40, weekRange: [1, 2],  is_billable: true  },
  // Ramping Up
  { consultant: 'Dana Davis',   project: 'Harbor NetSuite Migration',    hours: 40, weekRange: [5, 12], is_billable: true  },
  { consultant: 'Ivy Ibrahim',  project: 'Echo Order Management',        hours: 35, weekRange: [7, 12], is_billable: true  },
  // Multi-Project Split
  { consultant: 'Quinn Quinn',  project: 'Globe Inventory Optimization', hours: 20, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Quinn Quinn',  project: 'Harbor NetSuite Migration',    hours: 20, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Rosa Reed',    project: 'Cascade Finance Transform',    hours: 15, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Rosa Reed',    project: 'Bright Procure to Pay Rollout',       hours: 25, weekRange: [1, 12], is_billable: true  },
  // PPMD Light Touch + Non-Billable
  { consultant: 'Tara Torres',  project: 'Delta Supply Chain',           hours: 20, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Uma Upton',    project: 'Harbor NetSuite Migration',    hours: 15, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Victor Voss',  project: 'Acme ERP Rollout',             hours: 10, weekRange: [1, 12], is_billable: true  },
  { consultant: 'Wendy Walsh',  project: 'Pre-Sales Support',            hours: 8,  weekRange: [1, 12], is_billable: false },
];

// 8 open needs spread across 3 urgency tiers (Urgent/Soon/Planned).
// Urgency thresholds (computed client-side from start_date vs today):
//   Urgent  = start_date ≤ today + 14 days
//   Soon    = start_date ≤ today + 28 days
//   Planned = start_date > today + 28 days
//
// startOff/endOff here are days from TODAY (not from week1Monday).
// End dates are 9-12 weeks after start date for realistic engagement length.
// Spread across all 8 clients so the donut has meaningful segments.
const NEED_DEFS = [
  // --- Urgent tier (start ≤ 14 days from now) ---
  // No SM has both SC + PM (Sam/Tara have SC; Uma has PM — no overlap)
  { project: 'Delta Supply Chain',          level: 'Senior Manager',    skills: ['Supply Chain', 'Program Manager'],     hoursPerWeek: 30, startOff: 3,   endOff: 73   },
  // No Manager has both R2R + PM (Olivia/Rosa have R2R; Quinn has PM — no overlap)
  { project: 'Harbor NetSuite Migration',   level: 'Manager',           skills: ['Record to Report', 'Program Manager'], hoursPerWeek: 40, startOff: 10,  endOff: 87   },
  // Abby Adams (O2C+NS) fully available vs 40h need → green badge
  { project: 'Echo Order Management',       level: 'Analyst',           skills: ['Order to Cash', 'NetSuite'],           hoursPerWeek: 40, startOff: 7,   endOff: 91   },
  // Cascade Client 1 — Urgent: Senior Consultant, Supply Chain + NetSuite
  { project: 'Cascade Finance Transform',   level: 'Senior Consultant', skills: ['Supply Chain', 'NetSuite'],            hoursPerWeek: 35, startOff: 5,   endOff: 68   },
  // Acme Client 2 — Urgent: Analyst, Procure to Pay + NetSuite
  { project: 'Acme ERP Rollout',            level: 'Analyst',           skills: ['Procure to Pay', 'NetSuite'],          hoursPerWeek: 40, startOff: 3,   endOff: 66   },
  // --- Soon tier (start 15-28 days from now) ---
  // Grace Garcia (R2R+NS, limited hours) vs 30h need
  { project: 'Cascade Finance Transform',   level: 'Consultant',        skills: ['Record to Report', 'NetSuite'],        hoursPerWeek: 30, startOff: 18,  endOff: 95   },
  // Henry Hall (SC+NS, partial hours) vs 45h need
  { project: 'Globe Inventory Optimization',level: 'Consultant',        skills: ['Supply Chain', 'NetSuite'],            hoursPerWeek: 45, startOff: 25,  endOff: 88   },
  // Acme Client 2 — Soon: Senior Manager, Record to Report
  { project: 'Acme ERP Rollout',            level: 'Senior Manager',    skills: ['Record to Report'],                    hoursPerWeek: 20, startOff: 25,  endOff: 88   },
  // --- Planned tier (start > 28 days from now) ---
  // No Senior Consultant has Program Manager skill
  { project: 'Falcon Procure-to-Pay',       level: 'Senior Consultant', skills: ['Program Manager'],                     hoursPerWeek: 40, startOff: 35,  endOff: 98   },
  // Cascade Client 1 — Planned: Manager, Order to Cash + NetSuite
  { project: 'Cascade Finance Transform',   level: 'Manager',           skills: ['Order to Cash', 'NetSuite'],           hoursPerWeek: 30, startOff: 35,  endOff: 98   },
  // No SM has both O2C + PM (Sam has O2C; Uma has PM — no overlap)
  { project: 'Acme Phase 2 Supply Chain',   level: 'Senior Manager',    skills: ['Order to Cash', 'Program Manager'],    hoursPerWeek: 35, startOff: 42,  endOff: 126  },
  // Brad Baker (P2P+NS, partial hours) vs 45h need
  { project: 'Bright P2P Implementation',   level: 'Analyst',           skills: ['Procure to Pay', 'NetSuite'],          hoursPerWeek: 45, startOff: 49,  endOff: 119  },
];

// ---------------------------------------------------------------------------
// Core seed function — exported for programmatic use from server.js
// ---------------------------------------------------------------------------

/**
 * Seeds synthetic staffing data for a given tenant.
 *
 * @param {string} tenantId    - The tenant UUID to seed
 * @param {object} client      - Supabase client (must have service role access)
 * @param {object} opts
 * @param {boolean} opts.skipConfirm - Skip interactive confirmation prompt (default: false)
 */
async function seedTenant(tenantId, client, { skipConfirm = false } = {}) {
  if (!tenantId) throw new Error('tenantId is required');

  // Helpers scoped to this invocation's tenant + client
  async function deleteWhere(table) {
    const { error } = await client.from(table).delete().eq('tenant_id', tenantId);
    if (error) throw new Error(`Delete ${table}: ${error.message}`);
  }

  async function insert(table, rows) {
    if (rows.length === 0) return [];
    const { data, error } = await client.from(table).insert(rows).select();
    if (error) throw new Error(`Insert ${table}: ${error.message}`);
    return data;
  }

  if (!skipConfirm) {
    const answer = await confirm(
      `\nThis will delete all staffing data for tenant ${tenantId}.\nContinue? (y/N) `
    );
    if (answer !== 'y' && answer !== 'yes') {
      console.log('Aborted.');
      return { aborted: true };
    }
  }

  console.log('\n--- Seeding synthetic data ---\n');

  // 0. Generate deterministic per-tenant name substitutions
  const { consultantNameMap, clientNameMap, projectNameMap } = generateTenantNames(tenantId);
  console.log('Generated unique names for this tenant');

  // 1. Query lookup tables (levels + skill_sets are tenant-scoped)
  const levelsRaw = await client.from('levels').select('id, name').eq('tenant_id', tenantId);
  if (levelsRaw.error) throw new Error(`Query levels: ${levelsRaw.error.message}`);
  const levelByName = Object.fromEntries(levelsRaw.data.map(r => [r.name, r.id]));
  console.log(`Loaded ${levelsRaw.data.length} levels`);

  const skillsRaw = await client.from('skill_sets').select('id, name').eq('tenant_id', tenantId);
  if (skillsRaw.error) throw new Error(`Query skill_sets: ${skillsRaw.error.message}`);
  const skillByName = Object.fromEntries(skillsRaw.data.map(r => [r.name, r.id]));
  console.log(`Loaded ${skillsRaw.data.length} skill sets`);

  // 2. Delete existing tenant data (FK-safe order)
  console.log('\nDeleting existing data...');
  await deleteWhere('need_skill_sets');      console.log('  need_skill_sets cleared');
  await deleteWhere('needs');               console.log('  needs cleared');
  await deleteWhere('resource_assignments'); console.log('  resource_assignments cleared');
  await deleteWhere('consultant_skill_sets');console.log('  consultant_skill_sets cleared');
  await deleteWhere('consultants');         console.log('  consultants cleared');
  await deleteWhere('projects');            console.log('  projects cleared');
  await deleteWhere('clients');             console.log('  clients cleared');

  // 3. Insert clients (using generated names)
  console.log('\nInserting clients...');
  const clientRows = CLIENT_NAMES.map(name => ({ name: clientNameMap[name], tenant_id: tenantId }));
  const insertedClients = await insert('clients', clientRows);
  // clientByGeneratedName: generated name → id
  const clientByName = Object.fromEntries(insertedClients.map(r => [r.name, r.id]));
  console.log(`  Inserted ${insertedClients.length} clients`);

  // 4. Insert projects (using generated names)
  console.log('Inserting projects...');
  const weeks = getWeekEndings(12);
  const week1Monday = addDays(weeks[0], -4);

  const projectRows = PROJECT_DEFS.map(p => ({
    name: projectNameMap[p.name],
    client_id: p.client ? clientByName[clientNameMap[p.client]] : null,
    status: p.status,
    probability_pct: PROBABILITY_MAP[p.status],
    is_billable: p.is_billable,
    start_date: addDays(week1Monday, p.startOff),
    end_date: addDays(week1Monday, p.endOff),
    tenant_id: tenantId,
  }));
  const insertedProjects = await insert('projects', projectRows);
  // projectByGeneratedName: generated name → id
  const projectByName = Object.fromEntries(insertedProjects.map(r => [r.name, r.id]));
  console.log(`  Inserted ${insertedProjects.length} projects`);

  // 5. Insert consultants (using generated names)
  console.log('Inserting consultants...');
  const consultantRows = CONSULTANT_DEFS.map(c => ({
    name: consultantNameMap[c.name],
    level_id: levelByName[c.level],
    location: c.location,
    industry: pick(SEED_INDUSTRIES),
    country: pick(SEED_COUNTRIES),
    capacity_hours_per_week: 45,
    is_active: true,
    bill_rate_override: null,
    cost_rate_override: null,
    tenant_id: tenantId,
  }));
  const insertedConsultants = await insert('consultants', consultantRows);
  // consultantByGeneratedName: generated name → id
  const consultantByName = Object.fromEntries(insertedConsultants.map(r => [r.name, r.id]));
  console.log(`  Inserted ${insertedConsultants.length} consultants`);

  // 6. Insert consultant_skill_sets (same skills, generated names for lookup)
  console.log('Inserting consultant_skill_sets...');
  const cssRows = [];
  for (const c of CONSULTANT_DEFS) {
    const cid = consultantByName[consultantNameMap[c.name]];
    const seen = new Set();
    for (const skillName of c.skills) {
      const sid = skillByName[skillName];
      if (!sid) throw new Error(`Unknown skill: ${skillName}`);
      if (seen.has(sid)) continue;
      seen.add(sid);
      cssRows.push({ consultant_id: cid, skill_set_id: sid, tenant_id: tenantId });
    }
  }
  const insertedCss = await insert('consultant_skill_sets', cssRows);
  console.log(`  Inserted ${insertedCss.length} consultant_skill_sets`);

  // 7. Insert resource_assignments (template names resolved via name maps)
  console.log('Inserting resource_assignments...');
  const assignmentRows = [];
  for (const a of ASSIGNMENT_DEFS) {
    const cid = consultantByName[consultantNameMap[a.consultant]];
    const pid = projectByName[projectNameMap[a.project]];
    if (!cid) throw new Error(`Unknown consultant template: ${a.consultant}`);
    if (!pid) throw new Error(`Unknown project template: ${a.project}`);
    for (let wi = a.weekRange[0] - 1; wi < a.weekRange[1]; wi++) {
      assignmentRows.push({
        consultant_id: cid,
        project_id: pid,
        week_ending: weeks[wi],
        hours: a.hours,
        is_billable: a.is_billable,
        tenant_id: tenantId,
      });
    }
  }
  const insertedAssignments = await insert('resource_assignments', assignmentRows);
  console.log(`  Inserted ${insertedAssignments.length} resource_assignments`);

  // 8. Insert needs (template project names resolved via projectNameMap)
  console.log('Inserting needs...');
  for (const n of NEED_DEFS) {
    const pid = projectByName[projectNameMap[n.project]];
    const lid = levelByName[n.level];
    if (!pid) throw new Error(`Need FK not found — project template: "${n.project}" → "${projectNameMap[n.project]}"`);
    if (!lid) throw new Error(`Need FK not found — level: "${n.level}" (check levels table has this name)`);
    console.log(`  Need: ${n.project} | ${n.level} → project_id=${pid} level_id=${lid}`);
  }
  const needRows = NEED_DEFS.map(n => ({
    project_id: projectByName[projectNameMap[n.project]],
    level_id: levelByName[n.level],
    hours_per_week: n.hoursPerWeek,
    start_date: daysFromNow(n.startOff),
    end_date: daysFromNow(n.endOff),
    closed_at: null,
    closed_reason: null,
    tenant_id: tenantId,
  }));
  const insertedNeeds = await insert('needs', needRows);
  if (insertedNeeds.length !== NEED_DEFS.length) {
    throw new Error(`Needs insert returned ${insertedNeeds.length} rows but expected ${NEED_DEFS.length} — Supabase may have silently dropped rows`);
  }
  console.log(`  Inserted ${insertedNeeds.length} needs`);

  // 9. Insert need_skill_sets
  console.log('Inserting need_skill_sets...');
  const nssRows = [];
  for (let i = 0; i < NEED_DEFS.length; i++) {
    const needId = insertedNeeds[i].id;
    for (const skillName of NEED_DEFS[i].skills) {
      const sid = skillByName[skillName];
      if (!sid) throw new Error(`Unknown skill: ${skillName}`);
      nssRows.push({ need_id: needId, skill_set_id: sid, tenant_id: tenantId });
    }
  }
  const insertedNss = await insert('need_skill_sets', nssRows);
  console.log(`  Inserted ${insertedNss.length} need_skill_sets`);

  // 10. Summary
  console.log('\n--- Seed complete ---');
  console.log(`  Clients:               ${insertedClients.length}`);
  console.log(`  Projects:              ${insertedProjects.length}`);
  console.log(`  Consultants:           ${insertedConsultants.length}`);
  console.log(`  Consultant skill sets: ${insertedCss.length}`);
  console.log(`  Resource assignments:  ${insertedAssignments.length}`);
  console.log(`  Needs:                 ${insertedNeeds.length}`);
  console.log(`  Need skill sets:       ${insertedNss.length}`);
  console.log(`\n  Week window: ${weeks[0]} → ${weeks[11]}`);
  console.log('\nDone. Start the app and verify all tabs load correctly.\n');

  return { success: true };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function getCliArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

async function seed() {
  const tenantId = getCliArg('--tenant-id') || process.env.TENANT_ID;
  if (!tenantId) {
    console.error('ERROR: TENANT_ID not set in .env and no --tenant-id argument provided');
    process.exit(1);
  }
  await seedTenant(tenantId, supabase);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { seedTenant };

// Run when invoked directly (not when required by server.js)
if (require.main === module) {
  seed().catch(err => {
    console.error('\nERROR:', err.message);
    process.exit(1);
  });
}
