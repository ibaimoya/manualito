import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Camera, FileText, Image as ImageIcon, X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NameManualSheet } from '@/features/upload/NameManualSheet';
import { useFilePicker } from '@/shared/hooks/useFilePicker';
import { cn } from '@/shared/lib/cn';

export const Route = createFileRoute('/_app/capture/source')({
  component: SourcePickerScreen,
});

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_PAGES = 10;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function SourcePickerScreen() {
  const navigate = useNavigate();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const openGallery = useFilePicker(galleryInputRef);
  const openPdf = useFilePicker(pdfInputRef);

  const [pickedFiles, setPickedFiles] = useState<File[]>([]);
  const [pickedSource, setPickedSource] = useState<'gallery' | 'pdf' | 'camera'>('gallery');
  const [sheetOpen, setSheetOpen] = useState(false);

  function validateAndOpenSheet(files: File[], source: 'gallery' | 'pdf'): void {
    if (files.length === 0) return;
    if (source === 'gallery' && files.length > MAX_PAGES) {
      toast.warning('Demasiadas páginas', {
        description: `Puedes subir hasta ${MAX_PAGES} imágenes por manual.`,
      });
      return;
    }

    const totalBytes = files.reduce((total, file) => total + file.size, 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      toast.warning('Archivo demasiado grande', {
        description: 'El total no puede superar 50 MB.',
      });
      return;
    }
    if (source === 'gallery' && files.some((file) => file.size > MAX_IMAGE_BYTES)) {
      toast.warning('Imagen demasiado grande', {
        description: 'Cada imagen puede ocupar como máximo 20 MB.',
      });
      return;
    }
    if (source === 'pdf' && files[0]!.size > MAX_PDF_BYTES) {
      toast.warning('PDF demasiado grande', {
        description: 'El PDF puede ocupar como máximo 50 MB.',
      });
      return;
    }
    if (source === 'gallery' && files.some((file) => !ALLOWED_IMAGE_TYPES.has(file.type))) {
      toast.warning('Formato no soportado', { description: 'Usa JPG, PNG o WebP.' });
      return;
    }
    if (source === 'pdf' && files[0]!.type !== 'application/pdf') {
      toast.warning('Formato no soportado', { description: 'Selecciona un PDF.' });
      return;
    }

    setPickedFiles(source === 'pdf' ? [files[0]!] : files);
    setPickedSource(source);
    setSheetOpen(true);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg md:max-w-5xl">
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

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <SourceTile
            icon={<ImageIcon size={22} strokeWidth={1.75} />}
            label="Galería"
            sub={`Hasta ${MAX_PAGES} imágenes`}
            onClick={openGallery}
          />
          <SourceTile
            icon={<FileText size={22} strokeWidth={1.75} />}
            label="PDF"
            sub="Hasta 50 MB"
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
          Tus archivos solo viajan al servidor cuando creas un manual y quedan asociados a ese
          manual.
        </p>
      </div>

      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        data-testid="picker-gallery"
        onChange={(event) => {
          validateAndOpenSheet(Array.from(event.target.files ?? []), 'gallery');
          event.target.value = '';
        }}
        aria-label="Seleccionar imágenes de la galería"
      />
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        data-testid="picker-pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) validateAndOpenSheet([file], 'pdf');
          event.target.value = '';
        }}
        aria-label="Seleccionar PDF"
      />

      <NameManualSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        files={pickedFiles}
        source={pickedSource}
      />
    </div>
  );
}

type TileProps = Readonly<{
  icon: ReactNode;
  label: string;
  sub: string;
  primary?: boolean;
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
        'flex h-auto min-h-[120px] flex-col items-start gap-4 rounded-2xl p-4 text-left',
        wide && 'col-span-2 md:col-span-1',
        !primary && 'border border-border bg-surface',
      )}
    >
      <span
        className={cn(
          'grid h-10 w-10 place-items-center rounded-xl',
          primary ? 'bg-white/20 text-fg-inv' : 'border border-border bg-bg text-primary-700',
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="w-full">
        <div className={cn('font-semibold', primary ? 'text-fg-inv' : 'text-fg')}>{label}</div>
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
