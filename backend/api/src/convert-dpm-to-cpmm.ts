import { groupBy } from 'lodash'
import { APIError, type APIHandler } from './helpers/endpoint'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { betsQueue } from 'shared/helpers/fn-queue'
import { log } from 'shared/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'
import { Bet, LimitBet } from 'common/bet'
import { Contract, DPMContract, MarketContract } from 'common/contract'
import {
  dpmToCpmmShareFactor,
  getDpmProbability,
} from 'common/calculate-dpm'
import { calculateUserMetricsWithoutLoans } from 'common/calculate-metrics'
import { convertBet } from 'common/supabase/bets'
import { convertContract } from 'common/supabase/contracts'
import { isAdminId, isModId } from 'common/envs/constants'
import { bulkUpdateContractMetricsQuery } from 'shared/helpers/user-contract-metrics'
import { removeUndefinedProps } from 'common/util/object'

export const convertDpmToCpmm: APIHandler<'convert-dpm-to-cpmm'> = async (
  props,
  auth
) => {
  const { contractId } = props
  return await betsQueue.enqueueFn(
    () => convertDpmToCpmmMain(contractId, auth.uid),
    [contractId, auth.uid]
  )
}

const convertDpmToCpmmMain = async (contractId: string, userId: string) => {
  const result = await runTransactionWithRetries(async (tx) => {
    const contractRow = await tx.oneOrNone(
      `select * from contracts where id = $1 for update`,
      [contractId]
    )
    if (!contractRow) throw new APIError(404, 'Contract not found')
    const contract = convertContract(contractRow) as Contract

    if (contract.mechanism !== 'dpm-2') {
      throw new APIError(400, 'Contract is not a DPM market')
    }
    if (contract.outcomeType !== 'BINARY') {
      throw new APIError(400, 'Only binary DPM markets can be converted')
    }
    if (contract.resolution) {
      throw new APIError(400, 'Market is already resolved')
    }

    const isCreator = contract.creatorId === userId
    if (!isCreator && !isModId(userId) && !isAdminId(userId)) {
      throw new APIError(
        403,
        'Only the market creator, mods, or admins can convert a DPM market'
      )
    }

    const dpmContract = contract as DPMContract
    const pool = dpmContract.pool
    const p = getDpmProbability(pool)
    const factorYes = dpmToCpmmShareFactor(pool, 'YES')
    const factorNo = dpmToCpmmShareFactor(pool, 'NO')

    const betRows = await tx.manyOrNone(
      `select * from contract_bets where contract_id = $1 order by created_time`,
      [contractId]
    )
    const bets = betRows.map(convertBet) as Bet[]

    const betUpdates: {
      id: string
      shares: number
      fills: Bet['fills']
      markCancelled: boolean
    }[] = []
    const rewrittenBets: Bet[] = []

    for (const bet of bets) {
      const isLimit = 'limitProb' in bet && bet.limitProb !== undefined
      const isOpenLimit =
        isLimit && !(bet as LimitBet).isFilled && !bet.isCancelled

      const factor = bet.outcome === 'YES' ? factorYes : factorNo
      const newShares = (bet.shares ?? 0) * factor
      const newFills = (bet.fills ?? []).map((f) => ({
        ...f,
        shares: f.shares * factor,
      }))
      betUpdates.push({
        id: bet.id,
        shares: newShares,
        fills: newFills,
        markCancelled: isOpenLimit,
      })
      rewrittenBets.push({
        ...bet,
        shares: newShares,
        fills: newFills,
        ...(isOpenLimit ? { isCancelled: true } : {}),
      } as Bet)
    }

    for (const u of betUpdates) {
      const patch: Record<string, unknown> = {
        shares: u.shares,
        fills: u.fills,
      }
      if (u.markCancelled) patch.isCancelled = true
      await tx.none(
        `update contract_bets set data = data || $2::jsonb where bet_id = $1`,
        [u.id, JSON.stringify(patch)]
      )
    }

    const L = dpmContract.totalLiquidity
    const safeP = Math.min(0.999, Math.max(0.001, p))
    const poolYes = L * Math.sqrt((1 - safeP) / safeP)
    const poolNo = L * Math.sqrt(safeP / (1 - safeP))

    const contractUpdate: Partial<MarketContract> & { id: string } = {
      id: contractId,
      mechanism: 'cpmm-1',
      pool: { YES: poolYes, NO: poolNo },
      p: 0.5,
      prob: safeP,
      totalLiquidity: L,
      subsidyPool: 0,
    }

    // `mechanism` is a generated column synced from data->>'mechanism'
    // via a trigger, so updating the data blob is sufficient.
    await tx.none(
      `update contracts
         set data = data || $2::jsonb
         where id = $1`,
      [
        contractId,
        JSON.stringify({
          mechanism: 'cpmm-1',
          pool: { YES: poolYes, NO: poolNo },
          p: 0.5,
          prob: safeP,
          totalLiquidity: L,
          subsidyPool: 0,
        }),
      ]
    )

    const newContract: MarketContract = {
      ...(contract as any),
      mechanism: 'cpmm-1',
      pool: { YES: poolYes, NO: poolNo },
      p: 0.5,
      prob: safeP,
      totalLiquidity: L,
      subsidyPool: 0,
    }

    const betsByUser = groupBy(rewrittenBets, (b) => b.userId)
    const newMetrics = Object.entries(betsByUser).flatMap(([uid, userBets]) =>
      calculateUserMetricsWithoutLoans(newContract, userBets, uid)
    )
    // `calculateUserMetricsWithoutLoans` leaves `loan`/`marginLoan` undefined,
    // but both columns are NOT NULL in `user_contract_metrics`. DPM markets
    // don't carry loans, so default to 0; the next portfolio update will
    // re-derive loan amounts for the now-CPMM market if needed.
    const cleanedMetrics = newMetrics.map((m) =>
      removeUndefinedProps({
        ...m,
        loan: m.loan ?? 0,
        marginLoan: m.marginLoan ?? 0,
      })
    )

    await tx.none(
      `delete from user_contract_metrics where contract_id = $1`,
      [contractId]
    )
    if (cleanedMetrics.length > 0) {
      const metricsQuery = bulkUpdateContractMetricsQuery(cleanedMetrics)
      await tx.none(metricsQuery)
    }

    const cancelledCount = betUpdates.filter((u) => u.markCancelled).length
    log(
      `Converted DPM -> CPMM for contract ${contractId}: factorYes=${factorYes}, factorNo=${factorNo}, bets=${betUpdates.length}, cancelled=${cancelledCount}, newPool=${poolYes}/${poolNo}, prob=${safeP}`
    )

    return { contractUpdate, newContract }
  })

  broadcastUpdatedContract(
    result.newContract.visibility,
    result.contractUpdate
  )

  return {
    result: { success: true as const },
    continue: async () => {
      // nothing further needed; metrics broadcast happens via usual pipelines
    },
  }
}
