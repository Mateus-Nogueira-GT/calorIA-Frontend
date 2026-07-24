import api from './api';

/** Perfil como o backend retorna (snake_case). Apenas os campos usados no app. */
export interface BackendProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  avatar_emoji: string | null;
  /** Streak canônico (tabela streaks) — o app não recalcula localmente. */
  current_streak: number | null;
}

export interface UpdateProfileInput {
  full_name?: string;
  avatar_emoji?: string | null;
  avatar_url?: string | null;
}

export const profileService = {
  getMe: () => api.get<BackendProfile>('/users/me').then((r) => r.data),

  updateProfile: (input: UpdateProfileInput) =>
    api.put<BackendProfile>('/users/me/profile', input).then((r) => r.data),

  /** Envia a foto (data URL base64) e retorna o perfil com a nova avatar_url. */
  uploadAvatar: (image: string) =>
    api.post<BackendProfile>('/users/me/avatar', { image }).then((r) => r.data),
};
