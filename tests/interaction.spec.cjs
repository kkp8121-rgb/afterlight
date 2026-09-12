const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const port = 47000 + Math.floor(Math.random() * 700);
const baseUrl = `http://127.0.0.1:${port}/afterlight/`;

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = () => {
      if (Date.now() - started > 5000) return reject(new Error('Timed out waiting for local server'));
      const request = http.get(`http://127.0.0.1:${port}/afterlight/`, (response) => {
        response.resume();
        if (response.statusCode === 200) resolve();
        else setTimeout(poll, 30);
      });
      request.on('error', () => setTimeout(poll, 30));
    };
    child.once('error', reject);
    poll();
  });
}

async function openPage(browser, options, initScript) {
  const context = await browser.newContext(options || {});
  if (initScript) await context.addInitScript(initScript);
  const page = await context.newPage();
  await page.clock.install();
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.afterlight && window.AfterlightEngine);
  await page.clock.runFor(100);
  return { context, page };
}

async function start(page) {
  await page.locator('#start-button').click();
  await page.clock.runFor(100);
  assert.equal(await page.evaluate(() => window.afterlight.mode), 'playing');
}

async function state(page) {
  return page.evaluate(() => ({ mode: afterlight.mode, state: afterlight.state, stats: afterlight.stats }));
}

