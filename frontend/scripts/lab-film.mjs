// Evidencia dinámica del laboratorio: vídeo + filmstrip + layout shift por interacción.
// Uso: node scripts/lab-film.mjs <nombre> "<query de /lab>" "<selector o role:Nombre>" [frames] [hover]
//   node scripts/lab-film.mjs toggle-confianza "v=a&esc=base&th=light" "role:Colorear líneas según su confianza OCR"
// El 5º argumento "hover" hace hover en vez de click (para filmar estados de puntero).
// Salida: .lab-shots/film/<nombre>/ con frame-*.png, video.webm y cls.json (falla si CLS > 0).

import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.LAB_BASE ?? 'http://127.0.0.1:5174';
const FRAME_TIMES = [0, 60, 120, 180, 240, 320, 480];

const [name, query, target, framesArg, action] = process.argv.slice(2);
if (!name || !query || !target) {
  console.error('uso: node scripts/lab-film.mjs <nombre> "<query>" "<selector|role:Nombre>" [t1,t2,...]');
  process.exit(1);
}
const frameTimes = framesArg ? framesArg.split(',').map(Number) : FRAME_TIMES;
const OUT = fileURLToPath(new URL(`../.lab-shots/film/${name}/`, import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
await page.goto(`${BASE}/lab?${query}`, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

await page.evaluate(() => {
  window.__cls = 0;
  window.__clsEntries = [];
  // Ojo: NO se filtra hadRecentInput. El CLS clásico excluye los shifts que siguen a un
  // input, pero aquí medimos exactamente eso: que la interfaz no salte al interactuar.
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__cls += entry.value;
      window.__clsEntries.push({
        value: entry.value,
        recentInput: entry.hadRecentInput,
        sources: entry.sources?.map((s) => s.node?.nodeName ?? '?') ?? [],
      });
    }
  }).observe({ type: 'layout-shift', buffered: false });
});

const locator = target.startsWith('role:')
  ? page.getByRole('button', { name: target.slice(5) })
  : page.locator(target);

if (action === 'hover') await locator.first().hover();
else await locator.first().click();
const t0 = Date.now();
for (const t of frameTimes) {
  const wait = t - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: join(OUT, `frame-${String(t).padStart(3, '0')}ms.png`) });
}
await page.waitForTimeout(400);

const cls = await page.evaluate(() => ({ total: window.__cls, entries: window.__clsEntries }));
writeFileSync(join(OUT, 'cls.json'), JSON.stringify(cls, null, 2));

await context.close();
await browser.close();
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.webm')) renameSync(join(OUT, f), join(OUT, 'video.webm'));
}

console.log(`lab-film: ${name} → ${frameTimes.length} frames + video.webm | CLS=${cls.total.toFixed(4)}`);
if (cls.total > 0) {
  console.error(`lab-film: FALLO regla cero, layout shift ${cls.total.toFixed(4)}:`, JSON.stringify(cls.entries));
  process.exit(2);
}
