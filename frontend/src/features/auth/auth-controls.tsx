import { type ReactNode, useState } from 'react';
import { AlertTriangle, Check, Eye, EyeOff } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/shared/lib/cn';

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
  return email.length > 0 || submitted ? 'Ese email no parece válido' : undefined;
}

/** Error de longitud de contraseña; solo tras intentar enviar. */
export function passwordTooShortError(password: string, submitted: boolean): string | undefined {
  return submitted && password.length < MIN_PASSWORD
    ? `Mínimo ${MIN_PASSWORD} caracteres`
    : undefined;
}

/** Error del campo "repite la contraseña": en vivo si no coincide, al enviar si falta. */
export function confirmPasswordError(
  confirm: string,
  password: string,
  submitted: boolean,
): string | undefined {
  if (confirm.length > 0 && confirm !== password) return 'Las contraseñas no coinciden';
  const matches = confirm.length > 0 && confirm === password;
  if (submitted && !matches) return 'Repite la contraseña';
  return undefined;
}

/** `aria-invalid` solo cuando hay error (evita renderizar `aria-invalid="false"`). */
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
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-error">
          <AlertTriangle size={13} strokeWidth={2.2} aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {!error && success ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-success">
          <Check size={13} strokeWidth={2.5} aria-hidden="true" />
          {success}
        </p>
      ) : null}
    </div>
  );
}

/** Input de contraseña con botón mostrar/ocultar (target 44px). */
export function PasswordInput({
  invalid,
  className,
  ...props
}: Readonly<Omit<InputProps, 'type' | 'preset'> & { invalid?: boolean }>) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative">
      <Input
        type={reveal ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn('pr-11', invalid && 'border-error focus-visible:ring-error/20', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setReveal((value) => !value)}
        aria-label={reveal ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-fg-3 hover:text-fg-2"
      >
        {reveal ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  );
}

/** Par de campos para estrenar contraseña: nueva con medidor + confirmación. */
export function NewPasswordFields({
  fieldId,
  label = 'Contraseña',
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
  const passwordError = passwordTooShortError(password, submitted);
  const confirmError = confirmPasswordError(confirm, password, submitted);
  const passwordShort = submitted && password.length < MIN_PASSWORD;
  return (
    <>
      <AuthField
        label={label}
        htmlFor={`${fieldId}-pw`}
        hint={passwordError ? undefined : `Mínimo ${MIN_PASSWORD} caracteres`}
        error={passwordError}
      >
        <PasswordInput
          id={`${fieldId}-pw`}
          autoComplete="new-password"
          placeholder="Crea una contraseña"
          value={password}
          invalid={passwordShort}
          aria-invalid={ariaInvalid(passwordShort)}
          onChange={(event) => onPasswordChange(event.target.value)}
          required
        />
        {password ? <PasswordStrength score={passwordScore(password)} /> : null}
      </AuthField>

      <AuthField label="Repite la contraseña" htmlFor={`${fieldId}-pw2`} error={confirmError}>
        <PasswordInput
          id={`${fieldId}-pw2`}
          autoComplete="new-password"
          placeholder="Repite la contraseña"
          value={confirm}
          invalid={Boolean(confirmError)}
          aria-invalid={ariaInvalid(Boolean(confirmError))}
          onChange={(event) => onConfirmChange(event.target.value)}
          required
        />
      </AuthField>
    </>
  );
}

const STRENGTH = [
  { label: '—', text: 'text-fg-3', bar: 'bg-surface-2' },
  { label: 'Débil', text: 'text-error', bar: 'bg-error' },
  { label: 'Mejorable', text: 'text-warning', bar: 'bg-warning' },
  { label: 'Buena', text: 'text-[#6F9A1E]', bar: 'bg-[#6F9A1E]' },
  { label: 'Fuerte', text: 'text-success', bar: 'bg-success' },
] as const;

type StrengthScore = 0 | 1 | 2 | 3 | 4;

/** Puntuación orientativa (longitud + variedad), 0–4. No es validación dura. */
export function passwordScore(value: string): StrengthScore {
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
export function PasswordStrength({ score }: Readonly<{ score: StrengthScore }>) {
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
        <span className="sr-only">Seguridad de la contraseña: </span>
        {meta.label}
      </p>
    </div>
  );
}
