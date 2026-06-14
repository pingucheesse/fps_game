import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 700, height: 500 } });
page.on('pageerror', e => console.log('  [pageerror]', e.message));
await page.goto(`${BASE}/wall-test.html?view=gun&ammo=1`, { waitUntil: 'load' });
await page.waitForTimeout(700);
for (const a of ['1', '0.4', '0.1']) {
  await page.goto(`${BASE}/wall-test.html?view=gun&ammo=${a}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `scripts/gun-${a}.png` });
  console.log('saved', `scripts/gun-${a}.png`);
}
await browser.close();
