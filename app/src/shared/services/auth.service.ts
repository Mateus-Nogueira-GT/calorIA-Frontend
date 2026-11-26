import api from './api';

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
}

export interface ProfileSetupPayload {
  name: string;
  bodyType: 'ectomorph' | 'mesomorph' | 'endomorph' | 'unknown';
  heightCm: number;
  weightKg: number;
  goal: string;
  coachPersonality: 'motivational' | 'direct' | 'empathetic' | 'scientific';
  coachGender: 'male' | 'female' | 'neutral';
  /** Sexo do próprio usuário — não confundir com `coachGender`. */
  sex: 'male' | 'female';
  age: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    goal?: string | null;
    coachPersonality?: ProfileSetupPayload['coachPersonality'] | null;
  };
}

interface BackendAuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

/**
 * A4: com AUTH_REQUIRE_EMAIL_CONFIRMATION ligada no backend, o cadastro não
 * devolve sessão. A conta só entra depois de confirmar o e-mail.
 */
export interface ConfirmationRequired {
  status: 'confirmation_required';
  email: string;
}

export type RegisterResult = AuthResponse | ConfirmationRequired;

export function isConfirmationRequired(
  result: RegisterResult | null | undefined,
): result is ConfirmationRequired {
  return (result as ConfirmationRequired | null | undefined)?.status === 'confirmation_required';
}

function toAuthResponse(data: BackendAuthResponse): AuthResponse {
  return {
    token: data.access_token,
    refreshToken: data.refresh_token,
    user: {
      id: data.user.id,
      name: data.user.name ?? '',
      email: data.user.email,
    },
  };
}

export const authService = {
  login: (data: LoginPayload) =>
    api.post<BackendAuthResponse>('/auth/login', data).then((r) => toAuthResponse(r.data)),

  register: (data: RegisterPayload): Promise<RegisterResult> =>
    api
      .post<BackendAuthResponse | ConfirmationRequired>('/auth/register', data)
      .then((r) =>
        isConfirmationRequired(r.data as RegisterResult)
          ? { status: 'confirmation_required' as const, email: (r.data as ConfirmationRequired).email }
          : toAuthResponse(r.data as BackendAuthResponse),
      ),

  /** Reenvia o e-mail de confirmação do cadastro. O backend sempre responde sucesso. */
  resendConfirmation: (email: string) =>
    api
      .post<{ success: boolean }>('/auth/resend-confirmation', { email })
      .then((r) => r.data),

  refresh: (refreshToken: string) =>
    api
      .post<BackendAuthResponse>('/auth/refresh', { refresh_token: refreshToken })
      .then((r) => toAuthResponse(r.data)),

  loginWithGoogle: (idToken: string) =>
    api.post<BackendAuthResponse>('/auth/google', { idToken }).then((r) => toAuthResponse(r.data)),

  loginWithApple: (identityToken: string, fullName?: string, nonce?: string) =>
    api
      .post<BackendAuthResponse>('/auth/apple', { identityToken, fullName, nonce })
      .then((r) => toAuthResponse(r.data)),

  profileSetup: (data: ProfileSetupPayload) =>
    api
      .put('/users/me/profile', {
        full_name: data.name,
        height_cm: data.heightCm,
        weight_kg: data.weightKg,
        goal: data.goal,
        body_type: data.bodyType,
        coach_personality: data.coachPersonality,
        coach_gender: data.coachGender,
        gender: data.sex,
        // Só a idade é perguntada. Com 1º de janeiro, o aniversário deste ano
        // já passou em qualquer dia do ano corrente, então a idade que o
        // backend calcula a partir da data é igual à informada o ano todo.
        // O ano é o de UTC, o calendário em que o backend conta a idade.
        birth_date: `${new Date().getUTCFullYear() - data.age}-01-01`,
        activity_level: data.activityLevel,
      })
      .then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),

  /** Envia o email de recuperação. O backend sempre responde sucesso. */
  forgotPassword: (email: string) =>
    api.post<{ success: boolean }>('/auth/forgot-password', { email }).then((r) => r.data),

  /** Redefine a senha com o access_token de recovery do link do email. */
  resetPassword: (accessToken: string, newPassword: string) =>
    api
      .post<{ success: boolean }>('/auth/reset-password', {
        access_token: accessToken,
        new_password: newPassword,
      })
      .then((r) => r.data),
};
