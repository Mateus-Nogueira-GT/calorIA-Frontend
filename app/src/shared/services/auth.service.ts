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
  user: {
    id: string;
    name: string;
    email: string;
    goal?: string | null;
    coachPersonality?: ProfileSetupPayload['coachPersonality'] | null;
  };
}

export const authService = {
  login: (data: LoginPayload) =>
    api.post<AuthResponse>('/auth/login', data).then((r) => r.data),

  register: (data: RegisterPayload) =>
    api.post<AuthResponse>('/auth/register', data).then((r) => r.data),

  loginWithGoogle: (idToken: string) =>
    api.post<AuthResponse>('/auth/google', { idToken }).then((r) => r.data),

  loginWithApple: (identityToken: string, fullName?: string) =>
    api.post<AuthResponse>('/auth/apple', { identityToken, fullName }).then((r) => r.data),

  profileSetup: (data: ProfileSetupPayload) =>
    api.patch('/auth/profile-setup', data).then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),
};
