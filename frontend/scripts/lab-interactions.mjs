// Capturas de estados interactivos del laboratorio (edición, diálogos, zoom).
// Uso: node scripts/lab-interactions.mjs
// Requiere el dev server en http://127.0.0.1:5174 (launch "frontend").

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE = process.env.LAB_BASE ?? 'http://127.0.0.1:5174';
const OUT = fileURLToPath(new URL('../.lab-shots/', import.meta.url));

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ reducedMotion: 'reduce' });
const page = await context.newPage();
await page.setViewportSize({ width: 1920, height: 1080 });

async function open(query) {
  await page.goto(`${BASE}/lab?${query}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

async function shot(name) {
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  console.log(`lab-interactions: ${name}.png`);
}

// Edición: entrar, ensuciar el borrador y pedir cancelar.
await open('v=a&esc=base&th=light');
await page.getByTitle('Editar el texto de esta página').click();
await shot('va-edit-clean');
await page.getByRole('textbox', { name: /Editar el texto/ }).fill('CUMBRES\nTexto corregido a mano.');
await shot('va-edit-dirty');
await page.getByRole('button', { name: 'Cancelar' }).click();
await shot('va-edit-discard');

// Menú de acciones y diálogo de eliminar, en claro y en Brasa.
for (const th of ['light', 'dark']) {
  await open(`v=a&esc=base&th=${th}`);
  await page.getByTitle('Acciones del manual').click();
  await shot(`va-menu-${th}`);
  await page.getByRole('button', { name: 'Eliminar manual…' }).click();
  await shot(`va-delete-dialog-${th}`);
}

// Zoom del panel original.
await open('v=a&esc=base&th=light');
await page.getByTitle('Acercar la imagen').click();
await page.getByTitle('Acercar la imagen').click();
await shot('va-zoom-150');

// Banner de reprocesado sobre el híbrido.
await open('v=a&esc=busy&th=light');
await shot('va-busy-check');

await browser.close();
