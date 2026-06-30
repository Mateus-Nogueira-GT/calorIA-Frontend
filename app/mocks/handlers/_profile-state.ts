// Estado de perfil compartilhado entre os handlers MSW de `users` e `feed`,
// para que, no preview/web, os posts do próprio usuário reflitam nome e foto.

export interface MockProfile {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  avatar_emoji: string | null;
}

export interface MockAuthor {
  id: string;
  name: string;
  avatarEmoji?: string | null;
  avatarUrl?: string | null;
}

export const myProfile: MockProfile = {
  id: 'me',
  username: 'voce',
  full_name: 'Você',
  avatar_url: null,
  avatar_emoji: '😎',
};

/** Autor (contrato do feed) derivado do perfil atual. */
export function meAuthor(): MockAuthor {
  return {
    id: myProfile.id,
    name: myProfile.full_name ?? 'Você',
    avatarEmoji: myProfile.avatar_emoji,
    avatarUrl: myProfile.avatar_url,
  };
}
