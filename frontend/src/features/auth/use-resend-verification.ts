import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { authApi } from '@/shared/api/auth';

const RESEND_COOLDOWN_SECONDS = 45;

/**
 * Reenvío del email de verificación con cuenta atrás anti-spam. Compartido
 * por el banner soft y el sello del perfil para que apliquen el mismo límite.
 */
export function useResendVerification(email: string) {
  const [cooldown, setCooldown] = useState(0);
  const resend = useMutation({
    mutationFn: () => authApi.resendVerification(email),
    onSuccess: () => setCooldown(RESEND_COOLDOWN_SECONDS),
  });

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  return { cooldown, resend };
}
