// Opens the built page in Chromium at a desktop and a phone width, as it
// will be played: inside a sandboxed frame with scripts only. Checks that it
// starts, runs, explains itself, never scrolls sideways and logs no errors.
//
//   node test/browser/smoke.mjs [--shots <dir>]
//
// CHROMIUM_PATH can point at a Chromium to use instead of Playwright's own.

import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const shotsAt = process.argv.indexOf('--shots');
const shots = shotsAt > 0 ? process.argv[shotsAt + 1] : null;
if (shots) await mkdir(shots, { recursive: true });

const fragment = await readFile(join(root, 'dist/index.html'), 'utf8');
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${fragment}</body></html>`;
const framed = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style></head>
<body><iframe sandbox="allow-scripts" src="/page"></iframe></body></html>`;

const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(req.url === '/framed' ? framed : page);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`FAIL ${msg}`);
};
const ok = (msg) => console.log(`ok   ${msg}`);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const vp of [
    { name: 'desktop', width: 1280, height: 860 },
    { name: 'phone', width: 390, height: 844, mobile: true },
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.mobile ? 2 : 1,
      isMobile: !!vp.mobile,
      hasTouch: !!vp.mobile,
    });
    // no network in tests: the web fonts load as empty stylesheets
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const tab = await ctx.newPage();
    const errors = [];
    tab.on('pageerror', (e) => errors.push(`pageerror: ${e.stack || e.message}`));
    tab.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    await tab.goto(`${base}/framed`);
    const app = await (await tab.waitForSelector('iframe')).contentFrame();
    const frame = tab.frameLocator('iframe');
    await app.waitForFunction(() => window.__ml && window.__ml.state.last, null, { timeout: 15000 });
    const mode = await app.evaluate(() => `${window.__ml.host.mode}, ${window.__ml.state.kernel}`);
    ok(`${vp.name}: page ready (${mode})`);

    await frame.locator('#play').click();
    await app.waitForFunction(() => window.__ml.state.last?.gen > 30, null, { timeout: 20000 }).then(
      () => ok(`${vp.name}: generations pass when played`),
      () => fail(`${vp.name}: nothing happened after Play`),
    );
    await frame.locator('#play').click(); // pause
    await app.waitForFunction(() => !window.__ml.state.running, null, { timeout: 5000 });

    const overflow = await app.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) fail(`${vp.name}: page scrolls sideways by ${overflow}px`);
    else ok(`${vp.name}: no sideways scrolling`);
    if (shots) await tab.screenshot({ path: join(shots, `${vp.name}-start.png`) });

    // a number explains itself, and so does a gene
    await frame.locator('.readout[data-readout="survival"]').click();
    await frame.locator('#sheet:not([hidden])').waitFor({ timeout: 3000 }).then(
      () => ok(`${vp.name}: tapping a number opens its explanation`),
      () => fail(`${vp.name}: the explanation did not open`),
    );
    await frame.locator('#sheet-close').click();
    const box = await frame.locator('#map').boundingBox();
    await frame.locator('#map').click({ position: { x: 6, y: 6 } });
    const gene = await frame.locator('#sheet-body h2').textContent({ timeout: 3000 }).catch(() => '');
    if (/^Gene /.test(gene)) ok(`${vp.name}: tapping the map opens ${gene} (map ${Math.round(box.width)}×${Math.round(box.height)})`);
    else fail(`${vp.name}: tapping the map did not open a gene card`);
    await frame.locator('#sheet-close').click();

    // Learn: predict first, then Show me
    await frame.locator('[data-tab="learn"]').click();
    await frame.locator('[data-option="1"]').click();
    await frame.locator('.predict-a').waitFor({ timeout: 3000 }).then(
      () => ok(`${vp.name}: a prediction reveals the answer`),
      () => fail(`${vp.name}: the prediction did not reveal its answer`),
    );
    await frame.locator('#show-me').click();
    await app.waitForFunction(() => window.__ml.state.last?.gen >= 4000 && !window.__ml.state.running && !window.__ml.state.show, null, { timeout: 90000 }).then(
      () => ok(`${vp.name}: Show me runs 4,000 generations and stops`),
      () => fail(`${vp.name}: Show me did not finish`),
    );
    if (shots) {
      await app.evaluate(() => window.scrollTo(0, 0));
      await tab.waitForTimeout(300);
      await tab.screenshot({ path: join(shots, `${vp.name}-shown.png`) });
    }

    for (const t of ['watch', 'learn', 'lab', 'check']) {
      const btn = frame.locator(`[data-tab="${t}"]`);
      if (!(await btn.isVisible())) continue;
      await btn.click();
      await tab.waitForTimeout(250);
      const over = await app.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 0) fail(`${vp.name}: the ${t} tab scrolls sideways by ${over}px`);
      if (shots) {
        await app.evaluate(() => document.querySelector('#side').scrollIntoView());
        await tab.waitForTimeout(150);
        await tab.screenshot({ path: join(shots, `${vp.name}-${t}.png`) });
      }
    }
    const score = await frame.locator('.score').textContent();
    if (/(\d+) of \1 checks match/.test(score)) ok(`${vp.name}: Validation shows ${score.trim()}`);
    else fail(`${vp.name}: unexpected validation score "${score}"`);

    // Lab: a live change, then a scenario that ends in meltdown
    await frame.locator('[data-tab="lab"]').click();
    await app.evaluate(() => {
      const el = document.querySelector('input[data-setting="U"]');
      el.value = '400'; // U = 2
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await app.waitForFunction(() => window.__ml.state.params.U === 2, null, { timeout: 5000 }).then(
      () => ok(`${vp.name}: a live setting changes the running population`),
      () => fail(`${vp.name}: the live U setting did not apply`),
    );
    await frame.locator('[data-scenario="small"]').click();
    await app.waitForFunction(() => window.__ml.state.extinct, null, { timeout: 90000 }).then(
      () => ok(`${vp.name}: the small population melts down`),
      () => fail(`${vp.name}: the small population did not die out`),
    );
    const said = await frame.locator('#narrator').textContent();
    if (/Extinct/.test(said)) ok(`${vp.name}: the narrator says what happened`);
    else fail(`${vp.name}: narrator says "${said}"`);

    if (errors.length) for (const e of errors) fail(`${vp.name}: ${e}`);
    else ok(`${vp.name}: no errors in the console`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s)`);
  process.exit(1);
}
console.log('\nall browser checks passed');
