// user calls this if they haven't yet since the last utc reset time
// if it's after xpm UTC since their last call, we create txns for:
// - a M$10 daily login bonus
// - a M$5 bonus for each unique trader they've had on their contracts since their last call
// create notifications for each

// Uses utc time on server:
import { newEndpoint, validate } from 'functions/src/api'
import { log } from 'functions/src/utils'
import { z } from 'zod'
const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gte(1),
})

export const placebet = newEndpoint({}, async (req, auth) => {
  log('Inside endpoint handler.')
  const { amount, contractId } = validate(bodySchema, req.body)
  const today = new Date()
  let freeMarketResetTime = new Date().setUTCHours(16, 0, 0, 0)
  if (today.getTime() < freeMarketResetTime) {
    freeMarketResetTime = freeMarketResetTime - 24 * 60 * 60 * 1000
  }
})
