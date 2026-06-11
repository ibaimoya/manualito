import { JSON_HEADERS, TIMEOUT, request, requestVoid } from './http';

/**
 * Cliente de autenticación. register/login dejan sesión iniciada (autologin) y
 * devuelven `AuthResponse`; verify/resend/forgot/reset son flujos anónimos con
 * respuesta uniforme (`{ detail }`).
 */

export type AvatarColor = 'primary' | 'accent' | 'contrast' | 'success' | 'warning';

export type AvatarFigure =
  | 'initials'
  | 'meeple'
  | 'dice'
  | 'crown'
  | 'flag'
  | 'sparkle'
  | 'book'
  | 'bulb'
  | 'zap'
  | 'hourglass'
  | 'trophy'
  | 'puzzle'
  | 'swords'
  | 'ghost'
  | 'shield'
  | 'rocket';

/** Usuario público tal y como lo expone la API (`UserPublic`). */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  /** `null` ⇒ email sin verificar (dispara el banner soft). */
  email_verified_at: string | null;
  avatar_color: AvatarColor | null;
  avatar_figure: AvatarFigure | null;
}

export interface AuthResponse {
  user: AuthUser;
  csrf_token: string;
}

export interface AuthMessageResponse {
  detail: string;
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}


export const authApi = {
  /** POST /api/auth/register — crea cuenta y deja sesión iniciada (autologin). */
  async register(input: RegisterInput, signal?: AbortSignal): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.AUTH,
      signal,
    });
  },

  /** POST /api/auth/login — inicia sesión con email o username. */
  async login(input: LoginInput, signal?: AbortSignal): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.AUTH,
      signal,
    });
  },

  /** GET /api/me — usuario actual + token CSRF. Lanza 401 si no hay sesión. */
  async me(signal?: AbortSignal): Promise<AuthResponse> {
    return request<AuthResponse>('/me', {
      method: 'GET',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** POST /api/auth/logout — revoca la sesión actual (204, requiere CSRF). */
  async logout(signal?: AbortSignal): Promise<void> {
    await requestVoid('/auth/logout', {
      method: 'POST',
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** POST /api/auth/email/verify — verifica el email con token opaco. */
  async verifyEmail(token: string, signal?: AbortSignal): Promise<AuthMessageResponse> {
    return request<AuthMessageResponse>('/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** POST /api/auth/email/resend — reenvía verificación (respuesta uniforme). */
  async resendVerification(email: string, signal?: AbortSignal): Promise<AuthMessageResponse> {
    return request<AuthMessageResponse>('/auth/email/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** POST /api/auth/password/forgot — inicia reset (respuesta uniforme). */
  async forgotPassword(email: string, signal?: AbortSignal): Promise<AuthMessageResponse> {
    return request<AuthMessageResponse>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },

  /** POST /api/auth/password/reset — restablece con token de un solo uso. */
  async resetPassword(
    input: ResetPasswordInput,
    signal?: AbortSignal,
  ): Promise<AuthMessageResponse> {
    return request<AuthMessageResponse>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: JSON_HEADERS,
      timeoutMs: TIMEOUT.QUICK,
      signal,
    });
  },
};
