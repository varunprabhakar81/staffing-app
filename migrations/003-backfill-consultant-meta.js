/**
 * Migration 003: backfill industry + country for consultants missing these fields
 *
 * For each tenant:
 *   - Assigns a random industry (from that tenant's industries table) to consultants
 *     where industry IS NULL or ''
 *   - Assigns a random country (80% United States, 20% India) to consultants
 *     where country IS NULL or ''
 *
 * Safe to re-run — skips consultants that already have both values set.
 *
 * Usage:
 *   node migrations/003-backfill-consultant-meta.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const serviceClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickCountry() {
  return Math.random() < 0.8 ? 'United States' : 'India';
}

async function run() {
  // 1. Fetch all tenants
  console.log('Fetching tenants...');
  const { data: tenants, error: tenantsErr } = await serviceClient
    .from('tenants')
    .select('id, name');
  if (tenantsErr) throw new Error('Tenants fetch failed: ' + tenantsErr.message);
  console.log(`  Found ${tenants.length} tenant(s)\n`);

  // 2. Fetch all countries (global — no tenant_id)
  const { data: countriesData, error: countriesErr } = await serviceClient
    .from('countries')
    .select('name')
    .order('sort_order');
  if (countriesErr) throw new Error('Countries fetch failed: ' + countriesErr.message);
  const countryNames = countriesData.map(c => c.name);
  console.log(`Countries available: ${countryNames.join(', ')}\n`);

  const summary = [];

  for (const tenant of tenants) {
    console.log(`── Tenant: ${tenant.name} (${tenant.id})`);

    // 3. Fetch this tenant's industries
    const { data: industriesData, error: indErr } = await serviceClient
      .from('industries')
      .select('name')
      .eq('tenant_id', tenant.id)
      .order('name');
    if (indErr) throw new Error(`Industries fetch failed for "${tenant.name}": ${indErr.message}`);
    const industryNames = industriesData.map(i => i.name);
    if (!industryNames.length) {
      console.log('  No industries found — skipping tenant');
      continue;
    }
    console.log(`  Industries: ${industryNames.join(', ')}`);

    // 4. Fetch all consultants for this tenant
    const { data: consultants, error: consErr } = await serviceClient
      .from('consultants')
      .select('id, name, industry, country')
      .eq('tenant_id', tenant.id);
    if (consErr) throw new Error(`Consultants fetch failed for "${tenant.name}": ${consErr.message}`);
    console.log(`  Total consultants: ${consultants.length}`);

    // 5. Filter to those missing industry or country
    const toUpdate = consultants.filter(c => !c.industry || !c.country);
    console.log(`  Need backfill: ${toUpdate.length}`);

    if (!toUpdate.length) {
      console.log('  All consultants already have industry + country — nothing to do.\n');
      summary.push({ tenant: tenant.name, updated: 0, sample: [] });
      continue;
    }

    // 6. Build updates
    const updates = toUpdate.map(c => ({
      id: c.id,
      industry: c.industry || pickRandom(industryNames),
      country:  c.country  || pickCountry(),
    }));

    // 7. Apply updates one by one (upsert by id)
    let successCount = 0;
    for (const u of updates) {
      const { error: updErr } = await serviceClient
        .from('consultants')
        .update({ industry: u.industry, country: u.country })
        .eq('id', u.id)
        .eq('tenant_id', tenant.id);
      if (updErr) {
        console.warn(`  WARNING: failed to update consultant ${u.id}: ${updErr.message}`);
      } else {
        successCount++;
      }
    }
    console.log(`  Updated: ${successCount} / ${toUpdate.length}`);

    // 8. Fetch sample of 5 for Meridian report
    const { data: sample, error: sampleErr } = await serviceClient
      .from('consultants')
      .select('name, industry, country')
      .eq('tenant_id', tenant.id)
      .order('name')
      .limit(5);

    summary.push({
      tenant: tenant.name,
      updated: successCount,
      sample: sampleErr ? [] : sample,
    });
    console.log();
  }

  // ── Report ───────────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════════');
  console.log('Migration 003 complete — Summary');
  console.log('══════════════════════════════════════════');
  for (const s of summary) {
    console.log(`\nTenant: ${s.tenant}`);
    console.log(`  Consultants updated: ${s.updated}`);
    if (s.sample.length) {
      console.log('  Sample (up to 5):');
      for (const c of s.sample) {
        console.log(`    ${c.name.padEnd(30)} industry=${c.industry || '(none)'}  country=${c.country || '(none)'}`);
      }
    }
  }
}

run().catch(err => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
