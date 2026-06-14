import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eraser } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { Tooltip } from '@/components/ui/tooltip';
import { GameCover } from '@/features/games/GameCover';
import { RATE_LABELS, RatingStars } from '@/features/games/RatingStars';
import { gameDetailKey, myGamesKey } from '@/features/games/use-games';
import { gamesApi, type GameDetail, type GameRating } from '@/shared/api/games';
import { cn } from '@/shared/lib/cn';

const NOTE_MAX = 120;

/**
 * Modal/sheet de valoración: pregunta cálida, 5 estrellas grandes con
 * etiqueta dinámica, nota opcional corta y «Quitar valoración» al editar.
 */
export function RateGameDialog({
  open,
  onOpenChange,
  gameId,
  gameName,
  current,
  initialScore = null,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId: string;
  gameName: string;
  current: GameRating | null;
  /** Estrella pulsada fuera del diálogo: se precarga sin tocar el servidor. */
  initialScore?: number | null;
}>) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`¿Qué te ha parecido ${gameName}?`}
      description={
        current
          ? 'Puedes cambiar tu valoración cuando quieras.'
          : 'Tu valoración nos ayuda a conocerte un poco más.'
      }
      contentClassName="max-w-lg"
    >
      <RateGameForm
        gameId={gameId}
        gameName={gameName}
        current={current}
        initialScore={initialScore}
        onClose={() => onOpenChange(false)}
      />
    </ResponsiveModal>
  );
}

function RateGameForm({
  gameId,
  gameName,
  current,
  initialScore,
  onClose,
}: Readonly<{
  gameId: string;
  gameName: string;
  current: GameRating | null;
  initialScore: number | null;
  onClose: () => void;
}>) {
  const qc = useQueryClient();
  const noteId = useId();
  const [score, setScore] = useState(initialScore ?? current?.score ?? 0);
  const [note, setNote] = useState(current?.note ?? '');

  // Cache con la respuesta del servidor: la cabecera no depende del refetch.
  function applyRating(next: GameRating | null): void {
    qc.setQueryData<GameDetail>(gameDetailKey(gameId), (old) =>
      old ? { ...old, my_rating: next } : old,
    );
    qc.invalidateQueries({ queryKey: gameDetailKey(gameId) }).catch(() => undefined);
  }

  const save = useMutation({
    mutationFn: () => {
      const trimmed = note.trim();
      return gamesApi.rate(gameId, trimmed ? { score, note: trimmed } : { score });
    },
    onSuccess: (data) => {
      applyRating(data);
      // Valorar sigue el juego en el backend: refresca la biblioteca.
      qc.invalidateQueries({ queryKey: myGamesKey }).catch(() => undefined);
      onClose();
      toast.success(current ? 'Valoración actualizada' : 'Valoración guardada', {
        id: 'rate-game',
      });
    },
    onError: () =>
      toast.error('No hemos podido guardar la valoración', {
        id: 'rate-game',
        description: 'Inténtalo de nuevo en un momento.',
      }),
  });

  const remove = useMutation({
    mutationFn: () => gamesApi.removeRating(gameId),
    onSuccess: () => {
      applyRating(null);
      onClose();
      toast.success('Valoración quitada', { id: 'rate-game' });
    },
    onError: () =>
      toast.error('No hemos podido quitar la valoración', {
        id: 'rate-game',
        description: 'Inténtalo de nuevo en un momento.',
      }),
  });

  // Vaciar las estrellas solo cambia el borrador; el DELETE viaja al confirmar.
  const clearsExisting = current !== null && score === 0;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (score > 0) save.mutate();
        else if (clearsExisting) remove.mutate();
      }}
      className="flex flex-col items-center text-center"
    >
      <GameCover name={gameName} size={64} />
      <div className="mt-4 flex items-center gap-1">
        {/* Hueco simétrico a la goma: las estrellas quedan centradas. */}
        <span aria-hidden="true" className="size-9 shrink-0" />
        <RatingStars value={score} size={34} onSelect={setScore} />
        <Tooltip content="Quitar valoración">
          <button
            type="button"
            aria-label="Quitar valoración"
            onClick={() => setScore(0)}
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl text-fg-3 transition-colors hover:bg-error-bg hover:text-error',
              score === 0 && 'invisible',
            )}
          >
            <Eraser size={18} strokeWidth={2} />
          </button>
        </Tooltip>
      </div>
      <p
        aria-live="polite"
        className="mt-1 min-h-6 font-display text-sm font-bold text-primary-700"
      >
        {score > 0 ? RATE_LABELS[score] : 'Toca una estrella'}
      </p>

      <div className="mt-3 w-full max-w-sm text-left">
        {/* px-3: casi alineada con el texto interior del Input, sin meterse. */}
        <label htmlFor={noteId} className="mb-1.5 flex items-baseline justify-between px-3 text-sm">
          <span className="font-semibold text-fg">Añade una nota</span>
          <span className="text-xs text-fg-3">Opcional</span>
        </label>
        <Input
          id={noteId}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
          placeholder="«Mejor con 4 jugadores…»"
        />
      </div>

      <div className="mt-5 flex w-full gap-2">
        <Button type="button" variant="ghost" block onClick={onClose}>
          Cancelar
        </Button>
        <Button
          type="submit"
          block
          variant={clearsExisting ? 'destructive' : 'primary'}
          disabled={score === 0 && current === null}
          loading={save.isPending || remove.isPending}
        >
          {submitLabel(current !== null, clearsExisting)}
        </Button>
      </div>
    </form>
  );
}

/** Texto del botón principal según el borrador: guarda, actualiza o quita. */
function submitLabel(hasCurrent: boolean, clearsExisting: boolean): string {
  if (!hasCurrent) return 'Guardar';
  return clearsExisting ? 'Quitar valoración' : 'Actualizar';
}
