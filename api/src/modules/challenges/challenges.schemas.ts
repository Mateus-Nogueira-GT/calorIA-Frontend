import { z } from 'zod'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const goalTypeEnum = z.enum(['streak', 'calories', 'meals_logged'])
export const challengeStatusEnum = z.enum(['draft', 'active', 'finished', 'cancelled'])
export const memberStatusEnum = z.enum(['invited', 'active', 'quit', 'disqualified'])

// ─── Responses ────────────────────────────────────────────────────────────────

export const challengeSchema = z.object({
  id: z.string().uuid(),
  creator_id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  rules: z.string().nullable(),
  goal_type: goalTypeEnum,
  target_value: z.number().int().nullable(),
  duration_days: z.number().int(),
  status: challengeStatusEnum,
  starts_at: z.string(),
  ends_at: z.string().nullable(),
  invite_code: z.string(),
  is_public: z.boolean(),
  max_members: z.number().int().nullable(),
  member_count: z.number().int(),
  created_at: z.string(),
})

export const challengeMemberSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  username: z.string().nullable(),
  full_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  status: memberStatusEnum,
  current_streak: z.number().int(),
  best_streak: z.number().int(),
  total_days: z.number().int(),
  last_check_in: z.string().nullable(),
})

export const challengeDetailSchema = challengeSchema.extend({
  members: z.array(challengeMemberSchema),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

// ─── Requests ─────────────────────────────────────────────────────────────────

export const createChallengeBodySchema = z.object({
  title: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  rules: z.string().max(1000).optional(),
  goal_type: goalTypeEnum.default('streak'),
  target_value: z.number().int().positive().optional(),
  duration_days: z.number().int().positive().max(365).default(30),
  is_public: z.boolean().default(false),
  max_members: z.number().int().positive().max(500).default(50),
})

export const joinChallengeBodySchema = z.object({
  invite_code: z.string().min(4).max(20),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export type Challenge = z.infer<typeof challengeSchema>
export type ChallengeMember = z.infer<typeof challengeMemberSchema>
export type ChallengeDetail = z.infer<typeof challengeDetailSchema>
export type CreateChallengeBody = z.infer<typeof createChallengeBodySchema>
export type JoinChallengeBody = z.infer<typeof joinChallengeBodySchema>
