import { useState } from 'react';
import { PageTextCard } from '@/features/manual/PageTextCard';
import { PageThumbRail } from '@/features/manual/PageThumbRail';
import { labManual, type LabEscenario } from '@/features/manual/lab/fixtures';
import { usePageSearch } from '@/features/manual/usePageSearch';

/** Línea base: los componentes actuales tal cual, alimentados por las fixtures. */
export function Variant0({
  escenario,
  initialPage,
  showConfidence,
  seededQuery,
}: Readonly<{
  escenario: LabEscenario;
  initialPage: number;
  showConfidence: boolean;
  seededQuery: string;
}>) {
  const manual = labManual(escenario);
  const pages = manual.pages;
  const [activePage, setActivePage] = useState(initialPage);
  const search = usePageSearch(pages);
  const [seeded, setSeeded] = useState(false);
  if (!seeded && seededQuery) {
    // Siembra única de la consulta del escenario search (estado derivado etiquetado).
    setSeeded(true);
    search.search(seededQuery);
  }
  const page = pages.find((item) => item.page_number === activePage) ?? pages[0]!;
  const activeMatch =
    search.active !== null && search.active.pageNumber === page.page_number
      ? search.active.indexInPage
      : null;

  return (
    <div className="mx-auto flex w-full flex-1 flex-col gap-4 px-4 py-4 md:grid md:max-w-none md:grid-cols-[300px_minmax(0,1fr)] md:gap-0 md:p-0">
      <aside className="min-w-0 md:flex md:min-h-0 md:flex-col md:overflow-hidden md:border-r md:border-border md:px-4 md:py-5">
        <PageThumbRail
          pages={pages}
          activePage={page.page_number}
          hitsByPage={search.hitsByPage}
          onSelect={setActivePage}
        />
      </aside>
      <div className="md:min-h-0 md:overflow-y-auto md:px-6 md:py-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <h1 className="truncate font-display text-xl font-extrabold tracking-tight text-fg">
            {manual.game_name}
          </h1>
          <PageTextCard
            page={page}
            pageCount={pages.length}
            needle={search.needle}
            activeMatch={activeMatch}
            editing={false}
            showConfidence={showConfidence}
            busy={manual.status === 'indexing'}
            saving={false}
            reprocessing={false}
            onCancelEdit={() => undefined}
            onSave={() => undefined}
            onReprocessPage={() => undefined}
          />
        </div>
      </div>
    </div>
  );
}
