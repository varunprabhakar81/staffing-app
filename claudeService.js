require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const MODEL  = 'claude-sonnet-4-6';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a staffing analyst assistant for a ~25-person NetSuite consulting practice.

Practice context:
- Consultant levels: Analyst, Consultant, Senior Consultant, Manager, Senior Manager, Partner / Principal / Managing Director
- Practice areas: Procure to Pay (P2P), Order to Cash (O2C), Record to Report (R2R), Supply Chain
- Core technologies: NetSuite, Ivalua, Emburse, Program Management
- Project pipeline statuses: Proposed, Verbal Commit, Sold
- Capacity: 45 hours/week per consultant = fully utilized target

Utilization thresholds:
- > 45 h/week  = overallocated (exceeds capacity — flag immediately)
- 35–45 h/week = utilized (0–10h available — fully staffed, no action needed)
- 1–34 h/week  = available (has capacity for additional work)
- 0 h/week     = bench (fully available, 45h free — urgent attention needed)

Key concerns you help with:
- Utilization vs target by level, practice area, and individual consultant
- Bench talent — who is available and what skills/practice area do they bring
- Staffing needs coverage — which open project roles are unmet, partially met, or at risk
- Project cliffs — consultants rolling off engagements soon who need redeployment
- Overallocation — consultants booked beyond 45 h/week across simultaneous engagements

