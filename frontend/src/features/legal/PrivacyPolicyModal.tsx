import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { PrivacySections } from '@/features/legal/PrivacySections';

/**
 * Política de privacidad como modal in-app: se consulta sin perder el
 * contexto (formulario de registro, onboarding) ni abrir otra pestaña.
 */
export function PrivacyPolicyModal({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { t } = useTranslation('legal');

  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-lg">
      <DialogHeader
        title={t('modal.title')}
        description={t('modal.description')}
        onClose={() => onOpenChange(false)}
      />
      <DialogBody className="max-h-[70dvh] overflow-y-auto">
        <PrivacySections />
      </DialogBody>
    </Dialog>
  );
}
