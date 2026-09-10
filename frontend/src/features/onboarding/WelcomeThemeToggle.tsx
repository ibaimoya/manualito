import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/app/theme';
import { Tooltip } from '@/components/ui/tooltip';
import { useNamedMediaQuery } from '@/shared/hooks/useMediaQuery';
import styles from '@/features/auth/entry.module.css';

export function WelcomeThemeToggle() {
  const { t } = useTranslation('onboarding');
  const { mode, setMode } = useTheme();
  const systemDark = useNamedMediaQuery('darkMode');
  const dark = mode === 'dark' || (mode === 'auto' && systemDark);
  const label = t(dark ? 'actions.lightMode' : 'actions.darkMode');

  return (
    <Tooltip content={label} side="bottom">
      <button
        type="button"
        className={styles.theme}
        aria-label={label}
        onClick={() => setMode(dark ? 'light' : 'dark')}
      >
        <Sun size={19} aria-hidden="true" data-active={dark} />
        <Moon size={19} aria-hidden="true" data-active={!dark} />
      </button>
    </Tooltip>
  );
}
