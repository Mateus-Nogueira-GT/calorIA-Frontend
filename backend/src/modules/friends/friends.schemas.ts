import { z } from 'zod'

// ─── Responses ────────────────────────────────────────────────────────────────

export const friendProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().nullable(),
  full_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
})

export const friendSchema = friendProfileSchema.extend({
  friendship_id: z.string().uuid(),
  current_streak: z.number().int().nullable(),
})

export const friendRequestSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'accepted', 'blocked']),
  created_at: z.string(),
  user: friendProfileSchema,
})

export const userSearchResultSchema = friendProfileSchema.extend({
  relationship: z.enum(['none', 'pending_sent', 'pending_received', 'friends']),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Requests ─────────────────────────────────────────────────────────────────

export const searchUsersQuerySchema = z.object({
  query: z.string().min(2).max(50),
})

export const sendFriendRequestBodySchema = z.object({
  username: z.string().min(2).max(50),
})

export const respondFriendRequestBodySchema = z.object({
  action: z.enum(['accept', 'reject']),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type Friend = z.infer<typeof friendSchema>
export type FriendRequest = z.infer<typeof friendRequestSchema>
export type UserSearchResult = z.infer<typeof userSearchResultSchema>
export type SendFriendRequestBody = z.infer<typeof sendFriendRequestBodySchema>
export type RespondFriendRequestBody = z.infer<typeof respondFriendRequestBodySchema>
