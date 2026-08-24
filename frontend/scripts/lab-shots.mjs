// Capturas deterministas del laboratorio de rediseño.
// Uso: node scripts/lab-shots.mjs [variantes] [escenarios]
//   node scripts/lab-shots.mjs 0 base,busy
// Requiere el dev server en http://localhost:5174 (launch "frontend").

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.LAB_BASE ?? 'http://127.0.0.1:5174';
const OUT = fileURLToPath(new URL('../.lab-shots/', import.meta.url));

const variants = (process.argv[2] ?? '0').split(',');
const escenarios = (process.argv[3] ?? 'base,busy,search').split(',');
const themes = ['light', 'dark'];
const viewports = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'mobile', width: 375, height: 812 },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ reducedMotion: 'reduce' });
const page = await context.newPage();

let count = 0;
for (const v of variants) {
  for (const esc of escenarios) {
    for (const th of themes) {
      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const conf = esc === 'base' ? '&conf=true' : '';
        await page.goto(`${BASE}/lab?v=${v}&esc=${esc}&th=${th}${conf}`, {
          waitUntil: 'networkidle',
        });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        await page.screenshot({ path: join(OUT, `v${v}-${esc}-${vp.name}-${th}.png`) });
        count += 1;
      }
    }
  }
}

await browser.close();
console.log(`lab-shots: ${count} capturas en .lab-shots/`);
