import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { getUser, getValues, revalidateStaticProps } from 'shared/utils'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { secrets } from 'shared/secrets'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getProbability } from 'common/calculate'
import { MINUTE_MS } from 'common/util/time'

export const resolveDebates = functions
  .runWith({
    secrets,
  })
  .pubsub.schedule('every 1 minutes')
  .onRun(doResolveDebates)

export async function doResolveDebates() {
  const firestore = admin.firestore()
  const pg = createSupabaseDirectClient()

  const debateGroupId = '0i8ozKhPq5qJ89DG9tCW'
  const contractIds = (
    await getValues<{ contractId: string }>(
      firestore
        .collection('groups')
        .doc(debateGroupId)
        .collection('groupContracts')
    )
  ).map((r) => r.contractId)

  const contracts = await pg.map(
    `select data from contracts
          where id = any($1)
          and resolution_time is null`,
    [contractIds],
    (r) => r.data as Contract
  )

  const contractsToResolve = contracts.filter((c) => {
    if (c.closeTime) {
      const minutesLeft = Math.max(1, (c.closeTime - Date.now()) / MINUTE_MS)
      return 1 / minutesLeft > Math.random()
    }
    return true
  })

  console.log('contracts to resolve', contractsToResolve)

  for (const contract of contractsToResolve) {
    const creator = await getUser(contract.creatorId)
    if (creator) {
      const prob = getProbability(contract as CPMMBinaryContract)
      await resolveMarketHelper(contract, creator, creator, {
        outcome: 'MKT',
        probabilityInt: Math.round(prob * 100),
        value: undefined,
        resolutions: undefined,
      })
    }
  }

  if (contracts.length) await revalidateStaticProps('/versus')
}
