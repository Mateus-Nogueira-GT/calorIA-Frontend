import { http, HttpResponse } from 'msw';
import { meAuthor } from './_profile-state';

interface PostAuthor {
  id: string;
  name: string;
  avatarEmoji?: string | null;
  avatarUrl?: string | null;
}
interface Comment {
  id: string;
  postId: string;
  author: PostAuthor;
  content: string;
  createdAt: string;
}
interface Post {
  id: string;
  author: PostAuthor;
  content: string;
  achievement: { type: string; emoji: string; title: string; subtitle: string } | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
}

const ana: PostAuthor = { id: 'u1', name: 'Ana Souza', avatarEmoji: '🦊' };
const bruno: PostAuthor = { id: 'u2', name: 'Bruno Lima', avatarEmoji: '🐻' };

let posts: Post[] = [
  {
    id: 'p1',
    author: ana,
    content: 'Fechei a dieta de hoje certinho! 💪',
    achievement: { type: 'diet_completed', emoji: '🍽️', title: 'Dieta concluída', subtitle: '4 de 4 refeições · 1.850 kcal' },
    likeCount: 12,
    commentCount: 1,
    likedByMe: false,
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
  },
  {
    id: 'p2',
    author: bruno,
    content: '7 dias seguidos registrando tudo. Bora!',
    achievement: { type: 'streak', emoji: '🔥', title: 'Sequência de 7 dias', subtitle: '7 dias seguidos' },
    likeCount: 5,
    commentCount: 0,
    likedByMe: true,
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
  },
];

const commentsByPost: Record<string, Comment[]> = {
  p1: [{ id: 'c1', postId: 'p1', author: bruno, content: 'Mandou bem! 👏', createdAt: new Date(Date.now() - 1800_000).toISOString() }],
};

let seq = 100;
const nextId = (prefix: string) => `${prefix}-${seq++}`;

export const feedHandlers = [
  http.get('*/feed', ({ request }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = Number(url.searchParams.get('limit') ?? '10');
    const start = cursor ? Number(cursor) : 0;
    const slice = posts.slice(start, start + limit);
    const nextStart = start + limit;
    return HttpResponse.json({
      posts: slice,
      nextCursor: nextStart < posts.length ? String(nextStart) : null,
    });
  }),

  http.post('*/posts', async ({ request }) => {
    const body = (await request.json()) as { content: string; achievement?: Post['achievement'] };
    const created: Post = {
      id: nextId('p'),
      author: meAuthor(),
      content: body.content,
      achievement: body.achievement ?? null,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      createdAt: new Date().toISOString(),
    };
    posts = [created, ...posts];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post('*/posts/:id/like', ({ params }) => {
    const post = posts.find((p) => p.id === params.id);
    if (!post) return new HttpResponse(null, { status: 404 });
    post.likedByMe = true;
    post.likeCount += 1;
    return HttpResponse.json({ likeCount: post.likeCount, likedByMe: true });
  }),

  http.delete('*/posts/:id/like', ({ params }) => {
    const post = posts.find((p) => p.id === params.id);
    if (!post) return new HttpResponse(null, { status: 404 });
    post.likedByMe = false;
    post.likeCount = Math.max(0, post.likeCount - 1);
    return HttpResponse.json({ likeCount: post.likeCount, likedByMe: false });
  }),

  http.get('*/posts/:id/comments', ({ params }) => {
    return HttpResponse.json(commentsByPost[params.id as string] ?? []);
  }),

  http.post('*/posts/:id/comments', async ({ params, request }) => {
    const postId = params.id as string;
    const body = (await request.json()) as { content: string };
    const comment: Comment = {
      id: nextId('c'),
      postId,
      author: meAuthor(),
      content: body.content,
      createdAt: new Date().toISOString(),
    };
    commentsByPost[postId] = [...(commentsByPost[postId] ?? []), comment];
    const post = posts.find((p) => p.id === postId);
    if (post) post.commentCount += 1;
    return HttpResponse.json(comment, { status: 201 });
  }),
];
