import { z } from 'zod'

// ─── Responses ────────────────────────────────────────────────────────────────

export const postAuthorSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable(),
  full_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
})

export const postTypeEnum = z.enum([
  'custom',
  'meal_completed',
  'streak_milestone',
  'challenge_joined',
  'diet_generated',
])

export const feedPostSchema = z.object({
  id: z.string().uuid(),
  type: postTypeEnum,
  content: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  likes_count: z.number().int(),
  comments_count: z.number().int(),
  liked_by_me: z.boolean(),
  created_at: z.string(),
  author: postAuthorSchema,
})

export const commentSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  created_at: z.string(),
  author: postAuthorSchema,
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Requests ─────────────────────────────────────────────────────────────────

export const createPostBodySchema = z.object({
  content: z.string().min(1).max(500),
})

export const createCommentBodySchema = z.object({
  content: z.string().min(1).max(500),
})

export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().optional(),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeedPost = z.infer<typeof feedPostSchema>
export type Comment = z.infer<typeof commentSchema>
export type CreatePostBody = z.infer<typeof createPostBodySchema>
export type CreateCommentBody = z.infer<typeof createCommentBodySchema>
export type PostType = z.infer<typeof postTypeEnum>
