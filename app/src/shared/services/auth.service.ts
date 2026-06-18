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

  register: (data: RegisterPayload) =>
    api.post<BackendAuthResponse>('/auth/register', data).then((r) => toAuthResponse(r.data)),

  refresh: (refreshToken: string) =>
    api
      .post<BackendAuthResponse>('/auth/refresh', { refresh_token: refreshToken })
      .then((r) => toAuthResponse(r.data)),

  loginWithGoogle: (idToken: string) =>
    api.post<AuthResponse>('/auth/google', { idToken }).then((r) => r.data),

  loginWithApple: (identityToken: string, fullName?: string) =>
    api.post<AuthResponse>('/auth/apple', { identityToken, fullName }).then((r) => r.data),

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
      })
      .then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),
};
