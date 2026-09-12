import type { ManualDetailPage, ManualDetailResponse, OcrLine } from '@/shared/api/client';

/** Escenarios deterministas del laboratorio de rediseño (solo dev). */
export type LabEscenario = 'base' | 'busy' | 'failed' | 'edited' | 'dup' | 'search';

export const LAB_ESCENARIOS: readonly LabEscenario[] = [
  'base',
  'busy',
  'failed',
  'edited',
  'dup',
  'search',
];

/** Página inicial natural de cada escenario (la que enseña su estado). */
export const LAB_ESCENARIO_PAGE: Record<LabEscenario, number> = {
  base: 1,
  busy: 1,
  failed: 6,
  edited: 3,
  dup: 4,
  search: 2,
};

/** Consulta sembrada por el escenario de búsqueda. */
export const LAB_SEARCH_QUERY = 'refugio';

function lines(entries: ReadonlyArray<readonly [string, number | null]>): OcrLine[] {
  return entries.map(([text, confidence]) => ({ text, confidence }));
}

const PAGE_OK: ManualDetailPage = {
  page_number: 1,
  ocr_status: 'completed',
  text_source: 'ocr',
  text_quality: 'ok',
  dedup_status: 'none',
  image_available: true,
  image_width: 1240,
  image_height: 1754,
  ocr_confidence_mean: 0.94,
  ocr_lines: lines([
    ['CUMBRES', 0.97],
    ['Un juego de Aitor Ibarrola para 2-4 personas, a partir de 10 años.', 0.95],
    ['CONTENIDO', 0.96],
    ['1 tablero de cordillera, 48 cartas de ruta, 24 fichas de refugio,', 0.93],
    ['4 alpinistas de madera y 1 dado de meteorología.', 0.94],
    ['OBJETIVO DEL JUEGO', 0.96],
    ['Ser la primera persona en encadenar tres cumbres y regresar al refugio', 0.95],
    ['base antes de que la tormenta cierre los pasos de montaña.', 0.92],
    ['PREPARACIÓN', 0.97],
    ['Coloca el tablero en el centro de la mesa. Cada jugador elige un', 0.95],
    ['alpinista y lo sitúa en el refugio base. Baraja las cartas de ruta y', 0.93],
    ['reparte cuatro a cada jugador. El resto forma el mazo de robo.', 0.94],
  ]),
};

const PAGE_LOW: ManualDetailPage = {
  page_number: 2,
  ocr_status: 'completed',
  text_source: 'ocr',
  text_quality: 'low_confidence',
  dedup_status: 'none',
  image_available: true,
  image_width: 1240,
  image_height: 1754,
  ocr_confidence_mean: 0.68,
  ocr_lines: lines([
    ['TU TURNO', 0.91],
    ['En tu turno juegas una carta de ruta y mueves tu alpinista tantos', 0.83],
    ['tramos como indique la carta. Si terminas en un refugio, recuperas', 0.79],
    ['una carta de tu descarte y robas otra del mazo.', 0.81],
    ['Si el dado muestra tormenta, nadie puede cruzar la arista norte', 0.66],
    ['hasta el siguiente amanecer. l.os refugios de gran altura cuestan', 0.58],
    ['dos fichas en vez de una y no adrniten mas de dos alpinistas.', 0.52],
    ['rn ,, |1l cornisa 3€', 0.51],
    ['El jugador con la bota mas gastada decide los empates.', 0.72],
  ]),
};

const PAGE_EDITED: ManualDetailPage = {
  page_number: 3,
  ocr_status: 'completed',
  text_source: 'user_edit',
  text_quality: 'ok',
  dedup_status: 'none',
  image_available: true,
  image_width: 1240,
  image_height: 1754,
  ocr_confidence_mean: null,
  ocr_lines: lines([
    [
      'PUNTUACIÓN\nCada cumbre encadenada vale 5 puntos. El primer regreso al refugio base otorga 3 puntos extra. Las fichas de refugio sin gastar valen 1 punto cada una.\nEn caso de empate gana quien haya cruzado más aristas durante la partida.',
      null,
    ],
  ]),
};

const PAGE_DUP: ManualDetailPage = {
  page_number: 4,
  ocr_status: 'completed',
  text_source: 'ocr',
  text_quality: 'ok',
  dedup_status: 'reused',
  image_available: true,
  image_width: 1240,
  image_height: 1754,
  ocr_confidence_mean: 0.9,
  ocr_lines: lines([
    ['VARIANTE EN SOLITARIO', 0.93],
    ['Prepara la partida para dos personas y controla al segundo alpinista', 0.9],
    ['con el mazo de tormenta boca arriba. Gana si encadenas tres cumbres', 0.88],
    ['antes de que el mazo se agote.', 0.91],
  ]),
};

const PAGE_PROCESSING: ManualDetailPage = {
  page_number: 5,
  ocr_status: 'processing',
  text_source: 'none',
  text_quality: null,
  dedup_status: 'none',
  image_available: true,
  image_width: 1240,
  image_height: 1754,
  ocr_confidence_mean: null,
  ocr_lines: [],
};

const PAGE_FAILED: ManualDetailPage = {
  page_number: 6,
  ocr_status: 'failed',
  text_source: 'none',
  text_quality: null,
  dedup_status: 'none',
  image_available: false,
  image_width: null,
  image_height: null,
  ocr_confidence_mean: null,
  ocr_lines: [],
};

const PAGES: ManualDetailPage[] = [
  PAGE_OK,
  PAGE_LOW,
  PAGE_EDITED,
  PAGE_DUP,
  PAGE_PROCESSING,
  PAGE_FAILED,
];

/** Manual fabricado que ejercita los 6 estados de página y las 3 bandas de confianza. */
export function labManual(escenario: LabEscenario): ManualDetailResponse {
  return {
    id: 'lab-manual-cumbres',
    game_id: 'lab-game-cumbres',
    game_name: 'Cumbres',
    title: null,
    status: escenario === 'busy' ? 'indexing' : 'active',
    visibility: 'private',
    anonymous: true,
    source_type: 'pdf',
    page_count: PAGES.length,
    duplicate_page_count: 1,
    language: 'es',
    chunks_indexed: escenario === 'busy' ? 9 : 41,
    created_at: '2026-08-19T18:24:00Z',
    indexed_at: escenario === 'busy' ? null : '2026-08-19T18:31:00Z',
    pages: PAGES,
  };
}

/** Progreso vivo del escenario busy (imita GET /processing). */
export const LAB_BUSY_PROGRESS = { completed_pages: 2, page_count: PAGES.length };
