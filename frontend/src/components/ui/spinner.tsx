import { cn } from '@/shared/lib/cn';

/**
 * Ruleta de carga reutilizable. Decorativa (aria-hidden): el contenedor que la
 * usa aporta el texto accesible. Hereda el color con currentColor.
 */
export function Spinner({ size = 16, className }: Readonly<{ size?: number; className?: string }>) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-block shrink-0 rounded-full border-2 border-current border-t-transparent',
        className,
      )}
      style={{ width: size, height: size, animation: 'mn-spin 0.7s linear infinite' }}
    />
  );
}
