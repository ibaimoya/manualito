import i18n, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { storage } from '@/shared/lib/storage';

/*
 * Singleton de i18next. Los JSON de ambos idiomas van empaquetados (glob
 * eager) y el init es síncrono, así el primer render ya sale traducido.
 * Sin detector de idioma, el LanguageProvider es quien manda aquí.
 */

const modules = import.meta.glob('../locales/*/*.json', { eager: true }) as Record<
  string,
  { default: Record<string, unknown> }
>;

const resources: Resource = {};
for (const [path, mod] of Object.entries(modules)) {
  const match = /locales\/([^/]+)\/([^/]+)\.json$/.exec(path);
  if (!match) continue;
  const [, lang, ns] = match;
  if (!lang || !ns) continue;
  resources[lang] = { ...resources[lang], [ns]: mod.default };
}

export const NAMESPACES = [
  'auth',
  'capture',
  'chat',
  'common',
  'conversations',
  'errors',
  'explore',
  'game',
  'help',
  'home',
  'legal',
  'library',
  'manual',
  'onboarding',
  'profile',
  'security',
  'settings',
  'shell',
] as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: storage.readLanguage(),
  fallbackLng: 'es',
  ns: NAMESPACES,
  defaultNS: 'common',
  initAsync: false,
  returnNull: false,
  interpolation: { escapeValue: false },
  // En dev una clave sin traducir se marca en pantalla y en consola
  parseMissingKeyHandler: import.meta.env.DEV ? (key) => `⟦${key}⟧` : undefined,
  missingKeyHandler: import.meta.env.DEV
    ? (lngs, ns, key) => console.error('[i18n-missing]', lngs.join(','), `${ns}:${key}`)
    : undefined,
  saveMissing: import.meta.env.DEV,
});

export default i18n;
