import { describe, expect, it } from 'vitest';

/*
 * Candado de los locales. Falla con la clave concreta si el inglés y el
 * español divergen o si algún JSON pierde el orden alfabético.
 */

type Tree = Record<string, unknown>;

const files = import.meta.glob('../../src/locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Tree }
>;

const locales = new Map<string, Map<string, Tree>>();
for (const [path, mod] of Object.entries(files)) {
  const match = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const [, lang, ns] = match;
  if (!lang || !ns) continue;
  if (!locales.has(lang)) locales.set(lang, new Map());
  locales.get(lang)?.set(ns, mod.default);
}

function flattenKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      return flattenKeys(value as Tree, path);
    }
    return [path];
  });
}

function unsortedPaths(tree: Tree, prefix = ''): string[] {
  const keys = Object.keys(tree);
  const sorted = [...keys].sort((a, b) => a.localeCompare(b, 'en'));
  const bad: string[] = [];
  keys.forEach((key, i) => {
    if (key !== sorted[i]) bad.push(prefix ? `${prefix}.${key}` : key);
  });
  for (const [key, value] of Object.entries(tree)) {
    if (value !== null && typeof value === 'object') {
      bad.push(...unsortedPaths(value as Tree, prefix ? `${prefix}.${key}` : key));
    }
  }
  return bad;
}

const es = locales.get('es');
const en = locales.get('en');

describe('locales', () => {
  it('existen los dos idiomas con los mismos namespaces', () => {
    expect(es).toBeDefined();
    expect(en).toBeDefined();
    expect([...(en?.keys() ?? [])].sort()).toEqual([...(es?.keys() ?? [])].sort());
  });

  it('cada namespace tiene las mismas claves en ambos idiomas', () => {
    for (const [ns, esTree] of es ?? []) {
      const enTree = en?.get(ns) ?? {};
      const esKeys = flattenKeys(esTree).sort();
      const enKeys = flattenKeys(enTree).sort();
      const missing = esKeys.filter((k) => !enKeys.includes(k));
      const extra = enKeys.filter((k) => !esKeys.includes(k));
      expect(missing, `en/${ns}.json sin: ${missing.join(', ')}`).toEqual([]);
      expect(extra, `en/${ns}.json sobra: ${extra.join(', ')}`).toEqual([]);
    }
  });

  it('todas las claves van en orden alfabético', () => {
    for (const [lang, tree] of locales) {
      for (const [ns, nsTree] of tree) {
        const bad = unsortedPaths(nsTree);
        expect(bad, `${lang}/${ns}.json desordenado en: ${bad.join(', ')}`).toEqual([]);
      }
    }
  });

  it('ninguna traducción está vacía', () => {
    for (const [lang, tree] of locales) {
      for (const [ns, nsTree] of tree) {
        const empty = flattenKeys(nsTree).filter((path) => {
          const value = path
            .split('.')
            .reduce<unknown>((acc, k) => (acc as Tree | undefined)?.[k], nsTree);
          return value === '';
        });
        expect(empty, `${lang}/${ns}.json vacías: ${empty.join(', ')}`).toEqual([]);
      }
    }
  });
});