async function run() {
  const server = spawn(process.execPath, ['tools/server.cjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const browser = await chromium.launch({ headless: true });
  const openContexts = [];
  const report = {};
  try {
    await waitForServer(server);

    {
      const opened = await openPage(browser);
      openContexts.push(opened.context);
      const page = opened.page;
      await start(page);
      await page.keyboard.down('ArrowRight');
      await page.clock.runFor(250);
      await page.keyboard.up('ArrowRight');
      await page.keyboard.press('e');
      await page.clock.runFor(50);
      const beforeRestart = await state(page);
      assert.ok(beforeRestart.state.player.x > 72, 'movement should change the player position');
      await page.keyboard.press('Escape');
      await page.clock.runFor(30);
      assert.equal(await page.evaluate(() => afterlight.mode), 'paused');
      await page.locator('#restart-button').click();
      await page.clock.runFor(30);
      const afterRestart = await state(page);
      assert.equal(afterRestart.mode, 'playing');
      assert.equal(afterRestart.state.levelIndex, 0);
      assert.equal(afterRestart.state.echo.length, 0, 'restart clears the room echo');
      assert.ok(afterRestart.state.elapsed < 0.1, 'restart creates a fresh room state');
      report.pauseRestart = 'passed';
      await opened.context.close();
      openContexts.pop();
    }

    {
      const opened = await openPage(browser);
      openContexts.push(opened.context);
      const page = opened.page;
      await start(page);
      await page.locator('#mute-button').click();
      await page.locator('#pause-button').click();
      assert.equal(await page.evaluate(() => afterlight.mode), 'paused');
      await page.locator('#resume-button').click();
      await page.clock.runFor(40);
      const startX = (await state(page)).state.player.x;
      await page.keyboard.down('ArrowRight');
      await page.clock.runFor(250);
      await page.keyboard.up('ArrowRight');
      const endX = (await state(page)).state.player.x;
      assert.ok(endX > startX + 15, 'keyboard remains usable after HUD and resume clicks');
      report.keyboardAfterButtons = 'passed';
      await opened.context.close();
      openContexts.pop();
    }

    {
      const opened = await openPage(browser);
      openContexts.push(opened.context);
      const page = opened.page;
      await start(page);
      await page.keyboard.down('ArrowRight');
      await page.clock.runFor(300);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.clock.runFor(150);
      assert.equal(await page.evaluate(() => afterlight.mode), 'paused');
      const pausedX = (await state(page)).state.player.x;
      await page.locator('#resume-button').click();
      await page.clock.runFor(300);
      const resumedX = (await state(page)).state.player.x;
      assert.ok(resumedX - pausedX < 25, 'blur clears held keyboard input before resume');
      await page.keyboard.up('ArrowRight');
      report.blurClearsInput = 'passed';
      await opened.context.close();
      openContexts.pop();
    }

    {
      const opened = await openPage(browser, { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
      openContexts.push(opened.context);
      const page = opened.page;
      await start(page);
      const right = page.locator('[data-control="right"]');
      assert.ok(await right.isVisible(), 'right touch control is visible on landscape phone');
      await right.dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'touch', bubbles: true });
      await page.clock.runFor(300);
      const heldX = (await state(page)).state.player.x;
      await right.dispatchEvent('pointercancel', { pointerId: 41, pointerType: 'touch', bubbles: true });
      await page.clock.runFor(300);
      const releasedX = (await state(page)).state.player.x;
      assert.ok(heldX > 72 + 15, 'held touch movement changes player position');
      assert.ok(releasedX - heldX < 25, 'pointercancel releases held touch input');
      report.touchCancel = 'passed';
      await opened.context.close();
      openContexts.pop();
    }

    {
      const opened = await openPage(browser);
      openContexts.push(opened.context);
      const page = opened.page;
      assert.equal(await page.locator('#continue-button').isVisible(), false, 'continue is hidden without progress');
      await page.locator('#mute-button').click();
      await page.locator('#motion-button').click();
      const settingsBefore = await page.evaluate(() => ({
        mute: document.getElementById('mute-button').textContent,
        motion: document.getElementById('motion-button').textContent
      }));
      await page.reload();
      await page.clock.runFor(100);
      const settingsAfter = await page.evaluate(() => ({
        mute: document.getElementById('mute-button').textContent,
        motion: document.getElementById('motion-button').textContent,
        mutePressed: document.getElementById('mute-button').getAttribute('aria-pressed'),
        motionPressed: document.getElementById('motion-button').getAttribute('aria-pressed')
      }));
      assert.equal(settingsAfter.mute, settingsBefore.mute);
      assert.equal(settingsAfter.motion, settingsBefore.motion);
      assert.equal(settingsAfter.mutePressed, 'true');
      assert.equal(settingsAfter.motionPressed, 'true');
      report.persistence = 'passed';
      await opened.context.close();
      openContexts.pop();
    }

    for (const initScript of [
      () => {
        localStorage.setItem('afterlight.progress.v1', '{malformed');
        localStorage.setItem('afterlight.settings.v1', 'not-json');
      },
      () => {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() { throw new Error('storage unavailable'); }
        });
      }
    ]) {
      const opened = await openPage(browser, {}, initScript);
      openContexts.push(opened.context);
      await start(opened.page);
      assert.equal(await opened.page.evaluate(() => afterlight.mode), 'playing');
      await opened.context.close();
      openContexts.pop();
    }
    report.storageFallbacks = 'passed';

    for (const [name, options] of [
      ['portrait', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
      ['smallLandscape', { viewport: { width: 640, height: 360 }, isMobile: true, hasTouch: true }]
    ]) {
      const opened = await openPage(browser, options);
      openContexts.push(opened.context);
      const page = opened.page;
      const geometry = await page.evaluate(() => {
        const button = document.getElementById('start-button').getBoundingClientRect();
        const heading = document.querySelector('#title-screen h1').getBoundingClientRect();
        const stage = document.querySelector('.stage').getBoundingClientRect();
        const canvas = document.getElementById('game').getBoundingClientRect();
        return {
          button: { left: button.left, right: button.right, top: button.top, bottom: button.bottom },
          heading: { left: heading.left, right: heading.right, top: heading.top, bottom: heading.bottom },
          stage: { left: stage.left, right: stage.right, top: stage.top, bottom: stage.bottom },
          canvas: { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom },
          width: innerWidth,
          height: innerHeight,
          scrollWidth: document.documentElement.scrollWidth
        };
      });
      assert.ok(geometry.button.left >= 0 && geometry.button.right <= geometry.width, `${name} start button fits viewport`);
      assert.ok(geometry.button.top >= 0 && geometry.button.bottom <= geometry.height, `${name} start button is accessible`);
      if (name === 'portrait') {
        assert.ok(geometry.heading.top >= geometry.stage.top && geometry.heading.bottom <= geometry.stage.bottom,
          'portrait title heading fits inside the taller title stage');
      }
      assert.ok(geometry.canvas.left >= 0 && geometry.canvas.right <= geometry.width, `${name} canvas fits viewport`);
      assert.ok(geometry.scrollWidth <= geometry.width + 1, `${name} has no horizontal clipping`);
      await page.screenshot({ path: path.join(artifacts, `interaction-${name}.png`), fullPage: true });
      report[name] = 'passed';
      await opened.context.close();
      openContexts.pop();
    }

    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } finally {
    for (const context of openContexts) await context.close().catch(() => {});
    await browser.close();
    server.kill();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
