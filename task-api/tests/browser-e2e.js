'use strict';

/**
 * Browser regression tests. Starts isolated local apps, asserts actual UI/API
 * results, saves evidence inside this project, then closes every resource.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { createApp } = require('../src/server');
const { signToken } = require('../src/auth');

const SCREENSHOT_DIR = path.join(__dirname, '../public/screenshots');

function browserExecutable() {
  if (process.env.CHROME_PATH) {
    assert.ok(fs.existsSync(process.env.CHROME_PATH), 'CHROME_PATH must point to an installed Chrome/Edge executable');
    return process.env.CHROME_PATH;
  }
  const candidates = process.platform === 'win32' ? [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft/Edge/Application/msedge.exe')
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  assert.ok(executable, 'Install Chrome/Edge or set CHROME_PATH before running browser tests');
  return executable;
}

async function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

async function close(server) {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function run() {
  let browser;
  let demoServer;
  let fixedServer;
  let checks = 0;
  const check = async (name, callback) => {
    await callback();
    checks++;
    console.log('[PASS] ' + name);
  };
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  try {
    demoServer = await listen(createApp({ demo: true, version: 'v4' }));
    fixedServer = await listen(createApp({ demo: false, version: 'v4' }));
    const demoUrl = 'http://127.0.0.1:' + demoServer.address().port;
    const fixedUrl = 'http://127.0.0.1:' + fixedServer.address().port;
    console.log('[E2E] Starting headless browser...');
    browser = await puppeteer.launch({ executablePath: browserExecutable(), headless: true, defaultViewport: { width: 1440, height: 1000 } });
    console.log('[E2E] Browser launched.');
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    const pageErrors = [];
    page.on('pageerror', error => { pageErrors.push(error.message); console.error('[PAGE ERROR]', error.message); });
    await page.goto(demoUrl, { waitUntil: 'domcontentloaded' });
    console.log('[E2E] Demo page navigated.');
    await page.waitForFunction(() => document.body.dataset.ready === 'true' || document.body.dataset.error);
    assert.equal(await page.$eval('body', element => element.dataset.ready), 'true', 'Demo initialization failed');
    console.log('[E2E] Demo UI ready.');

    async function responseAfter(click) {
      const previous = await page.$eval('#res-status-badge', element => element.dataset.requestId || '0');
      await click();
      await page.waitForFunction(old => {
        const badge = document.getElementById('res-status-badge');
        return badge.dataset.requestId && badge.dataset.requestId !== old;
      }, {}, previous);
      return page.evaluate(() => ({
        status: Number(document.getElementById('res-status-badge').dataset.status),
        body: JSON.parse(document.getElementById('res-body-output').textContent)
      }));
    }
    async function scenario(description, expected, assertBody) {
      const result = await responseAfter(() => page.click('button[data-desc=' + JSON.stringify(description) + ']'));
      assert.equal(result.status, expected, description);
      if (assertBody) assertBody(result.body);
    }
    async function shot(filename, fullPage = false) {
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, filename), fullPage });
    }

    await check('Demo initializes from server metadata', async () => {
      assert.equal(await page.$eval('body', element => element.dataset.demo), 'true');
      assert.equal(await page.$eval('#server-version-select', element => element.value), 'v4');
      assert.equal(await page.$eval('#manual-token-field', element => element.hidden), true);
    });
    await check('Alice reads A1: status 200 and correct resource', async () => {
      await scenario('Alice đọc task A1 (thuộc Alpha)', 200, body => { assert.equal(body.id, 'A1'); assert.equal(body.project, 'alpha'); });
      await shot('01_alice_read_a1_200.png');
    });
    await check('Alice cannot read B1 in V4', async () => {
      await scenario('Alice đọc task B1 (thuộc Beta - IDOR test)', 403, body => assert.equal(body.error, 'forbidden'));
      await shot('02_alice_read_b1_403.png');
    });
    await check('Assigned Open task allowed; unassigned task denied', async () => {
      await scenario('Bob sửa A1 (assignee=bob, Open)', 200, body => assert.equal(body.ok, true));
      await scenario('Bob sửa A2 (chưa assign)', 403, body => assert.equal(body.error, 'forbidden'));
      await shot('03_bob_edit_a2_403.png');
    });
    await check('Client role/tenant claims cannot grant permission', async () => {
      await scenario('Bob tự khai role: Admin', 403, body => assert.equal(body.error, 'forbidden'));
      await scenario('Dana gửi X-Tenant-Id: beta', 403, body => assert.equal(body.error, 'forbidden'));
      await shot('04_dana_forge_tenant_403.png');
    });
    await check('Browser oracle asserts 17 actual successful results and zero failures', async () => {
      await page.click('button[data-tab="tab-oracle"]');
      await page.click('#btn-run-all-oracle');
      await page.waitForFunction(() => !document.getElementById('btn-run-all-oracle').disabled, { timeout: 20000 });
      const result = await page.$eval('#oracle-summary', element => ({ ...element.dataset }));
      assert.equal(result.error, undefined);
      assert.equal(result.pass, '17');
      assert.equal(result.fail, '0');
      assert.equal(await page.$$eval('#oracle-tbody tr[data-pass="true"]', rows => rows.length), 17);
      assert.equal(await page.$$eval('#oracle-tbody tr[data-pass="false"]', rows => rows.length), 0);
      await shot('05_test_oracle_17_pass.png', true);
    });
    await check('Same IDOR expectation is red on V0 and green on V1; valid reads still pass', async () => {
      await page.click('button[data-tab="tab-evidence"]');
      await page.click('#btn-run-evidence');
      await page.waitForFunction(() => !document.getElementById('btn-run-evidence').disabled, { timeout: 20000 });
      const result = await page.$eval('#evidence-summary', element => ({ ...element.dataset }));
      assert.equal(result.error, undefined);
      assert.equal(result.complete, 'true');
      assert.equal(result.red, 'true');
      assert.equal(result.green, 'true');
      assert.equal(await page.$eval('#server-version-select', element => element.value), 'v4', 'Evidence must restore selected version');
      assert.match(await page.$eval('#evidence-before', element => element.textContent), /Thực tế: HTTP 200/);
      assert.match(await page.$eval('#evidence-after', element => element.textContent), /Thực tế: HTTP 403/);
      await shot('06_idor_evidence_tab.png');
    });
    await check('Permission matrix is available', async () => {
      await page.click('button[data-tab="tab-matrix"]');
      assert.equal(await page.$$eval('#tab-matrix tbody tr', rows => rows.length), 5);
      await shot('07_permission_matrix_tab.png');
    });

    const requestedPaths = [];
    page.on('request', request => requestedPaths.push(new URL(request.url()).pathname));
    await page.goto(fixedUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.ready === 'true' || document.body.dataset.error);
    assert.equal(await page.$eval('body', element => element.dataset.ready), 'true', 'Fixed UI initialization failed');
    await check('Fixed API UI disables demo controls and does not request demo tokens', async () => {
      assert.equal(await page.$eval('body', element => element.dataset.demo), 'false');
      for (const selector of ['#server-version-select', '#btn-reset-db', '#req-user', '#auto-reset-cb', '#btn-run-all-oracle', '#btn-run-evidence']) {
        assert.equal(await page.$eval(selector, element => element.disabled), true, selector + ' must be disabled');
      }
      assert.equal(await page.$$eval('.test-scenario-btn', buttons => buttons.every(button => button.disabled)), true);
      assert.equal(await page.$eval('#manual-token-field', element => element.hidden), false);
      assert.equal(requestedPaths.includes('/api/tokens'), false);
    });
    await check('Fixed API accepts manually supplied token and rejects version downgrade header', async () => {
      await page.$eval('#req-token', (element, token) => { element.value = token; }, signToken('alice'));
      await page.$eval('#req-path', element => { element.value = '/tasks/B1?version=v0'; });
      await page.$eval('#req-headers', element => { element.value = 'X-Version: v0'; });
      const result = await responseAfter(() => page.click('#btn-send-req'));
      assert.equal(result.status, 403);
      assert.equal(result.body.error, 'forbidden');
    });
    await check('No JavaScript errors on demo or fixed UI', async () => assert.deepEqual(pageErrors, []));
    console.log('\nBrowser E2E: ' + checks + '/' + checks + ' checks passed; oracle 17/17. Evidence: public/screenshots/.');
  } finally {
    if (browser) await browser.close();
    await close(demoServer);
    await close(fixedServer);
  }
}

run().catch(error => {
  console.error('[FAIL] Browser E2E:', error);
  process.exitCode = 1;
});
