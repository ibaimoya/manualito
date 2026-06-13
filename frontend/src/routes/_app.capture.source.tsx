import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ScreenTopBar } from '@/app/Topbar';
import { Button } from '@/components/ui/button';
import { GameTypeahead, SelectedGameChip } from '@/features/upload/GameTypeahead';
import { api, isAbortApiError, type GameSearchItem } from '@/shared/api/client';
import { cn } from '@/shared/lib/cn';
import { toastApiError } from '@/shared/lib/toastApiError';

export const Route = createFileRoute('/_app/capture/source')({
  component: NewManualScreen,
});

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 10;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type Mode = 'images' | 'pdf';
type CreateManualVariables = Readonly<{ game: GameSearchItem; pages: File[]; mode: Mode }>;

function NewManualScreen() {
  const navigate = useNavigate();
  const [game, setGame] = useState<GameSearchItem | null>(null);
  const [pages, setPages] = useState<File[]>([]);
  // Un manual usa imágenes XOR un PDF, nunca ambos.
  const [mode, setMode] = useState<Mode | null>(null);

  const cameraInputId = useId();
  const galleryInputId = useId();
  const pdfInputId = useId();

  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const mutation = useMutation({
    mutationFn: (input: CreateManualVariables) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      if (input.mode === 'pdf') {
        return api.createManual(
          { title: input.game.name, gameId: input.game.id, pdf: input.pages[0]! },
          signal,
        );
      }
      return api.createManual(
        { title: input.game.name, gameId: input.game.id, images: input.pages },
        signal,
      );
    },
    onError: (err) => {
      if (isAbortApiError(err)) return;
      toastApiError(err, 'mutation-error', {
        title: 'Error inesperado',
        id: 'mutation-error-unknown',
        description: 'Vuelve a intentarlo en un momento.',
      });
    },
    onSuccess: (data, input) => {
      navigate({
        to: '/processing/$manualId',
        params: { manualId: data.manual_id },
        search: { name: input.game.name },
      }).catch(() => undefined);
    },
  });

  function submitManual(): void {
    if (busy) return;
    if (game === null) {
      toast.warning('Elige un juego', { description: 'Selecciona el juego antes de procesar.' });
      return;
    }
    if (mode === null || pages.length === 0) {
      toast.warning('Añade páginas', { description: 'Usa la cámara, la galería o sube un PDF.' });
      return;
    }
    mutation.mutate({ game, pages: [...pages], mode });
  }

  function addImages(incoming: File[]): void {
    if (incoming.length === 0) return;
    if (mode === 'pdf') {
      toast.warning('Ya has añadido un PDF', { description: 'Bórralo para subir imágenes.' });
      return;
    }
    const valid = incoming.filter((file) => IMAGE_TYPES.has(file.type));
    if (valid.length < incoming.length) {
      toast.warning('Formato no soportado', { description: 'Usa JPG, PNG o WebP.' });
    }
    if (valid.some((file) => file.size > MAX_IMAGE_BYTES)) {
      toast.warning('Imagen demasiado grande', { description: 'Cada imagen puede ocupar 20 MB.' });
      return;
    }
    const next = [...pages, ...valid];
    if (next.length > MAX_PAGES) {
      toast.warning('Demasiadas páginas', {
        description: `Máximo ${MAX_PAGES} imágenes por manual.`,
      });
      return;
    }
    if (next.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
      toast.warning('Archivo demasiado grande', {
        description: 'El total no puede superar 50 MB.',
      });
      return;
    }
    setPages(next);
    setMode('images');
  }

  function addPdf(file: File | undefined): void {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.warning('Formato no soportado', { description: 'Selecciona un PDF.' });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.warning('PDF demasiado grande', { description: 'El PDF puede ocupar 50 MB.' });
      return;
    }
    setPages([file]);
    setMode('pdf');
  }

  function removePage(index: number): void {
    setPages((current) => {
      const next = current.filter((_, i) => i !== index);
      if (next.length === 0) setMode(null);
      return next;
    });
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

  const ready = game !== null && mode !== null && pages.length > 0;
  const busy = mutation.isPending;
  const ctaLabel = ready ? `Procesar ${pages.length} ${pageWord(mode, pages.length)}` : 'Procesar';

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScreenTopBar
        crumb="Nuevo manual"
        back={
          <button
            type="button"
            onClick={() => navigate({ to: '/home' }).catch(() => undefined)}
            className="grid size-10 place-items-center rounded-xl text-fg-2 hover:bg-surface"
            aria-label="Cancelar y volver al inicio"
          >
            <X size={20} strokeWidth={2} />
          </button>
        }
      />

      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-8 p-5 md:grid-cols-2 md:gap-10 md:p-8">
        <section className="flex flex-col gap-5">
          <StepHeader n={1} title="Elige el juego" done={game !== null} />
          {game ? (
            <SelectedGameChip game={game} onChange={() => setGame(null)} />
          ) : (
            <GameTypeahead onSelect={setGame} focusOnMount />
          )}
          <p className="text-sm leading-relaxed text-fg-2">
            Buscamos el juego en BoardGameGeek para asociar el manual a su biblioteca y mejorar las
            respuestas.
          </p>
        </section>

        <section
          className={cn(
            'flex flex-col gap-4 transition-opacity',
            game ? 'opacity-100' : 'pointer-events-none opacity-45',
          )}
        >
          <StepHeader n={2} title="Añade las páginas" done={pages.length > 0} />
          <div className="grid grid-cols-3 gap-2.5">
            <SourceFileControl
              inputId={cameraInputId}
              icon={<Camera size={19} strokeWidth={2} />}
              label="Cámara"
              sub="Foto a foto"
              disabled={busy || game === null || mode === 'pdf'}
              input={{
                accept: 'image/jpeg,image/png,image/webp',
                ariaLabel: 'Hacer foto con la cámara',
                capture: 'environment',
                testId: 'picker-camera',
                onChange: (event) => {
                  addImages(Array.from(event.target.files ?? []));
                  event.target.value = '';
                },
              }}
            />
            <SourceFileControl
              inputId={galleryInputId}
              icon={<ImageIcon size={19} strokeWidth={2} />}
              label="Galería"
              sub="Varias a la vez"
              disabled={busy || game === null || mode === 'pdf'}
              input={{
                accept: 'image/jpeg,image/png,image/webp',
                ariaLabel: 'Seleccionar imágenes de la galería',
                multiple: true,
                testId: 'picker-gallery',
                onChange: (event) => {
                  addImages(Array.from(event.target.files ?? []));
                  event.target.value = '';
                },
              }}
            />
            <SourceFileControl
              inputId={pdfInputId}
              icon={<FileText size={19} strokeWidth={2} />}
              label="PDF"
              sub="Un documento"
              disabled={busy || game === null || mode === 'images'}
              input={{
                accept: 'application/pdf',
                ariaLabel: 'Seleccionar PDF',
                testId: 'picker-pdf',
                onChange: (event) => {
                  addPdf(event.target.files?.[0]);
                  event.target.value = '';
                },
              }}
            />
          </div>

          {pages.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-8 text-center text-sm text-fg-3">
              Aún no hay páginas. Usa la cámara, la galería o sube un PDF.
            </p>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
              <PageCounter count={pages.length} mode={mode} />
              <ul className="flex flex-col gap-2">
                {pages.map((file, index) => (
                  <PageRow
                    key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
                    file={file}
                    index={index}
                    total={pages.length}
                    mode={mode}
                    disabled={busy}
                    onMove={movePage}
                    onRemove={removePage}
                  />
                ))}
              </ul>
            </div>
          )}

          <Button
            block
            size="lg"
            className="hidden md:flex"
            loading={busy}
            disabled={!ready}
            onClick={submitManual}
          >
            <Sparkles size={18} strokeWidth={2} />
            {ctaLabel}
          </Button>
        </section>
      </div>

      <footer className="sticky bottom-0 border-t border-border bg-bg/95 p-4 backdrop-blur md:hidden">
        <Button block size="lg" loading={busy} disabled={!ready} onClick={submitManual}>
          <Sparkles size={18} strokeWidth={2} />
          {ctaLabel}
        </Button>
      </footer>
    </div>
  );
}

