import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/shared/api/auth';

const RESEND_COOLDOWN_SECONDS = 45;

// Deadline a nivel de módulo: banner y perfil cuentan el mismo límite.
let cooldownUntil = 0;
const subscribers = new Set<() => void>();

function startCooldown(): void {
  cooldownUntil = Date.now() + RESEND_COOLDOWN_SECONDS * 1000;
  for (const notify of subscribers) notify();
}

function remainingSeconds(): number {
  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

/** Limpia el límite (al cerrar sesión: no aplica a la cuenta entrante). */
export function resetResendCooldown(): void {
  cooldownUntil = 0;
  for (const notify of subscribers) notify();
}

/**
 * Reenvío del email de verificación con cuenta atrás anti-spam compartida:
 * lanzarlo desde el banner también bloquea el botón del perfil, y viceversa.
 */
export function useResendVerification(email: string) {
  const [cooldown, setCooldown] = useState(remainingSeconds);
  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(email),
    onSuccess: startCooldown,
  });

  useEffect(() => {
    const refresh = () => setCooldown(remainingSeconds());
    subscribers.add(refresh);
    return () => {
      subscribers.delete(refresh);
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(remainingSeconds()), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return { cooldown, resend };
}
