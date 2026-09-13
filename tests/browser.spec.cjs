const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = route.replace(/^\/afterlight\//, '').replace(/^\//, '') || 'index.html';
  const target = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.setHeader('Content-Type', mime[path.extname(target)] || 'application/octet-stream');
  fs.createReadStream(target).pipe(res);
});

async function keyFor(page, key, milliseconds) {
  await page.keyboard.down(key);
  await page.clock.runFor(milliseconds);
  await page.keyboard.up(key);
  await page.clock.runFor(25);
}

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  try {
    const external = process.env.AFTERLIGHT_URL;
    const urls = external ? [external] : [pathToFileURL(path.join(root, 'index.html')).href,
      `http://127.0.0.1:${server.address().port}/afterlight/`];
    for (let i = 0; i < urls.length; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      const errors = [];
      const failed = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) failed.push([response.url(), response.status()]); });
      page.on('requestfailed', request => failed.push([request.url(), request.failure().errorText]));
      await page.addInitScript(() => {
        if (Element.prototype.requestPointerLock) Element.prototype.requestPointerLock = () => Promise.reject(new Error('Native pointer lock disabled in automation'));
        const Native = window.AudioContext || window.webkitAudioContext;
        window.__audioContexts = [];
        window.__oscillatorsStarted = 0;
        if (Native) window.AudioContext = class extends Native {
          constructor(...args) {
            super(...args); window.__audioContexts.push(this);
            const create = this.createOscillator.bind(this);
            this.createOscillator = (...params) => {
              const oscillator = create(...params);
              const start = oscillator.start.bind(oscillator);
              oscillator.start = (...values) => { window.__oscillatorsStarted++; return start(...values); };
              return oscillator;
            };
          }
        };
      });
      await page.clock.install();
      await page.goto(urls[i]);
      await page.waitForFunction(() => window.afterlight && window.AfterlightEngine);
      await page.clock.runFor(200);
      assert.equal(await page.evaluate(() => afterlight.mode), 'title');
      await page.screenshot({ path: path.join(artifacts, `title-${i}.png`), fullPage: true });
      await page.locator('#start-button').click();
      await page.clock.runFor(800);
      assert.equal(await page.evaluate(() => afterlight.mode), 'playing');
      const start = await page.evaluate(() => ({ x: afterlight.state.player.x, y: afterlight.state.player.y }));
      await keyFor(page, 'ArrowRight', 250);
      assert.ok(await page.evaluate(x => afterlight.state.player.x > x + 20, start.x), 'Right arrow must move the player');
      await keyFor(page, 'Space', 350);
      await keyFor(page, 'e', 10);
      const echo = await page.evaluate(() => ({ length: afterlight.state.echo.length, rewinds: afterlight.state.rewinds }));
      assert.ok(echo.length > 3 && echo.rewinds > 0, 'Actual jump and E must create a physical memory path');
      await page.screenshot({ path: path.join(artifacts, `gameplay-${i}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await page.clock.runFor(50);
      assert.equal(await page.evaluate(() => afterlight.mode), 'paused');
      const pausedAt = await page.evaluate(() => afterlight.state.elapsed);
      await page.clock.runFor(1500);
      assert.equal(await page.evaluate(() => afterlight.state.elapsed), pausedAt, 'Pause freezes simulation');
      await page.locator('#resume-button').click();
      await page.clock.runFor(100);
      assert.equal(await page.evaluate(() => afterlight.mode), 'playing');
      await keyFor(page, 'r', 10);
      assert.equal(await page.evaluate(() => afterlight.state.echo.length), 0, 'R clears temporary room state');
      await page.keyboard.press('m');
      await page.clock.runFor(50);
      const muteText = await page.locator('#mute-button').textContent();
      await page.keyboard.press('m');
      await page.clock.runFor(50);
      assert.notEqual(await page.locator('#mute-button').textContent(), muteText, 'M toggles visible mute status');
      const audio = await page.evaluate(() => ({ states: __audioContexts.map(c => c.state), notes: __oscillatorsStarted }));
      assert.ok(audio.states.includes('running'), 'Audio context must unlock from the start gesture');
      assert.ok(audio.notes > 0, 'Procedural audio must actually start oscillators');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      assert.equal(overflow, false, 'Desktop must not overflow horizontally');
      assert.deepEqual(errors, []);
      assert.deepEqual(failed, []);
      reports.push({ url: urls[i], echo, audio, errors, failed });
      await context.close();
    }
    const mobile = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await mobile.newPage();
    await page.goto(external || urls[1]);
    await page.locator('#start-button').click();
    await page.screenshot({ path: path.join(artifacts, 'mobile-landscape.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Mobile must fit width');
    const bounds = await page.locator('#game').boundingBox();
    assert.ok(bounds.width > 350 && bounds.height > 180, 'Mobile world must remain usable');
    assert.ok(await page.locator('[data-control="rewind"]').isVisible(), 'Touch rewind must be available');
    await mobile.close();
    fs.writeFileSync(path.join(artifacts, external ? 'deployed-browser-report.json' : 'browser-report.json'), JSON.stringify(reports, null, 2));
    console.log(JSON.stringify({ ok: true, surfaces: reports, mobile: 'landscape checked' }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}
run().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
