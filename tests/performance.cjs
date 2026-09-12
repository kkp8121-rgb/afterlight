const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function run() {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.locator('#start-button').click();
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1100);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('Space');
    await page.waitForTimeout(680);
    await page.keyboard.up('Space');
    await page.waitForTimeout(1500);
    await page.keyboard.press('e');
    const samples = [];
    const cdp = await page.context().newCDPSession(page);
    for (const rate of [1, 6]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      const metrics = await page.evaluate(() => new Promise(resolve => {
        const elapsed = [];
        let previous = performance.now();
        function frame(now) {
          elapsed.push(now - previous); previous = now;
          if (elapsed.length < 120) requestAnimationFrame(frame);
          else {
            const sorted = elapsed.slice(5).sort((a, b) => a - b);
            resolve({ frames: sorted.length, averageMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
              p95Ms: sorted[Math.floor(sorted.length * .95)], echoSamples: afterlight.state.echo.length,
              mode: afterlight.mode });
          }
        }
        requestAnimationFrame(frame);
      }));
      samples.push({ cpuThrottle: rate, ...metrics });
    }
    const report = { samples, errors: failures };
    fs.writeFileSync(path.join(root, 'artifacts', 'performance-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    if (failures.length || samples.some(s => s.mode !== 'playing' || s.p95Ms > 50 || !s.echoSamples)) throw new Error('Performance acceptance failed');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
