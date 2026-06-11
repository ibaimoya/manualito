import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResponsiveModal } from '@/components/ui/responsive-modal';
import { GameCover } from '@/features/games/GameCover';
import { RATE_LABELS, RatingStars } from '@/features/games/RatingStars';
import { gameDetailKey } from '@/features/games/use-games';
import { gamesApi, type GameDetail, type GameRating } from '@/shared/api/games';

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
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameId: string;
  gameName: string;
  current: GameRating | null;
}>) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`¿Qué te ha parecido ${gameName}?`}
      description={
        current
          ? 'Puedes cambiar tu valoración cuando quieras.'
          : 'Tu valoración es solo tuya — nos ayuda a ordenar tu estantería.'
      }
      contentClassName="max-w-lg"
    >
      <RateGameForm
        gameId={gameId}
        gameName={gameName}
        current={current}
        onClose={() => onOpenChange(false)}
      />
    </ResponsiveModal>
  );
}

function RateGameForm({
  gameId,
  gameName,
  current,
  onClose,
}: Readonly<{
  gameId: string;
  gameName: string;
  current: GameRating | null;
  onClose: () => void;
}>) {
  const qc = useQueryClient();
  const noteId = useId();
  const [score, setScore] = useState(current?.score ?? 0);
  const [note, setNote] = useState(current?.note ?? '');

  // Escribe la valoración en cache con la respuesta del servidor: aunque el
  // refetch de la invalidación falle, la cabecera ya muestra el dato real.
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

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (score > 0) save.mutate();
      }}
      className="flex flex-col items-center text-center"
    >
      <GameCover name={gameName} size={64} />
      <div className="mt-4">
        <RatingStars value={score} size={34} onSelect={setScore} />
      </div>
      <p
        aria-live="polite"
        className="mt-1 min-h-6 font-display text-sm font-bold text-primary-700"
      >
        {score > 0 ? RATE_LABELS[score] : 'Toca una estrella'}
      </p>

      <div className="mt-3 w-full max-w-sm text-left">
        <label htmlFor={noteId} className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-semibold text-fg">Añade una nota</span>
          <span className="text-xs text-fg-3">opcional</span>
        </label>
        <Input
          id={noteId}
          value={note}
          maxLength={NOTE_MAX}
          onChange={(event) => setNote(event.target.value)}
          placeholder="«Brilla a 4 jugadores…»"
        />
      </div>

      {current ? (
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="mt-4 text-sm font-semibold text-error hover:underline disabled:opacity-60"
        >
          Quitar valoración
        </button>
      ) : null}

      <div className="mt-5 flex w-full gap-2">
        <Button type="button" variant="ghost" block onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" block disabled={score === 0} loading={save.isPending}>
          <Check size={16} strokeWidth={2.4} />
          {current ? 'Actualizar' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
