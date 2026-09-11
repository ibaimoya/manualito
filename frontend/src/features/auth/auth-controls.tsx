import { type ParseKeys } from 'i18next';
import { type MouseEvent, type ReactNode, useCallback, useRef, useState } from 'react';
import { EyeIcon, EyeSlashIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Input, type InputProps } from '@/components/ui/input';
import i18n from '@/app/i18n';
import { cn } from '@/shared/lib/cn';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { PasswordMaskBurst } from './PasswordMaskBurst';
import { FieldFeedback } from './FieldFeedback';

type AuthKey = ParseKeys<'auth'>;

/** Ayuda de cliente; la política real de contraseña la valida el backend. */
export const MIN_PASSWORD = 12;

function hasWhitespace(value: string): boolean {
  for (const char of value) {
    if (char.trim().length === 0) return true;
  }
  return false;
}

/** Validación de email reutilizada por formulario y por el guard de envío. */
export function isEmail(value: string): boolean {
  const at = value.indexOf('@');
  if (value.length === 0 || hasWhitespace(value) || at <= 0 || at !== value.lastIndexOf('@')) {
    return false;
  }

  const domain = value.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}

/** Error del email: en vivo si ya hay texto, y siempre tras intentar enviar. */
export function emailFieldError(email: string, submitted: boolean): string | undefined {
  if (isEmail(email)) return undefined;
  return email.length > 0 || submitted
    ? i18n.t('validation.email.invalid', { ns: 'auth' })
    : undefined;
}

/** Error de longitud de contraseña; solo tras intentar enviar. */
export function passwordTooShortError(password: string, submitted: boolean): string | undefined {
  return submitted && password.length < MIN_PASSWORD
    ? i18n.t('validation.password.minimum', { ns: 'auth', count: MIN_PASSWORD })
    : undefined;
}

/** Error del campo "repite la contraseña": en vivo si no coincide, al enviar si falta. */
function confirmPasswordError(
  confirm: string,
  password: string,
  submitted: boolean,
): string | undefined {
  if (confirm.length > 0 && confirm !== password) {
    return i18n.t('validation.confirmPassword.mismatch', { ns: 'auth' });
  }
  const matches = confirm.length > 0 && confirm === password;
  if (submitted && !matches) return i18n.t('validation.confirmPassword.required', { ns: 'auth' });
  return undefined;
}

/** "aria-invalid" solo cuando hay error (evita renderizar "aria-invalid="false""). */
export function ariaInvalid(hasError: boolean): true | undefined {
  return hasError || undefined;
}

/** Campo de formulario: label + control + error/éxito inline. */
export function AuthField({
  label,
  htmlFor,
  hint,
  error,
  success,
  children,
}: Readonly<{
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  success?: string;
  children: ReactNode;
}>) {
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="font-body text-sm font-semibold text-fg">
          {label}
        </label>
        {hint ? <span className="text-xs font-normal text-fg-3">{hint}</span> : null}
      </div>
      {children}
      <FieldFeedback id={`${htmlFor}-feedback`} error={error} success={success} />
    </div>
  );
}

