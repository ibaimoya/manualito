import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("sirve la portada desde la raíz", async ({ request }) => {
  const response = await request.get("/");
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/html");
  expect(await response.text()).toBe(html);
});

test("sirve estilos, imágenes y fuentes con su tipo de contenido", async ({ request }) => {
  const assets = [
    ["/styles.css", "text/css"],
    ["/assets/universidad-burgos.png", "image/png"],
    ["/assets/observatorio-hp.svg", "image/svg+xml"],
    ["/assets/inter-latin.woff2", "font/woff2"],
  ];

  for (const [path, contentType] of assets) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain(contentType);
    expect((await response.body()).length, path).toBeGreaterThan(0);
  }
});

test("devuelve 404 para rutas inexistentes y archivos de desarrollo", async ({ request }) => {
  const paths = [
    "/pagina-inexistente",
    "/assets/no-existe.png",
    "/package.json",
    "/pnpm-lock.yaml",
    "/wrangler.jsonc",
    "/README.md",
    "/tests/hosting.spec.js",
  ];

  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(404);
  }
});
