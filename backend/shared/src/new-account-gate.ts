import { canPostSocially, NEW_USER_COMMENT_GATE_MS, User } from 'common/user'
import { DAY_MS } from 'common/util/time'
import { getActiveSupporterEntitlements } from 'shared/supabase/entitlements'

// Server-side check for the new-account social gate. canPostSocially counts an
// active subscription, but getUser/convertUser don't load entitlements, so look
// them up before turning a new account away — otherwise a day-one subscriber
// is told subscribing unlocks the very thing they were just refused.
export async function passesNewAccountGate(
  pg: Parameters<typeof getActiveSupporterEntitlements>[0],
  user: User
) {
  if (canPostSocially(user)) return true
  const entitlements = await getActiveSupporterEntitlements(pg, user.id)
  return canPostSocially({ ...user, entitlements })
}

// e.g. newAccountGateMessage('Messaging')
export const newAccountGateMessage = (action: string) =>
  `${action} unlocks ${
    NEW_USER_COMMENT_GATE_MS / DAY_MS
  } days after signup. Verify your identity, purchase mana, or subscribe to unlock it now.`
