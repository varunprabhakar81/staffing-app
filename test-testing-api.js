/**
 * test-testing-api.js
 * End-to-end test of the /api/test-results endpoints.
 * Tests submit flow, admin summary, reset.
 * Usage: node test-testing-api.js <password_for_gmail_accounts>
 */
require('dotenv').config();
const http = require('http');

const BASE = 'http://localhost:3000';

async function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {})
      }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const setCookie = res.headers['set-cookie']?.[0];
        try { resolve({ status: res.statusCode, body: JSON.parse(data), cookie: setCookie }); }
        catch { resolve({ status: res.statusCode, body: data, cookie: setCookie }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function login(email, password) {
  const r = await request('POST', '/api/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(r.body)}`);
  return r.cookie; // session cookie
}

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.log(`  ✗ FAIL: ${msg}`); process.exitCode = 1; }
function section(msg) { console.log(`\n── ${msg}`); }

(async () => {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: node test-testing-api.js <password>');
    process.exit(1);
  }

  let cookie;

  // ── Test 1: Non-test-admin cannot access summary
  section('Test 1: vaprabhakar@deloitte.com — not test admin');
  cookie = await login('vaprabhakar@deloitte.com', password);
  const me1 = await request('GET', '/api/auth/me', null, cookie);
  me1.body.is_test_admin === false ? pass('is_test_admin=false') : fail(`is_test_admin=${me1.body.is_test_admin}`);
  const sum1 = await request('GET', '/api/test-results/summary', null, cookie);
  sum1.status === 403 ? pass('Summary returns 403') : fail(`Summary returned ${sum1.status}`);

  // ── Test 2: test admin CAN access summary (initially empty)
  section('Test 2: varun.prabhakar+meridian@gmail.com — test admin');
  const adminCookie = await login('varun.prabhakar+meridian@gmail.com', password);
  const me2 = await request('GET', '/api/auth/me', null, adminCookie);
  me2.body.is_test_admin === true ? pass('is_test_admin=true') : fail(`is_test_admin=${me2.body.is_test_admin}`);
  const sum2 = await request('GET', '/api/test-results/summary', null, adminCookie);
  sum2.status === 200 ? pass(`Summary returns 200 (${sum2.body.length} testers)`) : fail(`Summary returned ${sum2.status}: ${JSON.stringify(sum2.body)}`);

  // ── Test 3: Write test results as meridian account
  section('Test 3: Save test results');
  const r1 = await request('POST', '/api/test-results', {
    test_case_id: 'TC-AUTH-001', status: 'pass', notes: 'Works fine'
  }, adminCookie);
  r1.status === 200 ? pass('Save TC-AUTH-001 pass') : fail(`Save returned ${r1.status}: ${JSON.stringify(r1.body)}`);

  const r2 = await request('POST', '/api/test-results', {
    test_case_id: 'TC-AUTH-002', status: 'fail', notes: 'Button missing'
  }, adminCookie);
  r2.status === 200 ? pass('Save TC-AUTH-002 fail') : fail(`Save returned ${r2.status}: ${JSON.stringify(r2.body)}`);

  // ── Test 4: GET own results
  section('Test 4: Get own results');
  const getR = await request('GET', '/api/test-results', null, adminCookie);
  getR.status === 200 ? pass(`GET returns 200 (${getR.body.length} results)`) : fail(`GET returned ${getR.status}`);
  const submitted = getR.body.some(r => r.submitted_at !== null);
  submitted ? fail('submitted_at should be null before submit') : pass('submitted_at=null before submit');

  // ── Test 5: Submit
  section('Test 5: Submit');
  const subR = await request('POST', '/api/test-results/submit', {}, adminCookie);
  subR.status === 200 ? pass(`Submit returns 200 (updated=${subR.body.updated})`) : fail(`Submit returned ${subR.status}: ${JSON.stringify(subR.body)}`);

  // Verify submitted_at is set
  const getR2 = await request('GET', '/api/test-results', null, adminCookie);
  const allSubmitted = getR2.body.length > 0 && getR2.body.every(r => r.submitted_at !== null);
  allSubmitted ? pass('All rows have submitted_at set') : fail('Some rows missing submitted_at');

  // ── Test 6: Cannot write after submit
  section('Test 6: Blocked writes after submit');
  const r3 = await request('POST', '/api/test-results', {
    test_case_id: 'TC-AUTH-003', status: 'pass'
  }, adminCookie);
  r3.status === 409 ? pass('POST /api/test-results returns 409 after submit') : fail(`Expected 409, got ${r3.status}: ${JSON.stringify(r3.body)}`);

  // ── Test 7: Summary shows submitted tester
  section('Test 7: Summary after submit');
  const sum3 = await request('GET', '/api/test-results/summary', null, adminCookie);
  sum3.status === 200 ? pass('Summary 200') : fail(`Summary ${sum3.status}`);
  const myRow = sum3.body.find(t => t.user_email === 'varun.prabhakar+meridian@gmail.com');
  if (!myRow) { fail('Own row not in summary'); }
  else {
    myRow.submitted_at ? pass(`Row status=Submitted (submitted_at=${myRow.submitted_at})`) : fail('Row missing submitted_at');
    myRow.pass_count === 1 ? pass(`pass_count=1`) : fail(`pass_count=${myRow.pass_count}`);
    myRow.fail_count === 1 ? pass(`fail_count=1`) : fail(`fail_count=${myRow.fail_count}`);
  }

  // ── Test 8: Reset own results
  section('Test 8: Reset own results');
  const resetR = await request('POST', '/api/test-results/reset', { user_id: me2.body.id }, adminCookie);
  resetR.status === 200 ? pass('Reset returns 200') : fail(`Reset returned ${resetR.status}: ${JSON.stringify(resetR.body)}`);

  // Verify cleared
  const getR3 = await request('GET', '/api/test-results', null, adminCookie);
  getR3.body.length === 0 ? pass('Own results cleared') : fail(`${getR3.body.length} rows remain`);

  // Can write again
  const r4 = await request('POST', '/api/test-results', {
    test_case_id: 'TC-AUTH-001', status: 'pass'
  }, adminCookie);
  r4.status === 200 ? pass('Can write again after reset') : fail(`Write after reset: ${r4.status} ${JSON.stringify(r4.body)}`);

  // Cleanup — reset all
  await request('POST', '/api/test-results/reset', {}, adminCookie);
  pass('Cleanup: reset all');

  console.log('\n' + (process.exitCode === 1 ? 'SOME TESTS FAILED' : 'ALL TESTS PASSED'));
})().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
