import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, FileText, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  api,
  apiErrorNotification,
  isAbortApiError,
  type GameSearchItem,
} from '@/shared/api/client';

export type UploadSource = 'gallery' | 'pdf' | 'camera';

type Props = Readonly<{
  files: File[];
  source: UploadSource;
  onClose: () => void;
}>;

type SubmitVars = {
  name: string;
  gameId: string;
  files: File[];
};

export function subtitleForSource(source: UploadSource): string {
  if (source === 'gallery') return 'Revisa las paginas antes de procesarlas.';
  if (source === 'pdf') return 'Se procesaran todas las paginas del PDF.';
  return 'Vamos a etiquetar la foto antes de procesarla.';
}

export function NameManualForm({ files, source, onClose }: Props) {
  const navigate = useNavigate();
  const inputId = useId();
  const [pages, setPages] = useState<File[]>(files);
  const [name, setName] = useState('');
  const [selectedGame, setSelectedGame] = useState<GameSearchItem | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const searchTerm = name.trim();
  const gameSearch = useQuery({
    queryKey: ['games', searchTerm],
    queryFn: ({ signal }) => api.searchGames(searchTerm, signal),
    enabled: searchTerm.length >= 2 && selectedGame?.name !== searchTerm,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (files.length > 0) requestAnimationFrame(() => nameInputRef.current?.focus());
  }, [files.length]);

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const mutation = useMutation({
    mutationFn: ({ name: manualName, gameId, files: uploadFiles }: SubmitVars) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      if (source === 'pdf') {
        return api.createManual(
          { title: manualName, gameId, pdf: uploadFiles[0]! },
          abortRef.current.signal,
        );
      }
      return api.createManual(
        { title: manualName, gameId, images: uploadFiles },
        abortRef.current.signal,
      );
    },
    onError: (err) => {
      if (isAbortApiError(err)) return;
      const notification = apiErrorNotification(err, 'mutation-error', {
        title: 'Error inesperado',
        id: 'mutation-error-unknown',
        description: 'Vuelve a intentarlo en un momento.',
      });
      toast.error(notification.title, {
        id: notification.id,
        description: notification.description,
      });
    },
    onSuccess: (data, vars) => {
      onClose();
      navigate({
        to: '/processing/$manualId',
        params: { manualId: data.manual_id },
        search: { name: vars.name },
      }).catch(() => undefined);
    },
  });

  function handleSubmit(e: { preventDefault: () => void }): void {
    e.preventDefault();
    const trimmed = name.trim();
    if (pages.length === 0) {
      toast.warning('Anade al menos una pagina');
      return;
    }
    if (trimmed.length < 2) {
      toast.warning('El nombre necesita al menos 2 caracteres');
      nameInputRef.current?.focus();
      return;
    }
    if (selectedGame === null) {
      toast.warning('Selecciona un juego de la lista');
      nameInputRef.current?.focus();
      return;
    }
    mutation.mutate({ name: trimmed, gameId: selectedGame.id, files: pages });
  }

  function movePage(index: number, delta: -1 | 1): void {
    setPages((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [page] = next.splice(index, 1);
      if (!page) return current;
      next.splice(target, 0, page);
      return next;
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      data-testid="name-manual-form"
    >
      <FilePreview
        files={pages}
        source={source}
        disabled={mutation.isPending}
        onMove={movePage}
        onRemove={(index) => setPages((current) => current.filter((_, i) => i !== index))}
      />
      <Label htmlFor={inputId}>Nombre del juego</Label>
      <Input
        id={inputId}
        ref={nameInputRef}
        preset="game-name"
        placeholder="Catan, Wingspan, Parchis..."
        value={name}
        onChange={(e) => {
          const nextName = e.target.value;
          setName(nextName);
          if (selectedGame?.name !== nextName) setSelectedGame(null);
        }}
        disabled={mutation.isPending}
        maxLength={120}
      />
      <GameResults
        games={gameSearch.data?.games ?? []}
        isFetching={gameSearch.isFetching}
        minLengthReached={searchTerm.length >= 2}
        selectedGame={selectedGame}
        onSelect={(game) => {
          setSelectedGame(game);
          setName(game.name);
        }}
      />
      <p className="mono text-xs text-fg-3">
        Selecciona el juego para asociar el manual a su biblioteca.
      </p>
      <div className="mt-2 flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button
          type="button"
          variant="ghost"
          size="md"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          size="md"
          loading={mutation.isPending}
          disabled={pages.length === 0 || name.trim().length < 2 || selectedGame === null}
        >
          <Upload size={18} strokeWidth={2} />
          Procesar
        </Button>
      </div>
    </form>
  );
}

function GameResults({
  games,
  isFetching,
  minLengthReached,
  selectedGame,
  onSelect,
}: Readonly<{
  games: GameSearchItem[];
  isFetching: boolean;
  minLengthReached: boolean;
  selectedGame: GameSearchItem | null;
  onSelect: (game: GameSearchItem) => void;
}>) {
  if (selectedGame !== null) {
    return (
      <p className="mono text-xs text-primary-700">
        Juego seleccionado: {selectedGame.name}
      </p>
    );
  }
  if (!minLengthReached) return null;

  return (
    <div className="max-h-44 overflow-auto rounded-lg border border-border bg-bg">
      {games.map((game) => (
        <button
          key={game.id}
          type="button"
          aria-label={`${game.name} ${game.year_published ?? 's/f'}`}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface"
          onClick={() => onSelect(game)}
        >
          <span className="font-medium text-fg">{game.name}</span>
          <span className="mono shrink-0 text-xs text-fg-3">
            {game.year_published ?? 's/f'}
          </span>
        </button>
      ))}
      {isFetching ? <p className="mono px-3 py-2 text-xs text-fg-3">Buscando...</p> : null}
      {!isFetching && games.length === 0 ? (
        <p className="mono px-3 py-2 text-xs text-fg-3">Sin resultados</p>
      ) : null}
    </div>
  );
}

function FilePreview({
  files,
  source,
  disabled,
  onMove,
  onRemove,
}: Readonly<{
  files: File[];
  source: UploadSource;
  disabled: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
}>) {
  if (files.length === 0) return null;

  if (source === 'pdf') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-bg text-primary-700"
          aria-hidden="true"
        >
          <FileText size={24} strokeWidth={1.75} />
        </div>
        <FileMeta file={files[0]!} label="PDF" />
        <IconButton
          label="Quitar PDF"
          disabled={disabled}
          onClick={() => onRemove(0)}
          icon={<Trash2 size={17} strokeWidth={2} />}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {files.map((file, index) => (
        <PagePreview
          key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
          file={file}
          pageNumber={index + 1}
          disabled={disabled}
          canMoveUp={index > 0}
          canMoveDown={index < files.length - 1}
          onMoveUp={() => onMove(index, -1)}
          onMoveDown={() => onMove(index, 1)}
          onRemove={() => onRemove(index)}
        />
      ))}
    </div>
  );
}

