import { Dialog, DialogBody, DialogHeader } from '@/components/ui/dialog';
import { PrivacySections } from '@/features/legal/PrivacySections';

/**
 * Política de privacidad como modal in-app: se consulta sin perder el
 * contexto (formulario de registro, onboarding) ni abrir otra pestaña.
 */
export function PrivacyPolicyModal({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} contentClassName="max-w-lg">
      <DialogHeader
        title="Política de privacidad"
        description="Qué guardamos y para qué."
        onClose={() => onOpenChange(false)}
      />
      <DialogBody className="max-h-[70dvh] overflow-y-auto">
        <PrivacySections />
      </DialogBody>
    </Dialog>
  );
}
