// Build first: npm run build --prefix frontend
// Compare: node scripts/check-screenshots.cjs
// Intentionally refresh reviewed UI: node scripts/check-screenshots.cjs --update-baselines
const { chromium } = require('../frontend/node_modules/playwright');
// ponytail: bundled PNG decoder avoids another dependency; revisit when upgrading Playwright.
const { PNG } = require('../frontend/node_modules/playwright-core/lib/utilsBundle.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

assert.equal(process.platform, 'linux', 'Run screenshot checks with scripts/Dockerfile.screenshots (pinned Linux/Chromium).');
assert.equal(process.arch, 'x64', 'Screenshot baselines require linux/amd64.');
const root = path.resolve(__dirname, '..');
const baselines = path.join(__dirname, 'screenshots', 'linux-chromium');
const artifacts = path.join(root, '.local', 'screenshot-results');
const update = process.argv.includes('--update-baselines');
assert(process.argv.slice(2).every(arg => arg === '--update-baselines'), 'Only --update-baselines is supported.');
const id = '4613eeb7-7064-41da-bb06-62630b3eaebc';
const draft = {
  title: 'Fever and dry cough',
  vignette: 'A fictional 28-year-old patient reports fever, dry cough and muscle aches for two days. There is no shortness of breath.',
  symptoms: ['Fever', 'Dry cough', 'Muscle aches'],
  age_years: 28,
};
const clinicalCase = { ...draft, id, created_at: '2026-10-08T12:00:00Z' };
const listen = async server => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
};

function compare(actual, expected) {
  if (actual.width !== expected.width || actual.height !== expected.height)
    return { message: `Dimensions changed: ${expected.width}x${expected.height} -> ${actual.width}x${actual.height}` };
  const diff = new PNG({ width: actual.width, height: actual.height });
  let changed = 0;
  for (let offset = 0; offset < actual.data.length; offset += 4) {
    // Linux hosts can round antialiased borders by one RGB level; keep alpha exact.
    const same = actual.data[offset + 3] === expected.data[offset + 3]
      && [0, 1, 2].every(channel => Math.abs(actual.data[offset + channel] - expected.data[offset + channel]) <= 1);
    if (!same) changed++;
    diff.data.set(same ? [255, 255, 255, 255] : [255, 0, 0, 255], offset);
  }
  return changed ? { message: `${changed} pixels changed`, diff: PNG.sync.write(diff) } : null;
}
// Verify the comparator detects pixels AND dimensions rather than PNG encoding changes.
const sample = { width: 1, height: 1, data: Buffer.from([100, 100, 100, 255]) };
assert.equal(compare(sample, { ...sample, data: Buffer.from(sample.data) }), null);
assert.equal(compare(sample, { ...sample, data: Buffer.from([99, 101, 100, 255]) }), null);
for (const channel of [0, 1, 2]) {
  const data = Buffer.from(sample.data);
  data[channel] += 2;
  assert(compare(sample, { ...sample, data }).diff);
}
assert(compare(sample, { ...sample, data: Buffer.from([100, 100, 100, 254]) }).diff);
assert(compare(sample, { ...sample, width: 2 }).message.includes('Dimensions'));

