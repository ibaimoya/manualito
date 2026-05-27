import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/shared/api/client';
import { storage } from '@/shared/lib/storage';

export type UploadSource = 'gallery' | 'pdf' | 'camera';

interface Props {
  file: File | null;
  source: UploadSource;
  /** Llamado tras Cancelar o tras Procesar exitoso. */
  onClose: () => void;
}

/**
 * Subtítulo contextual según el origen del fichero — wrapper lo usa
 * para su SheetHeader / DialogTitle.
 */
export function subtitleForSource(source: UploadSource): string {
  if (source === 'gallery') return 'Vamos a etiquetar la imagen antes de procesarla.';
  if (source === 'pdf') return 'Vamos a etiquetar el PDF antes de procesarlo.';
  return 'Vamos a etiquetar la foto antes de procesarla.';
}

/**
 * Formulario puro de "ponle nombre al manual + procesar".
 *
 * Extraído de NameManualSheet para que pueda vivir tanto dentro de un
 * BottomSheet (móvil) como de un Dialog centrado (desktop) — la lógica
 * (mutation + validación + navegación) es la misma.
 *
 * El wrapper de turno (Sheet o Dialog) envuelve este componente y pone
 * su propia chrome (handle, header, animaciones).
 */
export function NameManualForm({ file, onClose }: Props) {
  const navigate = useNavigate();
  const inputId = useId();
  const [name, setName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Reset al recibir un fichero nuevo + focus inicial al input.
  useEffect(() => {
    if (file) {
      setName('');
      requestAnimationFrame(() => nameInputRef.current?.focus());
    }
  }, [file]);

  // AbortController vivo: cancela la petición en curso si el componente
  // se desmonta (usuario navega fuera mientras isPending) — evita el
  // state update fantasma post-unmount.  Ver catálogo bug #2.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const mutation = useMutation({
    mutationFn: ({ name: n, image }: { name: string; image: File }) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      return api.createManual(n, image, abortRef.current.signal);
    },
    onError: (err) => {
      // AbortError = nosotros mismos cancelamos. No es un fallo de usuario.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (
        err instanceof ApiError &&
        err.raw instanceof DOMException &&
        err.raw.name === 'AbortError'
      ) {
        return;
      }
      if (err instanceof ApiError) {
        // Id estable por código de error → si la API falla varias veces,
        // mantenemos UN solo toast actualizado en vez de apilar.  Bug #6.
        toast.error(err.view.title, {
          id: `mutation-error-${err.view.code}`,
          description: err.view.message,
        });
      } else {
        toast.error('Error inesperado', {
          id: 'mutation-error-unknown',
          description: 'Vuelve a intentarlo en un momento.',
        });
      }
    },
    onSuccess: (data, vars) => {
      // Persistimos las líneas OCR que devuelve el backend para que la
      // pantalla "Ver texto original" del Result pueda mostrarlas sin
      // re-extraer.  Se guarda ANTES de navegar para garantizar que
      // /processing → /result encuentren el dato.
      storage.setOcrLines(data.manual_id, data.ocr_lines);
      onClose();
      void navigate({
        to: '/processing/$manualId',
        params: { manualId: data.manual_id },
        search: { name: vars.name },
      });
    },
  });

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!file) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.warning('El nombre necesita al menos 2 caracteres');
      nameInputRef.current?.focus();
      return;
    }
    mutation.mutate({ name: trimmed, image: file });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      data-testid="name-manual-form"
    >
      <FilePreview file={file} />
      <Label htmlFor={inputId}>Nombre del juego</Label>
      <Input
        id={inputId}
        ref={nameInputRef}
        preset="game-name"
        placeholder="Catan, Wingspan, Parchís…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={mutation.isPending}
        maxLength={120}
      />
      <p className="mono text-xs text-fg-3">
        Lo usamos para identificarlo en tu historial. Puedes cambiarlo después.
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
          disabled={!file || name.trim().length < 2}
        >
          <Upload size={18} strokeWidth={2} />
          Procesar
        </Button>
      </div>
    </form>
  );
}

/** Indica si el form está en pleno upload — útil para que el wrapper
 *  no permita cerrar el modal mientras la mutation corre.
 *
 *  Implementado vía estado externo simple: el wrapper crea su propio
 *  estado isPending si lo necesita; aquí no exponemos refs.
 */

function FilePreview({ file }: { file: File | null }) {
  // Memoiza la URL para evitar recrearla en cada render — cada
  // createObjectURL nueva consume memoria hasta su revoke.  El bug #7
  // del catálogo: si revocábamos en onLoad y el componente rerendereaba
  // (ej. al teclear en el input "nombre"), la URL anterior ya estaba
  // muerta y la imagen quedaba rota.
  const url = useMemo(() => {
    if (!file || !file.type.startsWith('image/')) return null;
    return URL.createObjectURL(file);
  }, [file]);

  // Cleanup: revoca la URL cuando cambia el file o se desmonta el
  // componente.  Patrón estándar React + MDN.
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  if (!file) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      {url ? (
        // width/height explícitos previenen CLS (Cumulative Layout Shift)
        // — el navegador reserva el espacio antes de pintar la imagen.
        // Catálogo bug #17.  Core Web Vital CLS objetivo: < 0.1.
        <img
          src={url}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-bg text-primary-700"
          aria-hidden="true"
        >
          <span className="mono text-[10px] font-bold tracking-widest">PDF</span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-fg">{file.name}</p>
        <p className="mono text-xs text-fg-3">
          {(file.size / 1024 / 1024).toFixed(2)} MB
        </p>
      </div>
    </div>
  );
}
