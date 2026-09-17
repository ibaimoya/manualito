import { EnvelopeSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useTextWave } from '@/shared/hooks/useTextWave';

const EMAIL = 'support@manualito.dev';

export function ContactEmail() {
  const wave = useTextWave<HTMLAnchorElement>();

  return (
    <Button asChild variant="secondary" size="sm">
      <a {...wave} href={`mailto:${EMAIL}`} aria-label={EMAIL}>
        <span data-text-wave className="inline-flex" aria-hidden="true">
          <EnvelopeSimpleIcon size={18} className="translate-y-px" />
        </span>
        <span className="inline-flex" aria-hidden="true">
          {Array.from(EMAIL, (letter, index) => (
            <span key={`${letter}-${index}`} data-text-wave className="inline-block">
              {letter}
            </span>
          ))}
        </span>
      </a>
    </Button>
  );
}