(async () => {
  fs.mkdirSync(artifacts, { recursive: true });
  if (update) fs.mkdirSync(baselines, { recursive: true });
  const api = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const body = pathname === '/api/v1/auth/me' ? { user: null } : pathname === '/api/v1/clinical-cases'
      ? { items: [clinicalCase], has_more: true } : clinicalCase;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  });
  const apiPort = await listen(api);
  const reservation = http.createServer();
  const port = await listen(reservation);
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--port', String(port), '--hostname', '127.0.0.1'],
    { cwd: path.join(root, 'frontend'), env: { ...process.env, API_INTERNAL_URL: `http://127.0.0.1:${apiPort}` }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  let browser;
  try {
    for (let n = 0; n < 100; n++) {
      if (server.exitCode !== null) throw new Error(logs);
      try { if ((await fetch(origin)).ok) break; } catch {}
      if (n === 99) throw new Error('Screenshot production server did not become ready.');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ headless: true });
    const environment = { platform: process.platform, osRelease: require('node:os').release(), architecture: process.arch, browser: browser.version(), playwright: require('../frontend/node_modules/playwright/package.json').version };
    const failures = [];
    const captured = [];
    for (const [size, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', reducedMotion: 'reduce' });
      // Streaming routes can retain hidden copies while the active content is revealed.
      const visible = testId => page.getByTestId(testId).filter({ visible: true });
      let signedIn = false;
      const unexpectedRequests = [];
      await page.route('**/*', route => {
        if (new URL(route.request().url()).origin !== origin) {
          unexpectedRequests.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });
      const user = { id: '11111111-1111-4111-8111-111111111111', username: 'case_learner' };
      await page.route('**/api/backend/auth/me', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: signedIn ? user : null }) }));
      await page.route('**/api/backend/profile?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        user, attempt_count: 2, correct_count: 1, incorrect_count: 1, points: 100, has_more: false, cases_has_more: false,
        attempts: [
          { id: '11111111-1111-4111-8111-111111111112', clinical_case_id: id, title: draft.title, archived: false, diagnosis: 'Influenza', alternative_diagnoses: ['Common cold'], reasoning: 'The acute fever and muscle aches support the primary diagnosis.', score: 100, is_correct: true, created_at: '2026-10-08T12:00:00Z' },
          { id: '11111111-1111-4111-8111-111111111113', clinical_case_id: id, title: draft.title, archived: false, diagnosis: 'Common cold', alternative_diagnoses: ['Flu', 'Asthma'], reasoning: 'I initially focused on the cough.', score: 0, is_correct: false, created_at: '2026-10-07T12:00:00Z' },
        ],
        cases: [{ id: '11111111-1111-4111-8111-111111111114', title: 'Sudden fever and fatigue', archived: false, can_edit: true }],
      }) }));
      await page.route('**/api/backend/clinical-cases/*/attempts', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ score: 0, max_score: 100, is_correct: false, feedback: 'Your diagnosis does not match an accepted answer.', accepted_diagnoses: ['Influenza', 'Flu'], matched_alternative_diagnoses: ['Flu'] }) }));
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/backend/clinical-cases/extract', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ draft, warnings: [] }) }));
      await page.route('**/api/backend/analytics?*', route => {
        assert.equal(route.request().headers()['x-author-key'], 'screenshot-author-key');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          days: 30, start_at: '2026-09-08T12:00:00Z', end_at: '2026-10-08T12:00:00Z',
          case_count: 12, attempt_count: 9, correct_attempt_count: 6, correct_percentage: 66.7,
        }) });
      });
      for (const [name, route, ready] of [
        ['home', '/', 'home-create-case'],
        ['catalog', '/clinical-cases', 'catalog-case'],
        ['case', `/clinical-cases/${id}`, 'case-title'],
        ['case-feedback', `/clinical-cases/${id}`, 'case-title'],
        ['account', '/account', 'account-dashboard'],
        ['analytics', '/analytics', 'analytics-initial'],
        ['author', '/clinical-cases/new', 'author-source-text'],
      ]) {
        signedIn = name === "account";
        await page.goto(origin + route);
        await visible(ready).waitFor();
        if (name === 'account') {
          await page.getByRole('heading', { name: 'Answer history' }).waitFor();
          assert.equal(await page.locator('.profile-list').filter({ visible: true }).first().locator('li').count(), 2);
          assert(await page.getByRole('link', { name: 'Edit', exact: true }).isVisible());
        }
        if (name === 'case-feedback') {
          await visible('attempt-diagnosis').fill('Common cold');
          await visible('attempt-alternatives').fill('Flu\nAsthma');
          await visible('attempt-reasoning').fill('Fever and cough suggest a respiratory infection.');
          await page.getByRole('checkbox', { name: 'I understand and want to submit as a guest.' }).check();
          await visible('attempt-submit').click();
          await visible('attempt-result').waitFor();
        }
        if (name === 'analytics') {
          await visible('analytics-key').fill('screenshot-author-key');
          await visible('analytics-load').click();
          await visible('analytics-cards').waitFor();
        } else if (name === 'author') {
          await visible('author-source-text').fill(draft.vignette);
          await visible('author-extract-submit').click();
          await visible('author-draft-title').waitFor();
          await visible('author-reference-diagnosis').fill('Influenza');
          await visible('author-accepted-alternatives').fill('Flu');
        }
        for (const selector of ['nav-home-link', 'nav-all-cases', 'nav-create-case', 'nav-analytics', 'nav-account', 'nav-docs', 'footer-github'])
          assert(await visible(selector).isVisible(), `Missing ${selector} on ${name}/${size}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name}/${size} overflows`);
        await page.evaluate(async () => { await document.fonts.ready; document.activeElement?.blur(); window.scrollTo(0, 0); });
        const file = `${name}-${size}.png`;
        for (const artifact of [file, file.replace('.png', '-diff.png')])
          fs.rmSync(path.join(artifacts, artifact), { force: true });
        const options = { fullPage: true, animations: 'disabled', caret: 'hide' };
        let actual = await page.screenshot(options);
        let stable = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const next = await page.screenshot(options);
          if (compare(PNG.sync.read(next), PNG.sync.read(actual)) === null) { stable = true; break; }
          actual = next;
        }
        assert(stable, `${file} did not stabilize`);
        const baseline = path.join(baselines, file);
        if (update) fs.writeFileSync(baseline, actual);
        else if (!fs.existsSync(baseline)) {
          fs.writeFileSync(path.join(artifacts, file), actual);
          failures.push(`${file}: baseline missing; review --update-baselines output`);
        }
        else {
          const difference = compare(PNG.sync.read(actual), PNG.sync.read(fs.readFileSync(baseline)));
          if (difference) {
            fs.writeFileSync(path.join(artifacts, file), actual);
            if (difference.diff) fs.writeFileSync(path.join(artifacts, file.replace('.png', '-diff.png')), difference.diff);
            failures.push(`${file}: ${difference.message}`);
          }
        }
        captured.push(file);
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpectedRequests, [], "Screenshot pages must not contact external services.");
      await page.close();
    }
    const report = { status: failures.length ? 'failed' : update ? 'updated' : 'passed', environment, captured, failures };
    fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    if (update) fs.writeFileSync(path.join(baselines, 'environment.json'), JSON.stringify(environment, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
    assert.equal(failures.length, 0, `Screenshot regressions (actual/diff: ${artifacts}):\n${failures.join('\n')}\nBaselines depend on OS/fonts/Chrome; refresh only after reviewing intentional changes.`);
  } finally {
    if (browser) await browser.close();
    server.kill();
    if (server.exitCode === null) await once(server, 'exit');
    await new Promise(resolve => api.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

