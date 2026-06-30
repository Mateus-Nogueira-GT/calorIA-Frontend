import { http, HttpResponse } from 'msw';
import { myProfile } from './_profile-state';

export const usersHandlers = [
  http.get('*/users/me', () => HttpResponse.json(myProfile)),

  http.put('*/users/me/profile', async ({ request }) => {
    const body = (await request.json()) as Partial<{
      full_name: string;
      avatar_emoji: string | null;
      avatar_url: string | null;
    }>;
    if (body.full_name !== undefined) myProfile.full_name = body.full_name;
    if (body.avatar_emoji !== undefined) myProfile.avatar_emoji = body.avatar_emoji;
    if (body.avatar_url !== undefined) myProfile.avatar_url = body.avatar_url;
    return HttpResponse.json(myProfile);
  }),

  http.post('*/users/me/avatar', async ({ request }) => {
    const body = (await request.json()) as { image: string };
    // No preview usamos o próprio data URL como avatar_url (funciona como source de imagem).
    myProfile.avatar_url = body.image;
    return HttpResponse.json(myProfile);
  }),
];
