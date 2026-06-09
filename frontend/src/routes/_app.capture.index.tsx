import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * La cámara ahora es un botón de fuente dentro de `/capture/source` (abre el
 * input nativo con `capture="environment"`), así que esta ruta solo redirige
 * al flujo unificado de creación de manual.
 */
export const Route = createFileRoute('/_app/capture/')({
  beforeLoad: () => {
    throw redirect({ to: '/capture/source' });
  },
  component: () => null,
});
