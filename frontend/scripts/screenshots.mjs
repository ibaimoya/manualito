// Toma capturas de las pantallas principales para revisión visual.
// Uso: pnpm dlx playwright@latest test  (no, mejor: node scripts/screenshots.mjs)
// Requiere: 1) pnpm preview corriendo en :5173  2) playwright install chromium hecho
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'screenshots');
const BASE = process.env.URL ?? 'http://localhost:5173';

// Cada ruta + cómo dejar el state antes de capturar.
const TARGETS = [
  {
    name: '01-onboarding-hero',
    url: '/onboarding',
    init: 'localStorage.removeItem("manualito.onboarding.seen");',
    wait: 800, // dejar tiempo a mask-reveal
  },
  {
    name: '02-home-empty',
    url: '/home',
    init: 'localStorage.setItem("manualito.onboarding.seen","1"); localStorage.removeItem("manualito.manuals");',
  },
  {
    name: '03-home-with-manuals',
    url: '/home',
    init: `
      localStorage.setItem("manualito.onboarding.seen","1");
      localStorage.setItem("manualito.manuals", JSON.stringify([
        { manual_id: "catan-a1b2", name: "Catan", created_at: "2026-05-26T08:00:00.000Z", last_opened_at: "2026-05-26T09:30:00.000Z", chunks_indexed: 24 },
        { manual_id: "virus-c3d4", name: "Virus!", created_at: "2026-05-25T20:00:00.000Z", last_opened_at: "2026-05-26T07:15:00.000Z", chunks_indexed: 12 },
        { manual_id: "parchis-e5f6", name: "Parchís", created_at: "2026-05-20T10:00:00.000Z", last_opened_at: "2026-05-24T18:00:00.000Z", chunks_indexed: 8 }
      ]));
    `,
  },
  {
    name: '04a-capture-source',
    url: '/capture/source',
    init: 'localStorage.setItem("manualito.onboarding.seen","1");',
  },
  {
    name: '04b-capture-camera',
    url: '/capture',
    init: 'localStorage.setItem("manualito.onboarding.seen","1");',
  },
  {
    name: '05-history',
    url: '/history',
    init: `
      localStorage.setItem("manualito.onboarding.seen","1");
      localStorage.setItem("manualito.manuals", JSON.stringify([
        { manual_id: "catan-a1b2", name: "Catan", created_at: "2026-05-26T08:00:00.000Z", last_opened_at: "2026-05-26T09:30:00.000Z", chunks_indexed: 24 },
        { manual_id: "virus-c3d4", name: "Virus!", created_at: "2026-05-25T20:00:00.000Z", last_opened_at: "2026-05-26T07:15:00.000Z", chunks_indexed: 12 },
        { manual_id: "monopoly-x", name: "Monopoly", created_at: "2026-03-12T20:00:00.000Z", last_opened_at: "2026-05-22T07:15:00.000Z", chunks_indexed: 18 },
        { manual_id: "parchis-e5f6", name: "Parchís", created_at: "2026-05-20T10:00:00.000Z", last_opened_at: "2026-05-24T18:00:00.000Z", chunks_indexed: 8 },
        { manual_id: "uno-x", name: "UNO", created_at: "2026-03-01T10:00:00.000Z", last_opened_at: "2026-03-01T10:00:00.000Z", chunks_indexed: 6 }
      ]));
    `,
  },
  {
    name: '06-result-with-content',
    url: '/result/catan-a1b2',
    init: `
      localStorage.setItem("manualito.onboarding.seen","1");
      localStorage.setItem("manualito.manuals", JSON.stringify([
        { manual_id: "catan-a1b2", name: "Catan", created_at: "2026-05-26T08:00:00.000Z", last_opened_at: "2026-05-26T09:30:00.000Z", chunks_indexed: 24 }
      ]));
      localStorage.setItem("manualito.result.catan-a1b2", JSON.stringify({
        manual_id: "catan-a1b2",
        name: "Catan",
        summary: "Construyes una isla con poblados y ciudades para sumar 10 puntos. En tu turno tiras dados, recibes recursos y comercias antes de construir.",
        setup: "1. Coloca los 19 hexágonos de terreno boca arriba en el marco.\\n2. Reparte los tokens de número en orden alfabético desde una esquina.\\n3. Cada jugador toma 2 poblados, 2 carreteras y 4 ciudades en su color.\\n4. Sortead el orden de turno con un dado.",
        turn: "Cada turno tiene tres fases: producción (tirar dados y recibir recursos), comercio (con el banco o jugadores) y construcción (carreteras, poblados, ciudades, cartas).",
        win: "Gana el primero que llega a 10 puntos de victoria sumando poblados (1), ciudades (2), la ruta más larga (2), el mayor ejército (2) y cartas de progreso.",
        created_at: "2026-05-26T09:30:00.000Z"
      }));
    `,
  },
  {
    name: '07-settings',
    url: '/settings',
    init: 'localStorage.setItem("manualito.onboarding.seen","1");',
  },
  {
    name: '08-settings-dark',
    url: '/settings',
    init: `
      localStorage.setItem("manualito.onboarding.seen","1");
      localStorage.setItem("manualito.settings", JSON.stringify({ mode: "dark", density: "comfy", accent: "amber", responseDetail: "medium" }));
    `,
  },
  {
    name: '09-home-dark',
    url: '/home',
    init: `
      localStorage.setItem("manualito.onboarding.seen","1");
      localStorage.setItem("manualito.settings", JSON.stringify({ mode: "dark", density: "comfy", accent: "amber", responseDetail: "medium" }));
      localStorage.setItem("manualito.manuals", JSON.stringify([
        { manual_id: "catan-a1b2", name: "Catan", created_at: "2026-05-26T08:00:00.000Z", last_opened_at: "2026-05-26T09:30:00.000Z", chunks_indexed: 24 },
        { manual_id: "virus-c3d4", name: "Virus!", created_at: "2026-05-25T20:00:00.000Z", last_opened_at: "2026-05-26T07:15:00.000Z", chunks_indexed: 12 }
      ]));
    `,
  },
  {
    name: '10-home-accent-blue',
    url: '/home',
    init: `
      localStorage.setItem("manualito.onboarding.seen","1");
      localStorage.setItem("manualito.settings", JSON.stringify({ mode: "light", density: "comfy", accent: "blue", responseDetail: "medium" }));
      localStorage.setItem("manualito.manuals", JSON.stringify([
        { manual_id: "catan-a1b2", name: "Catan", created_at: "2026-05-26T08:00:00.000Z", last_opened_at: "2026-05-26T09:30:00.000Z", chunks_indexed: 24 }
      ]));
    `,
  },
];