function PagePreview({
  file,
  pageNumber,
  disabled,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
}: Readonly<{
  file: File;
  pageNumber: number;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}>) {
  const url = useMemo(() => {
    if (!file.type.startsWith('image/')) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      {url ? (
        <img
          src={url}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="h-16 w-16 shrink-0 rounded-lg bg-bg" aria-hidden="true" />
      )}
      <FileMeta file={file} label={`Pagina ${pageNumber}`} />
      <div className="flex shrink-0 gap-1">
        <IconButton
          label={`Subir pagina ${pageNumber}`}
          disabled={disabled || !canMoveUp}
          onClick={onMoveUp}
          icon={<ChevronUp size={17} strokeWidth={2} />}
        />
        <IconButton
          label={`Bajar pagina ${pageNumber}`}
          disabled={disabled || !canMoveDown}
          onClick={onMoveDown}
          icon={<ChevronDown size={17} strokeWidth={2} />}
        />
        <IconButton
          label={`Quitar pagina ${pageNumber}`}
          disabled={disabled}
          onClick={onRemove}
          icon={<Trash2 size={17} strokeWidth={2} />}
        />
      </div>
    </div>
  );
}

function FileMeta({ file, label }: Readonly<{ file: File; label: string }>) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mono text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-3">
        {label}
      </p>
      <p className="truncate font-semibold text-fg">{file.name}</p>
      <p className="mono text-xs text-fg-3">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  icon,
}: Readonly<{
  label: string;
  disabled: boolean;
  onClick: () => void;
  icon: ReactNode;
}>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}