/** Input de contraseña con botón mostrar/ocultar (target 44px). */
export function PasswordInput({
  className,
  ...props
}: Readonly<Omit<InputProps, 'type' | 'preset'>>) {
  const { t } = useTranslation('auth');
  const [reveal, setReveal] = useState(false);
  const [burst, setBurst] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const stopBurst = useCallback(() => setBurst(false), []);

  function toggleVisibility(event: MouseEvent<HTMLButtonElement>) {
    setBurst(
      reveal && event.detail > 0 && !reducedMotion && Boolean(inputRef.current?.value.length),
    );
    setReveal(!reveal);
  }

  return (
    <div
      className="relative"
      onInputCapture={stopBurst}
      onPointerDownCapture={stopBurst}
      onScrollCapture={stopBurst}
    >
      <Input
        ref={inputRef}
        type={reveal ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn('pr-11', className)}
        {...props}
      />
      {burst && (
        <PasswordMaskBurst
          inputRef={inputRef}
          reducedMotion={reducedMotion}
          onComplete={stopBurst}
        />
      )}
      <button
        type="button"
        onClick={toggleVisibility}
        aria-label={reveal ? t('aria.hidePassword') : t('aria.showPassword')}
        aria-pressed={reveal}
        data-active={reveal}
        className="state-icon absolute right-0 top-1/2 size-11 -translate-y-1/2 rounded-full text-fg-3 hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <EyeIcon size={18} aria-hidden="true" />
        <EyeSlashIcon size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Par de campos para estrenar contraseña: nueva con medidor + confirmación. */
export function NewPasswordFields({
  fieldId,
  label,
  password,
  confirm,
  submitted,
  onPasswordChange,
  onConfirmChange,
}: Readonly<{
  fieldId: string;
  label?: string;
  password: string;
  confirm: string;
  submitted: boolean;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
}>) {
  const { t } = useTranslation('auth');
  const passwordError = passwordTooShortError(password, submitted);
  const confirmError = confirmPasswordError(confirm, password, submitted);
  const passwordShort = submitted && password.length < MIN_PASSWORD;
  return (
    <>
      <AuthField
        label={label ?? t('fields.password.default')}
        htmlFor={`${fieldId}-pw`}
        hint={passwordError ? undefined : t('validation.password.minimum', { count: MIN_PASSWORD })}
        error={passwordError}
      >
        <PasswordInput
          id={`${fieldId}-pw`}
          autoComplete="new-password"
          placeholder={t('placeholders.newPassword')}
          value={password}
          aria-invalid={ariaInvalid(passwordShort)}
          aria-describedby={passwordError ? `${fieldId}-pw-feedback` : undefined}
          onChange={(event) => onPasswordChange(event.target.value)}
          required
        />
        {password ? <PasswordStrength score={passwordScore(password)} /> : null}
      </AuthField>

      <AuthField
        label={t('fields.password.confirm')}
        htmlFor={`${fieldId}-pw2`}
        error={confirmError}
      >
        <PasswordInput
          id={`${fieldId}-pw2`}
          autoComplete="new-password"
          placeholder={t('placeholders.repeatPassword')}
          value={confirm}
          aria-invalid={ariaInvalid(Boolean(confirmError))}
          aria-describedby={confirmError ? `${fieldId}-pw2-feedback` : undefined}
          onChange={(event) => onConfirmChange(event.target.value)}
          required
        />
      </AuthField>
    </>
  );
}

const STRENGTH = [
  { label: 'validation.password.strength.empty', text: 'text-fg-3', bar: 'bg-surface-2' },
  { label: 'validation.password.strength.weak', text: 'text-error', bar: 'bg-error' },
  {
    label: 'validation.password.strength.improvable',
    text: 'text-warning',
    bar: 'bg-warning',
  },
  {
    label: 'validation.password.strength.good',
    text: 'text-[#6F9A1E]',
    bar: 'bg-[#6F9A1E]',
  },
  { label: 'validation.password.strength.strong', text: 'text-success', bar: 'bg-success' },
] as const satisfies ReadonlyArray<{ label: AuthKey; text: string; bar: string }>;

type StrengthScore = 0 | 1 | 2 | 3 | 4;

/** Puntuación orientativa (longitud + variedad), 0–4. No es validación dura. */
function passwordScore(value: string): StrengthScore {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/\d/.test(value) && /[a-zA-Z]/.test(value)) score += 1;
  if (/[^a-zA-Z0-9]/.test(value)) score += 1;
  // Cualquier contraseña no vacía es al menos "Débil".
  return Math.max(1, Math.min(score, 4)) as StrengthScore;
}

/** Medidor de fuerza: barras + adjetivo (contexto en sr-only para lectores). */
function PasswordStrength({ score }: Readonly<{ score: StrengthScore }>) {
  const { t } = useTranslation('auth');
  const meta = STRENGTH[score];
  return (
    <div className="mt-3">
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((bar) => (
          <span
            key={bar}
            className={cn('h-1.5 flex-1 rounded-full', bar <= score ? meta.bar : 'bg-surface-2')}
          />
        ))}
      </div>
      <p className={cn('mt-1.5 text-xs font-bold', meta.text)}>
        <span className="sr-only">
          {t('validation.password.strength.screenReader', { label: t(meta.label) })}
        </span>
        {t(meta.label)}
      </p>
    </div>
  );
}