Always be concise and specific. Name actual consultants and projects from the data when relevant.
Format lists clearly. Do not fabricate consultants, projects, or hours not present in the context.
Use "Projects" instead of "Demand" and "Consultants" or "Resources" instead of "Supply" in all responses.`;

// Format staffing data into a readable context block for the model
function formatContext(data) {
  const lines = [];

  // Rolling window: same filter the heatmap uses — current week through ~90 days out
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rawEnd = new Date(today); rawEnd.setDate(rawEnd.getDate() + 90);
  const dow = rawEnd.getDay();
  const windowEnd = new Date(rawEnd); windowEnd.setDate(windowEnd.getDate() + (dow === 6 ? 0 : 6 - dow));

  function parseWkLabel(wk) {
    const m = wk.match(/(\d+)\/(\d+)/);
    return m ? new Date(today.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2])) : null;
  }

  function inWindow(wk) {
    const d = parseWkLabel(wk);
    return d && d >= today && d <= windowEnd;
  }

  // Supply: sum booked hours per employee per week across all assignment rows
  const empTotals = {};

  // Seed every known employee so bench consultants are always included
  for (const emp of data.employees) {
    const name = emp.employeeName || emp.name;
    if (name && !empTotals[name]) empTotals[name] = { projects: [], weeklyTotals: {} };
  }

  for (const row of data.supply) {
    const name = row.employeeName;
    if (!name) continue;
    if (!empTotals[name]) empTotals[name] = { projects: [], weeklyTotals: {} };
    if (row.projectAssigned && !empTotals[name].projects.includes(row.projectAssigned)) {
      empTotals[name].projects.push(row.projectAssigned);
    }
    for (const [week, hrs] of Object.entries(row.weeklyHours || {})) {
      if (!inWindow(week)) continue; // exclude historical weeks outside the rolling window
      empTotals[name].weeklyTotals[week] = (empTotals[name].weeklyTotals[week] || 0) + (hrs || 0);
    }
  }

  lines.push('=== RESOURCES (Employee Bookings & Availability) ===');
  for (const [name, info] of Object.entries(empTotals)) {
    // Use current week's hours: earliest week_ending on or after today
    const currentEntry = Object.entries(info.weeklyTotals)
      .map(([wk, hrs]) => ({ wk, hrs, date: parseWkLabel(wk) }))
      .filter(x => x.date)
      .sort((a, b) => a.date - b.date)[0];
    const booked = currentEntry ? currentEntry.hrs : 0;
    const avail  = Math.max(0, 45 - booked);
    const status = booked <= 10   ? 'BENCH — severely underutilized, urgent'
                 : booked > 45    ? 'OVERALLOCATED — exceeds 45h target'
                 : booked === 45  ? 'FULLY UTILIZED — at target'
                 :                  `PARTIAL — has available capacity (${avail}h available)`;
    lines.push(`  ${name}: ${booked}h booked this week — ${status} — Projects: ${info.projects.join(', ') || 'none'}`);
  }

  lines.push('\n=== PROJECTS (Open Roles) ===');
  for (const row of data.demand) {
    lines.push(`  ${row.projectName} | ${row.resourceLevel} | ${row.skillSet} | ${row.startDate} – ${row.endDate}`);
  }

  lines.push('\n=== EMPLOYEES ===');
  for (const emp of data.employees) {
    lines.push(`  ${emp.employeeName} — ${emp.level}`);
  }

  lines.push('\n=== SKILLS ===');
  lines.push('  ' + data.skills.map(s => s.skillSet).join(', '));

  lines.push('\n=== RESOURCE LEVELS ===');
  lines.push('  ' + data.resourceLevels.map(l => l.level).join(', '));

  lines.push('\n=== PROJECTS ===');
  for (const p of data.projects) {
    lines.push(`  ${p.projectId}: ${p.projectName}`);
  }

  return lines.join('\n');
}

async function askClaude(question, staffingData) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return 'Error: ANTHROPIC_API_KEY is not set. Add it to your .env file.';
  }

  const context = formatContext(staffingData);
  console.log('[askClaude] availability context being sent:\n' + context.split('\n').filter(l => l.includes('available') || l.includes('BENCH')).join('\n'));
  const userMessage = `Here is the current staffing data:\n\n${context}\n\nQuestion: ${question}`;

  try {
    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userMessage }],
    });
    return response.content[0].text;
  } catch (err) {
    if (err.status === 401) return 'Error: Invalid Anthropic API key. Check your .env file.';
    if (err.status === 429) return 'Error: Rate limit reached. Please try again in a moment.';
    if (err.status === 529) return 'Error: Anthropic API is temporarily overloaded. Please try again shortly.';
    return `Error: Claude API call failed — ${err.message}`;
  }
}

// Build a compact data summary for the suggestions prompt
function buildDataSummary(data) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Per-employee week totals
  const empTotals = {};
  for (const row of data.supply) {
    const n = row.employeeName;
    if (!empTotals[n]) empTotals[n] = { weekTotals: {}, skillSet: row.skillSet, projects: [] };
    if (row.projectAssigned && !empTotals[n].projects.includes(row.projectAssigned))
      empTotals[n].projects.push(row.projectAssigned);
    for (const [wk, hrs] of Object.entries(row.weeklyHours))
      empTotals[n].weekTotals[wk] = (empTotals[n].weekTotals[wk] || 0) + (hrs || 0);
  }

  const weekKeys = data.supply.length ? Object.keys(data.supply[0].weeklyHours) : [];

  function parseWkLabel(wk) {
    const m = wk.match(/(\d+)\/(\d+)/);
    return m ? new Date(today.getFullYear(), parseInt(m[1]) - 1, parseInt(m[2])) : null;
  }

  // Current week key (first week-ending >= today)
  let currentWk = weekKeys[0] || null;
  for (const wk of weekKeys) {
    const d = parseWkLabel(wk);
    if (d && d >= today) { currentWk = wk; break; }
  }

  // Bench count (< 10h this week)
  let benchCount = 0;
  const benchNames = [];
  for (const [name, info] of Object.entries(empTotals)) {
    const hrs = info.weekTotals[currentWk] || 0;
    if (hrs < 10) { benchCount++; benchNames.push(name); }
  }

  // Avg utilization
  const avgs = Object.values(empTotals).map(info => {
    const vals = Object.values(info.weekTotals);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
  const avgUtil = avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length / 45) * 100) : 0;

  // Rolloffs in next 30 days: employees whose hours drop by >= 20h week-over-week within 30 days
  const in30 = new Date(today); in30.setDate(today.getDate() + 30);
  const rolloffs = [];
  const wkDates = weekKeys.map(wk => ({ wk, d: parseWkLabel(wk) }));
  for (const [name, info] of Object.entries(empTotals)) {
    for (let i = 1; i < wkDates.length; i++) {
      const { wk, d } = wkDates[i];
      if (!d || d < today || d > in30) continue;
      const prev = info.weekTotals[wkDates[i - 1].wk] || 0;
      const curr = info.weekTotals[wk] || 0;
      if (prev >= 20 && prev - curr >= 20) {
        const wkLabel = wk.replace('Week ending ', '');
        rolloffs.push(`${name} (${prev}h → ${curr}h Wk ending ${wkLabel})`);
        break;
      }
    }
  }

  // Open needs
  const unmetNeeds = data.demand.map(r =>
    `${r.projectName} needs ${r.resourceLevel}/${r.skillSet} from ${r.startDate} to ${r.endDate}`
  );

  const lines = [
    `Headcount: ${data.employees.length}`,
    `Average utilization: ${avgUtil}%`,
    `On bench this week (< 10h): ${benchCount}${benchNames.length ? ' — ' + benchNames.slice(0, 5).join(', ') : ''}`,
    `Roll-offs in next 30 days: ${rolloffs.length ? rolloffs.join('; ') : 'none detected'}`,
    `Open project roles (${unmetNeeds.length}): ${unmetNeeds.slice(0, 8).join(' | ') || 'none'}`,
  ];

  return lines.join('\n');
}

async function getSuggestedQuestions(staffingData) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const summary = buildDataSummary(staffingData);

    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: 512,
      system:     'You are a staffing intelligence assistant for a NetSuite consulting practice with consultants across Analyst, Consultant, Senior Consultant, Manager, Senior Manager, and Partner/MD levels working in Procure to Pay, Order to Cash, Record to Report, and Supply Chain practice areas using NetSuite, Ivalua, and Emburse. Generate exactly 5 short, specific, actionable questions a practice manager would ask right now based on this staffing data. Focus on: utilization by level, bench talent by skill set or practice area, upcoming project cliffs, unmet staffing needs, and overallocated consultants. Each question must be 12 words or fewer. Return ONLY a JSON array of 5 strings. No preamble, no markdown, no explanation.',
      messages:   [{ role: 'user', content: summary + '\n\nRemember: each question must be 12 words or fewer.' }],
    });

    const text = response.content[0].text.trim();
    // Strip any accidental markdown fences
    const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const questions = JSON.parse(clean);
    if (!Array.isArray(questions) || questions.length === 0) return null;
    return questions.slice(0, 5);
  } catch (err) {
    console.warn('[getSuggestedQuestions] failed:', err.message);
    return null;
  }
}

async function getMatchReasonings(need, matches) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return matches.map(() => 'Available capacity meets requirement.');
  }
  try {
    const matchList = matches.map((m, i) =>
      `${i + 1}. ${m.employeeName}: ${m.availableHours}h/week available (${m.currentUtilization}% utilized)`
    ).join('\n');

    const prompt = `Need: ${need.projectName} requires a ${need.resourceLevel} with ${need.skillSet} skills, ${need.hoursPerWeek}h/week from ${need.startDate} to ${need.endDate}.\n\nTop consultant matches:\n${matchList}\n\nFor each match, write exactly one sentence (15 words or fewer) explaining why they fit this need. Return ONLY a JSON array of ${matches.length} strings. No markdown, no preamble.`;

    const response = await client.messages.create({
      model:      MODEL,
      max_tokens: 512,
      system:     'You are a staffing analyst. Write concise, specific match reasoning. Return only JSON arrays.',
      messages:   [{ role: 'user', content: prompt }],
    });

    const text  = response.content[0].text.trim();
    const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    const reasonings = JSON.parse(clean);
    if (!Array.isArray(reasonings)) throw new Error('Not an array');
    return reasonings;
  } catch (err) {
    console.warn('[getMatchReasonings] failed:', err.message);
    return matches.map(() => 'Available capacity meets requirement.');
  }
}

module.exports = { askClaude, getSuggestedQuestions, getMatchReasonings };
