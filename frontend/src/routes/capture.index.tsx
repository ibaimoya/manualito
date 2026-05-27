import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Camera, FileText, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { NameManualSheet } from '@/features/upload/NameManualSheet';
import { useFilePicker } from '@/shared/hooks/useFilePicker';

/**
 * Pantalla de captura — exclusivamente modo cámara.
 *
 * Diseño (look "HomeC adaptado" del bundle):
 *   - Zona grande con borde dashed y corner guides amarillas.
 *   - Shutter circular gigante centrado.
 *   - Sin tabs "Nuevo / Mis manuales" (no pintan en este paso).
 *   - Sin "Última partida" (no pinta — el usuario ya decidió crear uno).
 *
 * Tras pulsar el shutter, el input nativo abre la cámara en móvil
 * (`capture="environment"`) o el selector de archivo en desktop.  Cuando
 * el usuario elige un fichero se abre el bottom sheet de nombre.
 */
export const Route = createFileRoute('/capture/')({
  component: CaptureCameraScreen,
});

const MAX_BYTES = 20 * 1024 * 1024;

function CaptureCameraScreen() {
  const navigate = useNavigate();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Anti doble-click del shutter (bug #4 del catálogo).
  const openCamera = useFilePicker(cameraInputRef);

  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function onFilePicked(file: File): void {
    if (file.size > MAX_BYTES) {
      toast.warning('Archivo demasiado grande', {
        description: 'El máximo son 20 MB. Reduce la resolución y vuelve a intentarlo.',
      });
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.warning('Formato no soportado', {
        description: 'La cámara debería entregar JPG/PNG. Reintenta.',
      });
      return;
    }
    setPickedFile(file);
    setSheetOpen(true);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg md:max-w-3xl">
      <header className="flex items-center justify-between border-b border-border bg-bg px-2 py-2">
        <button
          type="button"
          onClick={() => navigate({ to: '/capture/source' })}
          className="grid h-11 w-11 place-items-center rounded-xl text-fg hover:bg-surface"
          aria-label="Cambiar fuente"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </button>
        <h1 className="font-display text-base font-bold">Hacer foto</h1>
        <button
          type="button"
          onClick={() => navigate({ to: '/home' })}
          className="grid h-11 w-11 place-items-center rounded-xl text-fg-2 hover:bg-surface"
          aria-label="Cancelar y volver al inicio"
        >
          <X size={22} strokeWidth={2} />
        </button>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-5">
        <div>
          <span className="mono text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-700">
            paso 2 / 2
          </span>
          <h2 className="mt-2 font-display text-xl font-bold leading-tight tracking-tight text-fg">
            Captura el manual
          </h2>
          <p className="mt-1.5 text-base leading-relaxed text-fg-2">
            Una página por foto. Encuadra el texto completo y pulsa el botón.
          </p>
        </div>

        {/* Viewfinder: zona dashed con corner guides + shutter centrado */}
        <button
          type="button"
          onClick={openCamera}
          className="relative grid min-h-[320px] flex-1 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-border-strong bg-surface text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
          aria-label="Abrir cámara para capturar el manual"
        >
          {/* 4 corner guides */}
          {[
            ['top-3', 'left-3', 'border-t-2 border-l-2 rounded-tl-md'],
            ['top-3', 'right-3', 'border-t-2 border-r-2 rounded-tr-md'],
            ['bottom-3', 'left-3', 'border-b-2 border-l-2 rounded-bl-md'],
            ['bottom-3', 'right-3', 'border-b-2 border-r-2 rounded-br-md'],
          ].map(([v, h, b]) => (
            <span
              key={`${v}-${h}`}
              aria-hidden="true"
              className={`absolute h-6 w-6 border-primary ${v} ${h} ${b}`}
            />
          ))}

          <div className="flex flex-col items-center gap-3">
            <span
              className="grid h-24 w-24 place-items-center rounded-full bg-primary text-fg-inv shadow-md ring-8 ring-primary-100"
              aria-hidden="true"
            >
              <Camera size={40} strokeWidth={1.75} />
            </span>
            <p className="font-display text-base font-bold">Toca para hacer foto</p>
            <p className="text-sm text-fg-2">
              En móvil abre la cámara, en escritorio el selector de archivo.
            </p>
          </div>
        </button>

        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="md"
            block
            variant="secondary"
            onClick={() => navigate({ to: '/capture/source' })}
          >
            <FileText size={18} strokeWidth={2} />
            Usar galería o PDF en su lugar
          </Button>
        </div>
      </div>

      {/* Input invisible disparado por la zona de captura. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="sr-only"
        data-testid="picker-camera"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFilePicked(file);
          e.target.value = '';
        }}
        aria-label="Seleccionar imagen de la cámara"
      />

      <NameManualSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        file={pickedFile}
        source="camera"
      />
    </div>
  );
}
