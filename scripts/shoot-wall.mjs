// Drives the real game (Singleplayer) and screenshots the HUD + map, plus a
// top-down render of the generated layout for overlap/room-size inspection.
//   node scripts/shoot-wall.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
page.on('pageerror', e => console.log('  [pageerror]', e.message));

// Warm up GPU (first context often gets lost on cold start)
await page.goto(`${BASE}/wall-test.html?seed=ABC123&view=top`, { waitUntil: 'load' });
await page.waitForTimeout(800);

// Top-down layout previews (inspect room size + overlaps)
for (const [seed, view] of [['ABC123', 'top'], ['ABC123', 'center'], ['ROOM99', 'top']]) {
  await page.goto(`${BASE}/wall-test.html?seed=${seed}&view=${view}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `scripts/map-${seed}-${view}.png` });
  console.log('saved', `scripts/map-${seed}-${view}.png`);
}

// Real game → click Singleplayer → screenshot HUD with minimap
await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForTimeout(300);
await page.click('#btn-singleplayer');
await page.waitForTimeout(1200);
await page.screenshot({ path: 'scripts/game-hud.png' });
console.log('saved scripts/game-hud.png');

await browser.close();
