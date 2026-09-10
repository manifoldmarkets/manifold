import { z } from 'zod'

/** Provider availability lives in existing contract JSON. Successful checks
 * expire at the earlier of the source freshness limit and the check budget.
 * Available health commits atomically with its executable price. */
export const oracleFeedHealthSchema = z
  .object({
    checkedAt: z.number().finite().positive(),
    status: z.enum(['available', 'unavailable']),
    reason: z.string().optional(),
    expiresAt: z.number().finite().positive().optional(),
  })
  .strict()

export type OracleFeedHealth = z.infer<typeof oracleFeedHealthSchema>
