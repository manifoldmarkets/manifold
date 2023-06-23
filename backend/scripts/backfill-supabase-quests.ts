import { getServiceAccountCredentials, initAdmin } from 'shared/init-admin'
initAdmin()
import { loadSecretsToEnv } from 'common/secrets'
import { START_OF_WEEK } from 'shared/complete-quest-internal'
import { getAllUsers } from 'shared/utils'
import { getRecentContractsCount } from 'common/supabase/contracts'
import { createSupabaseClient } from 'shared/supabase/init'
import { setQuestScoreValue } from 'common/supabase/set-scores'
import { QUEST_DETAILS } from 'common/quest'
import { getReferralCount } from 'common/supabase/referrals'

async function backfillSupabaseQuests() {
  const credentials = getServiceAccountCredentials()
  await loadSecretsToEnv(credentials)
  try {
    const users = await getAllUsers()
    console.log(`Found ${users.length} users`)
    const db = createSupabaseClient()
    let count = 0
    const chunk = 2000
    const start = 21000
    const end = start + chunk
    console.log(`Processing users from ${start} to ${end}`)
    await Promise.all(
      users.slice(start, end).map(async (user) => {
        try {
          const questionsCreatedCount = await getRecentContractsCount(
            user.id,
            START_OF_WEEK,
            db
          )
          if (questionsCreatedCount > 0) {
            await setQuestScoreValue(
              user.id,
              QUEST_DETAILS['MARKETS_CREATED'].scoreId,
              questionsCreatedCount,
              db
            )
          }
          const referralsCount = await getReferralCount(
            user.id,
            START_OF_WEEK,
            db
          )
          if (referralsCount > 0) {
            await setQuestScoreValue(
              user.id,
              QUEST_DETAILS['REFERRALS'].scoreId,
              referralsCount,
              db
            )
          }
          count++
          if (count % 100 === 0) console.log(`Processed ${count} users`)
        } catch (e) {
          console.error(`Error processing user ${user.id}`)
          console.error(e)
        }
      })
    )
  } catch (e) {
    console.error(e)
  }
}

if (require.main === module) backfillSupabaseQuests().then(() => process.exit())
