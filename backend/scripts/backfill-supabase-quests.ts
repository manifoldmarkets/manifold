import { getServiceAccountCredentials, initAdmin } from 'shared/init-admin'
initAdmin()
import { loadSecretsToEnv } from 'shared/secrets'
import { START_OF_WEEK } from 'shared/complete-quest-internal'
import { getAllUsers } from 'shared/utils'
import { getRecentContractsCount } from 'common/supabase/contracts'
import { createSupabaseClient } from 'shared/supabase/init'
import { setScoreValue } from 'common/supabase/set-scores'
import { QUEST_DETAILS, QUEST_SET_ID } from 'common/quest'
import { getReferralCount } from 'common/supabase/referrals'

async function backfillSupabaseQuests() {
  const credentials = getServiceAccountCredentials()
  await loadSecretsToEnv(credentials)
  try {
    const users = await getAllUsers()
    console.log(`Found ${users.length} users`)
    const db = createSupabaseClient()
    let count = 0
    // calculate how many markets they created this week
    await Promise.all(
      users.map(async (user) => {
        const marketsCreatedCount = await getRecentContractsCount(
          user.id,
          START_OF_WEEK,
          db
        )
        if (marketsCreatedCount > 0) {
          await setScoreValue(
            user.id,
            QUEST_SET_ID,
            QUEST_DETAILS['MARKETS_CREATED'].scoreId,
            marketsCreatedCount,
            db
          )
        }
        const referralsCount = await getReferralCount(
          user.id,
          START_OF_WEEK,
          db
        )
        if (referralsCount > 0) {
          await setScoreValue(
            user.id,
            QUEST_SET_ID,
            QUEST_DETAILS['REFERRALS'].scoreId,
            referralsCount,
            db
          )
        }
        count++
        if (count % 100 === 0) console.log(`Processed ${count} users`)
      })
    )
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) backfillSupabaseQuests().then(() => process.exit())
