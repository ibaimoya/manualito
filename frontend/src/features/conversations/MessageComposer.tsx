import { useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';

/**
 * Barra de envío compartida por el chat y el hub del juego: un recuadro
 * redondeado con el textarea, que crece con el contenido, y el botón de enviar
 * a su derecha, dentro del mismo recuadro. El contador aparece al acercarse al
 * límite. Enter envía; Mayús+Enter salta de línea.
 */

const NEAR_RATIO = 0.8;
const MAX_TEXTAREA_PX = 120;

export function MessageComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  maxLength,
  disabled = false,
  sendPending = false,
  autoFocus = false,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder: string;
  maxLength: number;
  disabled?: boolean;
  /** Bloquea solo el envio: el textarea queda editable para preparar el siguiente borrador. */
  sendPending?: boolean;
  autoFocus?: boolean;
}>) {
  const { t } = useTranslation('chat');
  const ref = useRef<HTMLTextAreaElement>(null);

  // El textarea crece con el texto hasta un máximo; pasado el tope, scrollea.
  // Hasta entonces mantenemos overflow oculto: con una sola línea, un desajuste
  // de subpíxel basta para que asome la barra de scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const full = el.scrollHeight;
    el.style.height = `${Math.min(full, MAX_TEXTAREA_PX)}px`;
    el.style.overflowY = full > MAX_TEXTAREA_PX ? 'auto' : 'hidden';
  }, [value]);

  const canSend = value.trim().length > 0 && !disabled && !sendPending;
  const near = value.length > maxLength * NEAR_RATIO;

  function submit(): void {
    if (canSend) onSubmit();
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-center gap-2 rounded-3xl border border-border-strong bg-card p-1.5 pl-4 shadow-sm transition-shadow focus-within:border-primary focus-within:shadow-[var(--m-shadow-ring-primary)]"
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={t('composer.aria.question')}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        spellCheck
        enterKeyHint="send"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-[9px] text-[15.5px] leading-normal text-fg outline-none placeholder:text-fg-3"
      />
      {near ? (
        <span className="mono shrink-0 text-[11px] tabular-nums text-warning" aria-live="polite">
          {value.length}/{maxLength}
        </span>
      ) : null}
      <button
        type="submit"
        disabled={!canSend}
        aria-label={t('actions.sendQuestion')}
        aria-busy={sendPending || undefined}
        className={cn(
          'composer-send grid size-[46px] shrink-0 place-items-center rounded-full bg-fg text-bg transition-control duration-150 enabled:hover:bg-primary-700 motion-safe:enabled:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
          {
            'cursor-wait': sendPending,
            'cursor-not-allowed opacity-40': !canSend && !sendPending,
          },
        )}
      >
        <span className="state-icon" data-active={sendPending} aria-hidden="true">
          <ArrowUp size={22} strokeWidth={2.8} />
          <span className="grid size-[22px] place-items-center">
            <span className="composer-send-orbit" />
          </span>
        </span>
      </button>
    </form>
  );
}
