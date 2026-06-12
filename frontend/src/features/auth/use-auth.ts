import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { authApi, type AuthResponse, type LoginInput, type RegisterInput } from '@/shared/api/auth';
import { AUTH_ME_KEY, dropSessionCaches, meQueryOptions } from './auth-queries';

/** Sesión actual leída de la cache (la resuelve el `beforeLoad` raíz). */
export function useAuth() {
  const { data } = useQuery(meQueryOptions());
  return { user: data?.user ?? null, isAuthenticated: data?.user != null };
}

/**
 * Login y registro comparten efecto: cachear la sesión. No invalidamos el
 * router porque la pantalla navega a continuación y el `beforeLoad` raíz vuelve
 * a leer esta cache ya actualizada.
 */
function useEnterSession<TInput>(mutationFn: (input: TInput) => Promise<AuthResponse>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(AUTH_ME_KEY, data);
    },
  });
}

export function useLogin() {
  return useEnterSession((input: LoginInput) => authApi.login(input));
}

/** El registro deja sesión iniciada en backend (autologin), igual que login. */
export function useRegister() {
  return useEnterSession((input: RegisterInput) => authApi.register(input));
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: async () => {
      await dropSessionCaches(queryClient);
      // Seguimos en una ruta protegida: revalidar echa al usuario al login.
      await router.invalidate();
    },
  });
}
