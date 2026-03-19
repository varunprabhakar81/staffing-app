require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const MODEL  = 'claude-sonnet-4-6';
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a staffing analyst assistant for a NetSuite consulting firm.
You have access to the firm's current resourcing data and answer questions about staff utilization, bench, project coverage, and open demand.

Utilization rules:
- 45 hours/week = fully utilized (target)
- > 45 hours/week = overbooked (a problem — risk of burnout and quality issues)
- 40–44 hours/week = nominal (acceptable but slightly under target)
- < 40 hours/week = underutilized (available for additional work)
- 0 hours/week = on bench (fully available, no project assignment)

Always be concise and specific. Name actual employees and projects from the data when relevant.
Format lists clearly. Do not make up employees or projects not present in the data.`;

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

  lines.push('=== SUPPLY (Employee Bookings) ===');
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

  lines.push('\n=== DEMAND (Open Roles) ===');
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

module.exports = { askClaude };

// ── Quick test when run directly ─────────────────────────────────────────────
if (require.main === module) {
  const { readStaffingData } = require('./excelReader');

  const TEST_QUESTIONS = [
    'Who is on the bench?',
    'Who is overbooked?',
    'Who is fully utilized?',
  ];

  (async () => {
    console.log('Loading staffing data...');
    const data = await readStaffingData();
    if (data.error) {
      console.error('Could not load Excel data:', data.error);
      process.exit(1);
    }
    console.log(`Loaded: ${data.supply.length} supply rows, ${data.employees.length} employees\n`);

    for (const q of TEST_QUESTIONS) {
      console.log(`Q: ${q}`);
      console.log('A:', await askClaude(q, data));
      console.log('─'.repeat(60));
    }
  })();
}
