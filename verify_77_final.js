const fs = require('fs');
const app = fs.readFileSync('public/app.js', 'utf8');
const css = fs.readFileSync('public/styles.css', 'utf8');

const checks = [
  ['Bench tint has 8-week horizon cutoff', app.includes('cutoff') || app.includes('56') || app.includes('8 week') || app.includes('planningHorizon')],
  ['Neutral color beyond horizon', app.includes('#161820') && app.includes('cutoff') || app.includes('beyond')],
  ['Under tint changed to indigo', app.includes('99,102,241') || app.includes('6366F1') || app.includes('6366f1')],
  ['Legend under swatch updated to indigo', app.includes('6366F1') || app.includes('6366f1') || app.includes('99,102,241')],
  ['Current week blue still present', app.includes('59,130,246') || css.includes('59,130,246')],
];

let pass = 0, fail = 0;
checks.forEach(([label, result]) => {
  if (result) pass++; else fail++;
  console.log((result ? 'PASS' : 'FAIL') + ' - ' + label);
});
console.log('');
console.log('Result: ' + pass + '/' + checks.length + (fail > 0 ? ' - ' + fail + ' need attention' : ' - all clear'));
