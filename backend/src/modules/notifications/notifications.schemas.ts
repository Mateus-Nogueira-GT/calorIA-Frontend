import { z } from 'zod'

export const notificationTypeEnum = z.enum([
  'like',
  'comment',
  'challenge_invite',
  'challenge_rank',
])

// Espelha o PostAuthor do frontend ({ id, name, avatarEmoji? }).
export const notificationActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarEmoji: z.string().optional(),
})

export const appNotificationSchema = z.object({
  id: z.string().uuid(),
  type: notificationTypeEnum,
  actor: notificationActorSchema,
  message: z.string(),
  targetId: z.string().nullable(),
  read: z.boolean(),
  createdAt: z.string(),
})

export const notificationsResponseSchema = z.object({
  items: z.array(appNotificationSchema),
  unreadCount: z.number().int(),
})

export const markReadBodySchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
})

export const markReadResponseSchema = z.object({
  unreadCount: z.number().int(),
})

export const errorSchema = z.object({
  error: z.string(),
  message: z.string(),
})

export type NotificationType = z.infer<typeof notificationTypeEnum>
export type AppNotification = z.infer<typeof appNotificationSchema>
