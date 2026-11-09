import { z } from 'zod'

export const CYCLES = ['MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY'] as const
export const cycleSchema = z.enum(CYCLES)
export type Cycle = z.infer<typeof cycleSchema>

const planFields = {
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullable(),
  price_cents: z.number().int().min(100).max(1_000_000),
  cycle: cycleSchema,
  credits_per_cycle: z.number().int().min(1).max(100_000).nullable(),
  unlimited: z.boolean(),
  active: z.boolean(),
  sort_order: z.number().int().min(0).max(1000),
}

export const createPlanBodySchema = z
  .object({
    code: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,39}$/, 'Use letras minúsculas, dígitos, - ou _'),
    ...planFields,
    description: planFields.description.optional(),
    credits_per_cycle: planFields.credits_per_cycle.optional(),
    unlimited: planFields.unlimited.default(false),
    active: planFields.active.default(true),
    sort_order: planFields.sort_order.default(0),
  })
  .refine((p) => p.unlimited || p.credits_per_cycle != null, {
    message: 'O plano precisa dar créditos por ciclo, uso ilimitado ou os dois.',
    path: ['credits_per_cycle'],
  })
export type CreatePlanBody = z.infer<typeof createPlanBodySchema>

/** `code` não muda depois de criado: assinaturas e o site se referem a ele. */
export const updatePlanBodySchema = z
  .object(planFields)
  .partial()
  .strict()
  .refine((p) => Object.keys(p).length > 0, { message: 'Nada para alterar.' })
export type UpdatePlanBody = z.infer<typeof updatePlanBodySchema>

export const publicPlanSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price_cents: z.number(),
  cycle: cycleSchema,
  credits_per_cycle: z.number().nullable(),
  unlimited: z.boolean(),
})
export type PublicPlan = z.infer<typeof publicPlanSchema>

export const adminPlanSchema = publicPlanSchema.extend({
  id: z.string().uuid(),
  active: z.boolean(),
  sort_order: z.number(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
})
export type AdminPlan = z.infer<typeof adminPlanSchema>

export const planIdParamsSchema = z.object({ id: z.string().uuid() })

export const checkoutBodySchema = z.object({
  plan_code: z.string().min(2).max(40),
  cpf_cnpj: z.string().min(11).max(18),
  name: z.string().trim().min(2).max(100),
})
export type CheckoutBody = z.infer<typeof checkoutBodySchema>

export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'past_due', 'canceled'] as const

export const mySubscriptionSchema = z.object({
  enabled: z.boolean(),
  subscription: z
    .object({
      id: z.string().uuid(),
      status: z.enum(SUBSCRIPTION_STATUSES),
      plan: z.object({ code: z.string(), name: z.string() }),
      price_cents: z.number(),
      cycle: cycleSchema,
      credits_per_cycle: z.number().nullable(),
      unlimited: z.boolean(),
      paid_until: z.coerce.date().nullable(),
      entitled: z.boolean(),
      cancel_at_period_end: z.boolean(),
      invoice_url: z.string().nullable(),
    })
    .nullable(),
})
export type MySubscription = z.infer<typeof mySubscriptionSchema>

export const checkoutResponseSchema = z.object({
  subscription_id: z.string().uuid(),
  status: z.literal('pending'),
  invoice_url: z.string().nullable(),
})