await mkdir(OUT_DIR, { recursive: true });

/**
 * Genera capturas en 3 viewports: móvil 390, tablet 768, desktop 1440.
 * Cada target se captura en cada viewport (excepto los marcados como
 * `mobileOnly` que solo tienen sentido en móvil — ej. onboarding hero).
 */
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, scale: 2 },
  { name: 'tablet', width: 768, height: 1024, scale: 2 },
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
];

const browser = await chromium.launch();

const total = TARGETS.length * VIEWPORTS.length;
console.log(`📸 Generando ${total} capturas (${TARGETS.length} × ${VIEWPORTS.length}) en ${OUT_DIR}`);

for (const vp of VIEWPORTS) {
  console.log(`\n--- viewport ${vp.name} (${vp.width}×${vp.height}) ---`);
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();

  // Limpia SW + caches del PWA antes de empezar cada viewport.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
    if (window.caches) {
      const keys = await caches.keys();
      for (const k of keys) await caches.delete(k);
    }
    localStorage.clear();
  });

  for (const t of TARGETS) {
    console.log(`  → ${t.name}  (${t.url})`);
    await page.evaluate(t.init);
    await page.goto(`${BASE}${t.url}`, { waitUntil: 'networkidle' });
    if (t.wait) await page.waitForTimeout(t.wait);
    await page.screenshot({
      path: join(OUT_DIR, `${t.name}--${vp.name}.png`),
      fullPage: false,
    });
  }

  await ctx.close();
}

await browser.close();
console.log('\n✅ Listo.');
