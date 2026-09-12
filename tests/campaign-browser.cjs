const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function run() {
  const root = path.resolve(__dirname, '..');
  const artifactDir = path.join(root, 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  const roomLimit = Number(process.env.AFTERLIGHT_TEST_ROOMS) || 8;
  const replays = Array.from({ length: roomLimit }, (_, i) => JSON.parse(fs.readFileSync(path.join(__dirname, 'replays', `${String(i + 1).padStart(2, '0')}.json`), 'utf8')));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
    await page.goto(process.env.AFTERLIGHT_URL || pathToFileURL(path.join(root, 'index.html')).href);
    await page.locator('#start-button').click();
    const reports = [];
    for (const replay of replays) {
      let held = [];
      for (let index = 0; index < replay.actions.length; index++) {
        const action = replay.actions[index];
        const keys = action.keys || [];
        for (const key of held) if (!keys.includes(key)) await page.keyboard.up(key);
        for (const key of keys) if (!held.includes(key)) await page.keyboard.down(key);
        held = keys;
        await page.clock.runFor(Math.round(action.frames * 1000 / 120));
        const snapshot = await page.evaluate(() => ({ mode: afterlight.mode, state: afterlight.state, stats: afterlight.stats }));
        if (snapshot.stats.deaths) throw new Error(`Room ${replay.level + 1} died during action ${index}: ${JSON.stringify({ action, player: snapshot.state.player, stats: snapshot.stats })}`);
        if (snapshot.mode === 'room-complete' || snapshot.mode === 'ending') break;
      }
      for (const key of held) await page.keyboard.up(key);
      await page.clock.runFor(34);
      const snapshot = await page.evaluate(() => ({ mode: afterlight.mode, state: afterlight.state, stats: afterlight.stats }));
      assert.equal(snapshot.state.levelIndex, replay.level);
      assert.ok(snapshot.state.collected.every(Boolean), `Room ${replay.level + 1}: every seed must be physically collected`);
      assert.ok(['room-complete', 'ending'].includes(snapshot.mode), `Room ${replay.level + 1} did not finish: ${JSON.stringify(snapshot.state.player)}`);
      reports.push({ room: replay.level + 1, name: snapshot.state.level.name, elapsed: snapshot.state.elapsed,
        seeds: snapshot.state.collected.length, rewinds: snapshot.state.rewinds, mode: snapshot.mode });
      await page.screenshot({ path: path.join(artifactDir, `room-${replay.level + 1}-complete.png`), fullPage: true });
      if (replay.level < roomLimit - 1) {
        if (replay.level === 0) {
          const savedStats = snapshot.stats;
          await page.reload();
          assert.ok(await page.locator('#continue-button').isVisible(), 'Reload must offer Continue');
          await page.locator('#continue-button').click();
          const resumed = await page.evaluate(() => afterlight.stats);
          assert.equal(resumed.levelIndex, 1, 'Continue loads the next unfinished room');
          assert.ok(Math.abs(resumed.runTime - savedStats.runTime) < 0.05, 'Continue preserves campaign time');
          assert.equal(resumed.rewinds, savedStats.rewinds, 'Continue preserves rewind count');
        } else {
          await page.keyboard.press('Enter');
          assert.equal(await page.evaluate(() => afterlight.mode), 'playing', 'Enter advances completed room');
        }
      }
    }
    const stats = await page.evaluate(() => afterlight.stats);
    if (roomLimit === 8) {
      assert.equal(await page.evaluate(() => afterlight.mode), 'ending');
      assert.ok(stats.completed && stats.bestTime > 0);
    }
    assert.deepEqual(errors, []);
    if (roomLimit === 8) {
      await page.locator('#replay-button').click();
      assert.equal(await page.evaluate(() => afterlight.mode), 'playing');
      assert.equal(await page.evaluate(() => afterlight.state.levelIndex), 0);
    }
    const report = { ok: true, url: page.url(), method: 'Keyboard events only; no state edits or level skips', rooms: reports, stats, errors };
    fs.writeFileSync(path.join(artifactDir, process.env.AFTERLIGHT_URL ? 'deployed-campaign-report.json' : 'campaign-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
