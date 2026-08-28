import { createFileRoute, redirect } from '@tanstack/react-router';
import { useEffect } from 'react';
import {
  LAB_ESCENARIO_PAGE,
  LAB_ESCENARIOS,
  LAB_SEARCH_QUERY,
  type LabEscenario,
} from '@/features/manual/lab/fixtures';
import { LabSwitcher, type LabSearch, type LabVariant } from '@/features/manual/lab/LabSwitcher';
import { LangSheet } from '@/features/manual/lab/LangSheet';
import { Variant0 } from '@/features/manual/lab/Variant0';
import { VariantD } from '@/features/manual/lab/VariantD';
import { VariantA } from '@/features/manual/lab/VariantA';
import { VariantB } from '@/features/manual/lab/VariantB';
import { VariantC } from '@/features/manual/lab/VariantC';
import { useTheme } from '@/app/theme';

function parseSearch(search: Record<string, unknown>): LabSearch {
  const esc = LAB_ESCENARIOS.includes(search.esc as LabEscenario)
    ? (search.esc as LabEscenario)
    : 'base';
  const pg = Number(search.pg);
  return {
    v: ['0', 'a', 'b', 'c', 'lang', 'd'].includes(search.v as string)
      ? (search.v as LabVariant)
      : '0',
    esc,
    th: search.th === 'dark' ? 'dark' : 'light',
    acc: search.acc === 'blue' ? 'blue' : 'warm',
    conf: search.conf === true || search.conf === 'true' || search.conf === 1,
    pg: Number.isInteger(pg) && pg >= 1 && pg <= 6 ? pg : LAB_ESCENARIO_PAGE[esc],
  };
}

export const Route = createFileRoute('/lab')({
  beforeLoad: () => {
    // Laboratorio de rediseño: inexistente fuera de desarrollo.
    if (!import.meta.env.DEV) throw redirect({ to: '/' });
  },
  validateSearch: parseSearch,
  component: LabScreen,
});

/** Fuerza el tema por URL pisando las clases del ThemeProvider (hack solo-lab). */
function useForcedTheme(th: 'light' | 'dark', acc: 'warm' | 'blue'): void {
  const theme = useTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', th === 'dark');
    root.classList.toggle('accent-blue', acc === 'blue');
    return () => {
      const providerDark =
        theme.mode === 'dark' ||
        (theme.mode === 'auto' && globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('theme-dark', providerDark);
      root.classList.toggle('accent-blue', theme.accent === 'blue');
    };
  }, [th, acc, theme.mode, theme.accent]);
}

function LabScreen() {
  const search = Route.useSearch();
  useForcedTheme(search.th, search.acc);
  const seededQuery = search.esc === 'search' ? LAB_SEARCH_QUERY : '';

  return (
    <div className="flex min-h-dvh flex-col bg-bg" data-lab-variant={search.v}>
      {search.v === '0' ? (
        <Variant0
          key={`${search.esc}-${search.pg}-${seededQuery}`}
          escenario={search.esc}
          initialPage={search.pg}
          showConfidence={search.conf}
          seededQuery={seededQuery}
        />
      ) : null}
      {search.v === 'a' ? (
        <VariantA
          key={`${search.esc}-${search.pg}-${seededQuery}`}
          escenario={search.esc}
          initialPage={search.pg}
          showConfidence={search.conf}
          seededQuery={seededQuery}
        />
      ) : null}
      {search.v === 'b' ? (
        <VariantB
          key={`${search.esc}-${search.pg}-${seededQuery}`}
          escenario={search.esc}
          initialPage={search.pg}
          showConfidence={search.conf}
          seededQuery={seededQuery}
        />
      ) : null}
      {search.v === 'lang' ? <LangSheet /> : null}
      {search.v === 'd' ? (
        <VariantD
          key={`${search.esc}-${search.pg}-${seededQuery}`}
          escenario={search.esc}
          initialPage={search.pg}
          showConfidence={search.conf}
          seededQuery={seededQuery}
        />
      ) : null}
      {search.v === 'c' ? (
        <VariantC
          key={`${search.esc}-${search.pg}-${seededQuery}`}
          escenario={search.esc}
          initialPage={search.pg}
          showConfidence={search.conf}
          seededQuery={seededQuery}
        />
      ) : null}
      <LabSwitcher search={search} />
    </div>
  );
}
