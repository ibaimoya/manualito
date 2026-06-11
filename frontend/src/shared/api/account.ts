import { JSON_HEADERS, TIMEOUT, request, requestVoid } from './http';
import type { AuthMessageResponse, AuthResponse, AvatarColor, AvatarFigure } from './auth';

/**
 * Cliente de cuenta y perfil: identidad editable, contadores de actividad,
 * cambio de contraseña y borrado de cuenta con confirmación.
 */

export interface AccountStats {
  games_count: number;
  conversations_count: number;
  manuals_count: number;
}

export interface UpdateProfileInput {
  username?: string;
  /** Cambiar el email invalida la verificación: el backend reenvía el enlace. */
  email?: string;
  avatar_color?: AvatarColor;
  avatar_figure?: AvatarFigure;
}

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}


export const accountApi = {
  /** GET /api/me/stats — juegos, conversaciones y manuales del usuario. */
  async stats(signal?: AbortSignal): Promise<AccountStats> {
    return request<AccountStats>('/me/stats', {
      method: 'GET',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** PATCH /api/me — edita identidad; devuelve el usuario actualizado. */
  async updateProfile(input: UpdateProfileInput, signal?: AbortSignal): Promise<AuthResponse> {
    return request<AuthResponse>('/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** POST /api/me/password — cambia la contraseña verificando la actual. */
  async changePassword(
    input: ChangePasswordInput,
    signal?: AbortSignal,
  ): Promise<AuthMessageResponse> {
    return request<AuthMessageResponse>('/me/password', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.AUTH,
      signal,
    });
  },

  /** DELETE /api/me — borra la cuenta confirmando el propio @usuario (204). */
  async deleteAccount(username: string, signal?: AbortSignal): Promise<void> {
    await requestVoid('/me', {
      method: 'DELETE',
      body: JSON.stringify({ username }),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },
};
