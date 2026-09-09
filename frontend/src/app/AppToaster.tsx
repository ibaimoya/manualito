import { Check, Info, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Toaster } from 'sonner';
import { useTheme } from './theme';
import './toaster.css';

const icons = {
  success: <Check size={20} strokeWidth={2} aria-hidden="true" />,
  info: <Info size={20} strokeWidth={1.8} aria-hidden="true" />,
  warning: <TriangleAlert size={20} strokeWidth={1.8} aria-hidden="true" />,
  error: <X size={20} strokeWidth={2} aria-hidden="true" />,
  close: <X size={16} strokeWidth={1.8} aria-hidden="true" />,
};

/** Un único punto de presentación; Sonner conserva la pila, las pausas y los gestos. */
export function AppToaster() {
  const { mode } = useTheme();
  const { t } = useTranslation('shell');

  return (
    <Toaster
      className="manualito-toaster"
      position="bottom-right"
      theme={mode === 'auto' ? 'system' : mode}
      closeButton
      icons={icons}
      visibleToasts={3}
      duration={5000}
      gap={10}
      offset={{ bottom: 'max(24px, env(safe-area-inset-bottom))', right: 24 }}
      mobileOffset={{ bottom: 'max(16px, env(safe-area-inset-bottom))', left: 16, right: 16 }}
      containerAriaLabel={t('notifications.label')}
      toastOptions={{ closeButtonAriaLabel: t('notifications.dismiss') }}
    />
  );
}
