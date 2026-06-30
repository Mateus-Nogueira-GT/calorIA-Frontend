import { z } from 'zod'

// ─── Enums ──────────────────────────────────────────────────────────────────

export const postTypeEnum = z.enum([
  'custom',
  'meal_completed',
  'streak_milestone',
  'challenge_joined',
  'diet_generated',
])

export const achievementTypeEnum = z.enum(['meal_logged', 'diet_completed', 'streak'])

// ─── Responses (camelCase — contrato com o frontend) ────────────────────────

export const postAuthorSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarEmoji: z.string().nullable().optional(),
  avatarUrl: z.string().nullable().optional(),
})

export const postAchievementSchema = z.object({
  type: achievementTypeEnum,
  emoji: z.string(),
  title: z.string(),
  subtitle: z.string(),
})

export const postSchema = z.object({
  id: z.string().uuid(),
  author: postAuthorSchema,
  content: z.string(),
  achievement: postAchievementSchema.nullable(),
  likeCount: z.number().int(),
  commentCount: z.number().int(),
  likedByMe: z.boolean(),
  createdAt: z.string(),
})

export const feedPageSchema = z.object({
  posts: z.array(postSchema),
  nextCursor: z.string().nullable(),
})

export const commentSchema = z.object({
  id: z.string().uuid(),
  postId: z.string().uuid(),
  author: postAuthorSchema,
  content: z.string(),
  createdAt: z.string(),
})

export const likeResultSchema = z.object({
  likeCount: z.number().int(),
  likedByMe: z.boolean(),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Requests ─────────────────────────────────────────────────────────────────

export const createPostBodySchema = z.object({
  content: z.string().min(1).max(500),
  achievement: postAchievementSchema.optional(),
})

export const createCommentBodySchema = z.object({
  content: z.string().min(1).max(500),
})

export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().optional(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type PostType = z.infer<typeof postTypeEnum>
export type Post = z.infer<typeof postSchema>
export type PostAchievement = z.infer<typeof postAchievementSchema>
export type Comment = z.infer<typeof commentSchema>
export type LikeResult = z.infer<typeof likeResultSchema>
export type CreatePostBody = z.infer<typeof createPostBodySchema>
