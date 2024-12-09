import { runScript } from 'run-script'
import { MarketContract } from 'common/contract'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getContract, getUser, isProd, log } from 'shared/utils'
import { unresolveMain } from 'api/unresolve'

export const unresolveAndResolve = async () => {
  runScript(async ({ pg }) => {
    // Get the contract/answer pairs that need fixing
    const resolutionPairs = await pg.map(
      `select distinct on(txns.data->'data'->>'answerId')
         txns.from_id as contract_id,
         txns.data->'data'->>'answerId' as answer_id,
         a.resolution as resolution,
         c.creator_id as creator_id
         from txns
         join contracts c on txns.from_id = c.id  
         join answers a on a.id = (txns.data->'data'->>'answerId')::text
         where txns.created_time > millis_to_ts(1733501880000)
         and txns.created_time < '2024-12-09 18:34:20.228342 +00:00'
         and a.resolution != 'CANCEL'
         and category = 'CONTRACT_RESOLUTION_PAYOUT'
         and c.mechanism = 'cpmm-multi-1'
         and c.data->>'shouldAnswersSumToOne' = 'false';`,
      [],
      (r) => ({
        contractId: r.contract_id as string,
        answerId: r.answer_id as string,
        resolution: r.resolution as string,
        creatorId: r.creator_id as string,
      })
    )

    log(`Found ${resolutionPairs.length} answers to fix`)

    // Get admin user to do the resolutions
    const adminId = isProd()
      ? 'AJwLWoo3xue32XIiAVrL5SyR1WB2'
      : '6hHpzvRG0pMq8PNJs7RZj2qlZGn2'
    log(`Using admin user ${adminId}`)
    const admin = await getUser(adminId)
    if (!admin) throw new Error('Admin user not found')

    for (const pair of resolutionPairs) {
      const { contractId, answerId, resolution } = pair
      log(`Fixing ${contractId} answer ${answerId}`)

      try {
        // First unresolve
        await unresolveMain(
          { contractId, answerId },
          { uid: adminId } as any,
          {} as any
        )

        // Get contract
        const contract = await getContract(pg, contractId)
        if (!contract) throw new Error('Contract not found')
        log(`Unresolved: ${contract.slug}, ${contract.question}`)
        const creator = await getUser(contract.creatorId)
        if (!creator) throw new Error('Creator not found')

        // Re-resolve with same resolution
        await resolveMarketHelper(contract as MarketContract, admin, creator, {
          outcome: resolution,
          answerId,
        })

        log(`Successfully fixed ${contractId} answer ${answerId}`)
      } catch (err) {
        log.error(`Error fixing ${contractId} answer ${answerId}:`, {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  })
}

if (require.main === module) {
  unresolveAndResolve()
}
