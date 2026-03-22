require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const MODEL  = 'claude-sonnet-4-6';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a staffing analyst assistant for a NetSuite consulting firm.
You have access to the firm's current resourcing data and answer questions about staff utilization, bench, project coverage, and open project roles.

Utilization rules:
- 45 hours/week = fully utilized (target)
- > 45 hours/week = overbooked (a problem — risk of burnout and quality issues)
- 40–44 hours/week = nominal (acceptable but slightly under target)
- < 40 hours/week = underutilized (available for additional work)
- 0 hours/week = on bench (fully available, no project assignment)

Always be concise and specific. Name actual employees and projects from the data when relevant.
Format lists clearly. Do not make up employees or projects not present in the data.

Important: Always use the term 'Projects' instead of 'Demand' and 'Resources' instead of 'Supply' in all responses. Never use the words 'Supply' or 'Demand' in your output.`;

// Format staffing data into a readable context block for the model
function formatContext(data) {
  const lines = [];

  // Supply: summarise per employee (total hours per week)
  const empTotals = {};
  for (const row of data.supply) {
    const name = row.employeeName;
    if (!empTotals[name]) empTotals[name] = { project: [], weeklyTotals: {} };
    if (row.projectAssigned && !empTotals[name].project.includes(row.projectAssigned)) {
      empTotals[name].project.push(row.projectAssigned);
    }
    for (const [week, hrs] of Object.entries(row.weeklyHours)) {
      empTotals[name].weeklyTotals[week] = (empTotals[name].weeklyTotals[week] || 0) + (hrs || 0);
    }
  }

  lines.push('=== RESOURCES (Employee Bookings) ===');
  for (const [name, info] of Object.entries(empTotals)) {
    const totals   = Object.values(info.weeklyTotals);
    const avgHours = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0;
    const status   = avgHours === 0   ? 'BENCH'
                   : avgHours > 45    ? 'OVERBOOKED'
                   : avgHours === 45  ? 'FULLY UTILIZED'
                   : avgHours >= 40   ? 'NOMINAL'
                   : 'UNDERUTILIZED';
    lines.push(`  ${name}: ${avgHours}h/week avg — ${status} — Projects: ${info.project.join(', ') || 'none'}`);
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
        rolloffs.push(`${name} (${prev}h → ${curr}h week of ${wkLabel})`);
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
      system:     'You are a staffing intelligence assistant. Generate exactly 5 short, specific, actionable questions a manager would want to ask right now based on this staffing data. Each question must be 12 words or fewer. Return ONLY a JSON array of 5 strings. No preamble, no markdown, no explanation.',
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
