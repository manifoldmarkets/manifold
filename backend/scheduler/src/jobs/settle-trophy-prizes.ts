import { uniq } from 'lodash'

import { MINUTE_MS } from 'common/util/time'
import { relayMembershipBroadcast } from 'shared/relay-membership-broadcast'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { settleTrophyMembershipPrizes } from 'shared/trophy-prizes'
import { log } from 'shared/utils'

// claim-trophy and the nightly rank job grant a prize's membership days right
// after its payout commits. If that fails (a busy bet queue, a restart
// between the two steps) the part stays 'pending' in user_trophy_rewards and
// this sweep grants it. Parts under a minute old are left to the request that
// wrote them. Each grant is keyed by its row, so a part granted twice over
// (here and by a claim) is still one grant. An account whose grant fails here
// is put off for longer each time (see postponePending).
const MIN_AGE_MS = MINUTE_MS
const MAX_USERS_PER_RUN = 100

export async function settleTrophyPrizes() {
  const pg = createSupabaseDirectClient()
  const { settled, failed } = await settleTrophyMembershipPrizes(pg, {
    minAgeMs: MIN_AGE_MS,
    maxUsers: MAX_USERS_PER_RUN,
  })
  await relayTrophyPrizeBroadcasts(
    settled.filter((s) => s.outcome === 'started').map((s) => s.userId)
  )
  if (settled.length || failed) {
    log(
      `Trophy prizes: settled ${settled.length} pending membership parts, ${failed} accounts failed`
    )
  }
}

// Only the API has browser sockets. It reads each user's balance and
// membership again and broadcasts them, as for membership grants.
export async function relayTrophyPrizeBroadcasts(userIds: string[]) {
  for (const userId of uniq(userIds)) await relayMembershipBroadcast(userId)
}
