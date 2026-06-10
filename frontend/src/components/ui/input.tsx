import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/shared/lib/cn';

/**
 * Presets de atributos móviles para casos comunes — evitan que cada
 * callsite tenga que recordar `inputMode + enterKeyHint + spellCheck +
 * autoComplete + autoCapitalize`.
 */
type InputPreset = 'game-name' | 'search' | 'chat-message' | 'email' | 'username' | 'free';

type PresetConfig = Pick<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'inputMode' | 'enterKeyHint' | 'spellCheck' | 'autoComplete' | 'autoCapitalize'
>;

const PRESETS: Record<InputPreset, PresetConfig> = {
  // Nombre de juego de mesa propio (Catan, Wingspan…): NO spellcheck (los
  // marca como mal escritos), capitalización de palabras (mayúscula
  // inicial), enter = "Listo".
  'game-name': {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'done',
    spellCheck: false,
    autoComplete: 'off',
    autoCapitalize: 'words',
  },
  // Búsqueda libre: type=search activa la X nativa (con estilo) y abre
  // el teclado de búsqueda en algunos contextos móviles.
  search: {
    type: 'search',
    inputMode: 'search',
    enterKeyHint: 'search',
    spellCheck: false,
    autoComplete: 'off',
    autoCapitalize: 'none',
  },
  // Mensaje de chat: capitalización de oraciones, spellcheck activo,
  // enter = "Enviar".
  'chat-message': {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'send',
    spellCheck: true,
    autoComplete: 'off',
    autoCapitalize: 'sentences',
  },
  // Email de login/registro: teclado de email, sin autocapitalizar.
  email: {
    type: 'email',
    inputMode: 'email',
    enterKeyHint: 'next',
    spellCheck: false,
    autoComplete: 'email',
    autoCapitalize: 'none',
  },
  // Nombre de usuario visible: autocompletar nick, sin spellcheck.
  username: {
    type: 'text',
    inputMode: 'text',
    enterKeyHint: 'next',
    spellCheck: false,
    autoComplete: 'username',
    autoCapitalize: 'none',
  },
  free: {},
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * Atributos por defecto para el caso típico.  El callsite puede
   * sobrescribir cualquier atributo individual si lo necesita.
   */
  preset?: InputPreset;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, preset = 'free', type, ...props },
  ref,
) {
  const presetAttrs = PRESETS[preset];
  return (
    <input
      ref={ref}
      // El orden importa: el preset va PRIMERO, luego ...props para que
      // el callsite pueda sobrescribir.
      {...presetAttrs}
      type={type ?? presetAttrs.type ?? 'text'}
      className={cn(
        'flex h-11 w-full rounded-xl border border-border-strong bg-bg px-3.5 py-2',
        'font-body text-base text-fg placeholder:text-fg-3',
        'transition-shadow duration-150 ease-[var(--ease-mn)]',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:border-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:font-medium file:text-fg-2',
        className,
      )}
      {...props}
    />
  );
});
