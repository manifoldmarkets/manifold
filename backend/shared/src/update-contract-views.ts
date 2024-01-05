import * as admin from 'firebase-admin'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { JobContext } from 'shared/utils'
import { uniq } from 'lodash'

export async function updateContractViews({ log, lastEndTime }: JobContext) {
  const firestore = admin.firestore()
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  const contractsToViews = Object.fromEntries(
    await pg.map(`select views, id from contracts`, [], (r) => [r.id, r.views])
  )
  const contractIds = Object.keys(contractsToViews)
  log(`Loaded ${contractIds.length} contracts.`)

  log(
    'Computing contract views from time: ' +
      new Date(lastEndTime ?? 0).toISOString()
  )
  const views = await getViews(pg, lastEndTime ?? 0)

  log('Computing view updates...')
  let writes = 0
  const addViews = (lastEndTime ?? 0) > 0
  log(`Adding views: ${addViews}. If false, then setting views.`)
  const writer = firestore.bulkWriter()
  for (const contractId of contractIds) {
    let totalViews = contractsToViews[contractId] ?? 0
    if (addViews) totalViews += views[contractId] ?? 0
    else totalViews = views[contractId] ?? 0

    const update = {
      views: totalViews,
    }

    if (contractsToViews[contractId] !== update.views) {
      const contractDoc = firestore.collection('contracts').doc(contractId)
      writer.update(contractDoc, update)
      writes++
    }
  }

  log(`Committing ${writes} writes...`)
  await writer.close()
  log('Done.')
}

const getViews = async (pg: SupabaseDirectClient, from: number) => {
  const [signedInViews, signedOutViews] = await Promise.all([
    getSignedInViews(pg, from),
    getSignedOutViews(pg, from),
  ])
  return Object.fromEntries(
    uniq(Object.keys(signedInViews).concat(Object.keys(signedOutViews))).map(
      (contractId) => [
        contractId,
        Number(signedInViews[contractId] ?? 0) +
          Number(signedOutViews[contractId] ?? 0),
      ]
    )
  )
}
const getSignedInViews = async (pg: SupabaseDirectClient, from: number) => {
  return Object.fromEntries(
    await pg.map(
      `select
         contract_id,
         count(*) as logged_in_user_seen_markets_count
     from
         user_seen_markets
     where type = 'view market'
     and created_time > millis_to_ts($1)
     group by
         contract_id;
    `,
      [from],
      (r) => [r.contract_id, r.logged_in_user_seen_markets_count]
    )
  )
}
const getSignedOutViews = async (pg: SupabaseDirectClient, from: number) => {
  return Object.fromEntries(
    await pg.map(
      `select
         contract_id,
         count(*) as logged_out_user_seen_markets_count
     from
         user_events
     where
       name = 'view market'
       and user_id is null
     and ts > millis_to_ts($1)
     group by
         contract_id;
    `,
      [from],
      (r) => [r.contract_id, r.logged_out_user_seen_markets_count]
    )
  )
}
