import api from './api';

export type AchievementType = 'meal_logged' | 'diet_completed' | 'streak';

export interface PostAuthor {
  id: string;
  name: string;
  avatarEmoji?: string;
}

export interface PostAchievement {
  type: AchievementType;
  emoji: string;
  title: string;
  subtitle: string;
}

export interface Post {
  id: string;
  author: PostAuthor;
  content: string;
  achievement: PostAchievement | null;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  author: PostAuthor;
  content: string;
  createdAt: string;
}

export interface FeedPage {
  posts: Post[];
  nextCursor: string | null;
}

export interface LikeResult {
  likeCount: number;
  likedByMe: boolean;
}

export const feedService = {
  getFeed: (cursor?: string, limit = 10) =>
    api.get<FeedPage>('/feed', { params: { cursor, limit } }).then((r) => r.data),
  createPost: (input: { content: string; achievement?: PostAchievement }) =>
    api.post<Post>('/posts', input).then((r) => r.data),
  like: (postId: string) => api.post<LikeResult>(`/posts/${postId}/like`).then((r) => r.data),
  unlike: (postId: string) => api.delete<LikeResult>(`/posts/${postId}/like`).then((r) => r.data),
  getComments: (postId: string) =>
    api.get<Comment[]>(`/posts/${postId}/comments`).then((r) => r.data),
  addComment: (postId: string, content: string) =>
    api.post<Comment>(`/posts/${postId}/comments`, { content }).then((r) => r.data),
};
