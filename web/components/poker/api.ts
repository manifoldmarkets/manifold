import { APIParams } from 'common/api/schema'
import { api, APIError } from 'web/lib/api/api'

export async function submitPokerAction(request: APIParams<'act-poker'>) {
  try {
    return await api('act-poker', request)
  } catch (e) {
    if (e instanceof APIError && e.code < 500) throw e
    // Reuse the full request, including its idempotency key, on one retry.
    return api('act-poker', request)
  }
}
