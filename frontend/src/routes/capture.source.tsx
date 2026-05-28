import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Camera, FileText, Image as ImageIcon, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NameManualSheet } from '@/features/upload/NameManualSheet';
import { useFilePicker } from '@/shared/hooks/useFilePicker';
import { cn } from '@/shared/lib/cn';

/**
 * Pantalla intermedia "¿De dónde sacamos el manual?".
 *
 * Encadena el flujo Home → ESTA → /capture (solo si eligen cámara).
 * Galería y PDF saltan /capture y abren el file picker nativo directamente.
 *
 * Layout (decisión usuario):
 *   ┌──────────┬──────────┐
 *   │ Galería  │   PDF    │
 *   ├──────────┴──────────┤
 *   │   Hacer foto (wide) │   ← acción principal, doble ancho
 *   └─────────────────────┘
 */
export const Route = createFileRoute('/capture/source')({
  component: SourcePickerScreen,
});

const MAX_BYTES = 20 * 1024 * 1024;

function SourcePickerScreen() {
  const navigate = useNavigate();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  // useFilePicker dedupe clicks rápidos (bug #4 del catálogo).
  const openGallery = useFilePicker(galleryInputRef);
  const openPdf = useFilePicker(pdfInputRef);

  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [pickedSource, setPickedSource] = useState<'gallery' | 'pdf' | 'camera'>('gallery');
  const [sheetOpen, setSheetOpen] = useState(false);

  function validateAndOpenSheet(file: File, source: 'gallery' | 'pdf'): void {
    if (file.size > MAX_BYTES) {
      toast.warning('Archivo demasiado grande', {
        description: 'El máximo son 20 MB. Reduce el tamaño y vuelve a intentarlo.',
      });
      return;
    }
    if (source === 'gallery' && !file.type.startsWith('image/')) {
      toast.warning('Formato no soportado', { description: 'Usa JPG, PNG o WebP.' });
      return;
    }
    if (source === 'pdf' && file.type !== 'application/pdf') {
      toast.warning('Formato no soportado', { description: 'Selecciona un PDF.' });
      return;
    }
    setPickedFile(file);
    setPickedSource(source);
    setSheetOpen(true);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg md:max-w-2xl">
      <header className="flex items-center justify-between border-b border-border bg-bg px-4 py-3">
        <button
          type="button"
          onClick={() => navigate({ to: '/home' })}
          className="grid h-11 w-11 place-items-center rounded-xl text-fg-2 hover:bg-surface"
          aria-label="Cancelar y volver al inicio"
        >
          <X size={22} strokeWidth={2} />
        </button>
        <h1 className="font-display text-base font-bold">Nuevo manual</h1>
        <div aria-hidden="true" className="w-11" />
      </header>

      <div className="flex flex-1 flex-col gap-6 p-5">
        <div>
          <span className="mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            paso 1 / 2
          </span>
          <h2 className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight text-fg">
            ¿De dónde sacamos el manual?
          </h2>
          <p className="mt-1.5 text-base leading-relaxed text-fg-2">
            Elige cómo subes las páginas. Foto es lo más cómodo si lo tienes en la mesa.
          </p>
        </div>

        {/* Grid de fuentes (2 arriba + 1 ancha abajo) */}
        <div className="grid grid-cols-2 gap-3">
          <SourceTile
            icon={<ImageIcon size={22} strokeWidth={1.75} />}
            label="Galería"
            sub="JPG · PNG · WebP"
            onClick={openGallery}
          />
          <SourceTile
            icon={<FileText size={22} strokeWidth={1.75} />}
            label="PDF"
            sub="Hasta 20 MB"
            onClick={openPdf}
          />
          <SourceTile
            icon={<Camera size={28} strokeWidth={1.75} />}
            label="Hacer foto"
            sub="Cámara con guía de encuadre"
            primary
            wide
            onClick={() => navigate({ to: '/capture' })}
          />
        </div>

        <p className="mt-auto px-2 text-center text-xs text-fg-3">
          Tus fotos solo viajan al servidor cuando creas un manual. Se borran al
          terminar.
        </p>
      </div>

      {/* Inputs invisibles disparados por las tiles. */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        data-testid="picker-gallery"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) validateAndOpenSheet(file, 'gallery');
          e.target.value = '';
        }}
        aria-label="Seleccionar imagen de la galería"
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        data-testid="picker-pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) validateAndOpenSheet(file, 'pdf');
          e.target.value = '';
        }}
        aria-label="Seleccionar PDF"
      />

      <NameManualSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        file={pickedFile}
        source={pickedSource}
      />
    </div>
  );
}

type TileProps = Readonly<{
  icon: ReactNode;
  label: string;
  sub: string;
  /** Visual hero (fondo ámbar, texto inverso) — para la opción principal. */
  primary?: boolean;
  /** Doble ancho (`grid-column: 1 / -1`). */
  wide?: boolean;
  onClick: () => void;
}>;

function SourceTile({ icon, label, sub, primary = false, wide = false, onClick }: TileProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant={primary ? 'primary' : 'secondary'}
      className={cn(
        'flex h-auto flex-col items-start gap-4 rounded-2xl p-4 text-left',
        'min-h-[120px]',
        wide && 'col-span-2',
        !primary && 'border border-border bg-surface',
      )}
    >
      <span
        className={cn(
          'grid h-10 w-10 place-items-center rounded-xl',
          primary
            ? 'bg-white/20 text-fg-inv'
            : 'border border-border bg-bg text-primary-700',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="w-full">
        <div className={cn('font-semibold', primary ? 'text-fg-inv' : 'text-fg')}>
          {label}
        </div>
        <div
          className={cn(
            'mono mt-1 text-[10.5px] tracking-[0.05em]',
            primary ? 'opacity-80' : 'opacity-60',
          )}
        >
          {sub}
        </div>
      </div>
    </Button>
  );
}
