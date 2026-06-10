import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Dice5 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { gameColor } from '@/shared/lib/gameColor';
import { type RecommendedGame } from '@/shared/api/client';
import { recommendationsQueryOptions } from './use-recommendations';

/**
 * Sección «Para ti» de la Home: recomendaciones content-based.  Es contenido
 * secundario de descubrimiento, así que si está cargando, falla o llega vacía
 * no se renderiza nada (no estorba ni mete ruido en la pantalla principal).
 */
export function RecommendedSection() {
  const { data, isPending, isError } = useQuery(recommendationsQueryOptions());
  if (isPending || isError || !data || data.length === 0) return null;

  return (
    <section aria-labelledby="home-foryou">
      <div className="mb-3">
        <h2 id="home-foryou" className="font-display text-base font-bold text-fg md:text-lg">
          Para ti
        </h2>
        <p className="text-sm text-fg-3">Juegos que quizá quieras aprender, según tu biblioteca.</p>
      </div>
      <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 lg:grid-cols-3">
        {data.map((game) => (
          <li key={game.id}>
            <RecommendationCard game={game} />
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[11.5px] font-medium text-fg-3">
        Powered by <strong className="font-semibold text-fg-2">BoardGameGeek</strong>
      </p>
    </section>
  );
}

function RecommendationCard({ game }: Readonly<{ game: RecommendedGame }>) {
  return (
    <Link to="/capture/source" aria-label={`Aprender ${game.name}`} className="block">
      <Card className="p-3 transition-shadow hover:shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
            style={{ background: gameColor(game.name), color: '#FFF8F0' }}
            aria-hidden="true"
          >
            <Dice5 size={22} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-fg">{game.name}</div>
            <div className="truncate text-xs text-fg-3">{game.reason}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
