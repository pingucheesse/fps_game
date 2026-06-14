// Verifies the generated map + concrete chunking + loads the real game (checks
// for console errors when firing-related code initialises).
//   node scripts/shoot-wall.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
const errors = [];
page.on('pageerror', e => { errors.push(e.message); console.log('  [pageerror]', e.message); });

// Warm up GPU
await page.goto(`${BASE}/wall-test.html?view=top`, { waitUntil: 'load' });
await page.waitForTimeout(800);

for (const view of ['top', 'center', 'concrete']) {
  await page.goto(`${BASE}/wall-test.html?seed=ABC123&view=${view}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `scripts/map-${view}.png` });
  console.log('saved', `scripts/map-${view}.png`);
}

// Real game smoke test
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForTimeout(300);
await page.click('#btn-singleplayer');
await page.waitForTimeout(1000);
await page.screenshot({ path: 'scripts/game-hud.png' });
console.log('saved scripts/game-hud.png');
console.log(errors.length ? `PAGE ERRORS: ${errors.length}` : 'no page errors');

await browser.close();
