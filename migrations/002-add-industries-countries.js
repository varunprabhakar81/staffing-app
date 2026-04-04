/**
 * Migration 002: seed industries + countries data
 *
 * PREREQUISITE: Run 002-add-industries-countries.sql in Supabase SQL Editor first
 * to create the industries and countries tables.
 *
 * Seeds:
 *   - 2 countries: United States, India
 *   - 10 industries for every existing tenant
 *
 * Safe to re-run (upsert / on-conflict ignore).
 *
 * Usage:
 *   node migrations/002-add-industries-countries.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const serviceClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Seed data ─────────────────────────────────────────────────────────────────

const COUNTRIES = [
  { name: 'United States', sort_order: 1 },
  { name: 'India',         sort_order: 2 },
];

const INDUSTRY_NAMES = [
  'Financial Services',
  'Technology',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Energy',
  'Telecommunications',
  'Government',
  'Media & Entertainment',
  'Professional Services',
];

// ── Runner ────────────────────────────────────────────────────────────────────

async function run() {
  // 1. Seed countries
  console.log('Seeding countries...');
  const { error: countriesErr } = await serviceClient
    .from('countries')
    .upsert(COUNTRIES, { onConflict: 'name' });
  if (countriesErr) {
    if (countriesErr.message.includes('schema cache') || countriesErr.code === '42P01') {
      console.error('Error: "countries" table not found.');
      console.error('Please run migrations/002-add-industries-countries.sql in Supabase SQL Editor first.');
      process.exit(1);
    }
    throw new Error('Countries seed failed: ' + countriesErr.message);
  }

  const { count: countryCount } = await serviceClient
    .from('countries')
    .select('*', { count: 'exact', head: true });
  console.log(`  Countries in DB: ${countryCount}`);

  // 2. Get all tenants
  console.log('\nFetching tenants...');
  const { data: tenants, error: tenantsErr } = await serviceClient
    .from('tenants')
    .select('id, name');
  if (tenantsErr) throw new Error('Tenants fetch failed: ' + tenantsErr.message);
  console.log(`  Found ${tenants.length} tenant(s)`);

  // 3. Seed 10 industries for every tenant
  console.log('\nSeeding industries...');
  for (const tenant of tenants) {
    const rows = INDUSTRY_NAMES.map(name => ({ name, tenant_id: tenant.id }));
    const { error: indErr } = await serviceClient
      .from('industries')
      .upsert(rows, { onConflict: 'name,tenant_id' });
    if (indErr) {
      if (indErr.message.includes('schema cache') || indErr.code === '42P01') {
        console.error('Error: "industries" table not found.');
        console.error('Please run migrations/002-add-industries-countries.sql in Supabase SQL Editor first.');
        process.exit(1);
      }
      throw new Error(`Industries seed failed for tenant "${tenant.name}": ${indErr.message}`);
    }
    console.log(`  Seeded ${rows.length} industries for: ${tenant.name} (${tenant.id})`);
  }

  const { count: industryCount } = await serviceClient
    .from('industries')
    .select('*', { count: 'exact', head: true });
  console.log(`\n  Total industries in DB: ${industryCount}`);

  console.log('\nMigration 002 complete.');
}

run().catch(err => {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
});
