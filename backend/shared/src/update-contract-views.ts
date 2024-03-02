import * as admin from 'firebase-admin'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { JobContext } from 'shared/utils'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'

export async function updateContractViews({ log }: JobContext) {
  const firestore = admin.firestore()
  const pg = createSupabaseDirectClient()
  log('Loading contract data...')
  const contractsToViews = Object.fromEntries(
    await pg.map(`select views, id from contracts`, [], (r) => [r.id, r.views])
  )
  const contractIds = Object.keys(contractsToViews)
  log(`Loaded ${contractIds.length} contracts.`)

  log('Computing contract views.')
  const views = await getTotalViews(pg)

  let writes = 0
  log(`Setting views.`)
  const writer = new SafeBulkWriter()
  for (const contractId of contractIds) {
    const update = { views: views[contractId] ?? 0 }
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

const getTotalViews = async (pg: SupabaseDirectClient) => {
  return Object.fromEntries(
    await pg.map(
      `select contract_id, sum(page_views) as views from user_contract_views group by contract_id`,
      [],
      (r) => [r.contract_id, r.views]
    )
  )
}
