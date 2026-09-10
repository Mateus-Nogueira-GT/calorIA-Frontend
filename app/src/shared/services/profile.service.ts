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
  // R6: o backend sempre devolveu estes três (profileSchema em
  // users.schemas.ts); o tipo do app é que declarava só um subconjunto. São
  // eles que dizem se o onboarding foi concluído — sem altura/peso o backend
  // não calcula o gasto basal (jobs.service.ts) e nenhuma dieta é gerada.
  height_cm: number | null;
  weight_kg: number | null;
  goal: string | null;
}

/** Onboarding concluído? Sem estes três não existe dieta possível. */
export function isProfileComplete(profile: BackendProfile): boolean {
  return Boolean(profile.height_cm && profile.weight_kg && profile.goal);
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
    // R2: mesmo payload do scanner (pickImage: base64, 1024px, q0.8) e MAIS
    // trabalho de servidor por request — Storage + getPublicUrl + UPDATE do
    // perfil. Os 10s do API_TIMEOUT estouravam no aparelho e o usuário via
    // "Não foi possível enviar a foto". O scanner já tinha subido para 75s
    // pelo mesmo motivo; o avatar tinha ficado para trás.
    api
      .post<BackendProfile>('/users/me/avatar', { image }, { timeout: 75000 })
      .then((r) => r.data),

  /**
   * Exclui a conta permanentemente. Irreversível: o backend remove o usuário e,
   * por cascata, todos os dados. Não há logout depois — a sessão morre junto.
   */
  deleteAccount: () => api.delete<void>('/users/me').then(() => undefined),
};
