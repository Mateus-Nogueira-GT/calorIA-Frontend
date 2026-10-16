import { z } from 'zod'
export const creditReceiptSchema = z.object({
  operation_id: z.string().uuid(),
  charged_units: z.number().int(),
  balance_units: z.number().int(),
  available_units: z.number().int(),
})
export type CreditReceipt = z.infer<typeof creditReceiptSchema>