function pageWord(mode: Mode | null, count: number): string {
  if (mode === 'pdf') return 'PDF';
  return count === 1 ? 'página' : 'páginas';
}

function StepHeader({ n, title, done }: Readonly<{ n: number; title: string; done: boolean }>) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full font-display text-[13px] font-bold text-fg-inv',
          done ? 'bg-success' : 'bg-primary',
        )}
        aria-hidden="true"
      >
        {done ? '✓' : n}
      </span>
      <h2 className="font-display text-lg font-bold tracking-tight text-fg">{title}</h2>
    </div>
  );
}

function PageCounter({ count, mode }: Readonly<{ count: number; mode: Mode | null }>) {
  if (mode === 'pdf') {
    return <p className="text-sm font-semibold text-fg">PDF listo para procesar</p>;
  }
  const over = count > MAX_PAGES;
  return (
    <div className="flex items-center gap-3">
      <span className={cn('text-sm font-semibold', over ? 'text-error' : 'text-fg')}>
        {count} / {MAX_PAGES} páginas
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn('h-full rounded-full', over ? 'bg-error' : 'bg-primary')}
          style={{ width: `${Math.min(100, (count / MAX_PAGES) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function PageRow({
  file,
  index,
  total,
  mode,
  disabled,
  onMove,
  onRemove,
}: Readonly<{
  file: File;
  index: number;
  total: number;
  mode: Mode | null;
  disabled: boolean;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (index: number) => void;
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

  const isPdf = mode === 'pdf';
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-bg p-2.5">
      {url ? (
        <img
          src={url}
          alt=""
          width={48}
          height={48}
          className="size-12 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span
          className="grid size-12 shrink-0 place-items-center rounded-lg bg-error-bg text-error"
          aria-hidden="true"
        >
          <FileText size={22} strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-3">
          {isPdf ? 'PDF' : `Página ${index + 1}`}
        </p>
        <p className="truncate text-sm font-semibold text-fg">{file.name}</p>
        <p className="mono text-xs text-fg-3">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
      </div>
      <div className="flex shrink-0 gap-1">
        {isPdf ? null : (
          <>
            <IconButton
              label={`Subir página ${index + 1}`}
              disabled={disabled || index === 0}
              onClick={() => onMove(index, -1)}
              icon={<ChevronUp size={17} strokeWidth={2} />}
            />
            <IconButton
              label={`Bajar página ${index + 1}`}
              disabled={disabled || index === total - 1}
              onClick={() => onMove(index, 1)}
              icon={<ChevronDown size={17} strokeWidth={2} />}
            />
          </>
        )}
        <IconButton
          label={isPdf ? 'Quitar PDF' : `Quitar página ${index + 1}`}
          disabled={disabled}
          onClick={() => onRemove(index)}
          icon={<Trash2 size={17} strokeWidth={2} />}
        />
      </div>
    </li>
  );
}

function SourceFileControl({
  inputId,
  icon,
  label,
  sub,
  disabled,
  input,
}: Readonly<{
  inputId: string;
  icon: ReactNode;
  label: string;
  sub: string;
  disabled: boolean;
  input: {
    accept: string;
    ariaLabel: string;
    capture?: 'environment';
    multiple?: boolean;
    testId: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  };
}>) {
  return (
    <div className="relative">
      <input
        id={inputId}
        type="file"
        accept={input.accept}
        capture={input.capture}
        multiple={input.multiple}
        className="peer sr-only"
        data-testid={input.testId}
        disabled={disabled}
        onChange={input.onChange}
        aria-label={input.ariaLabel}
      />
      <label
        htmlFor={inputId}
        aria-disabled={disabled || undefined}
        className={cn(
          'flex min-h-[88px] flex-col items-start gap-2 rounded-2xl border border-border bg-surface p-3.5 text-left transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20',
          disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:bg-surface-2',
        )}
      >
        <span
          className="grid size-9 place-items-center rounded-xl border border-border bg-bg text-primary-700"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-fg">{label}</span>
          <span className="mt-0.5 block text-xs text-fg-3">{sub}</span>
        </span>
      </label>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  icon,
}: Readonly<{ label: string; disabled: boolean; onClick: () => void; icon: ReactNode }>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}
