import { canReceiveBonuses } from 'common/user'
import { PARTNER_USER_IDS } from 'common/envs/constants'
import { getUniqueBettorBonusAmount } from 'common/economy'
import { UniqueBettorBonusTxn } from 'common/txn'
import { PerpContract } from 'common/contract'
import { openOrAddPosition } from 'shared/perps/engine'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { getUser, log } from 'shared/utils'
import { APIHandler } from './helpers/endpoint'
import { advancePerpBettingStreak } from './helpers/perp-streak'
import { assertPerpExposureIncreaseEnabled } from './helpers/perp-trading-mode'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

export const placePerpTrade: APIHandler<'place-perp-trade'> =
  onlyUsersWhoCanPerformAction('trade', async (body, auth) => {
    assertPerpExposureIncreaseEnabled()
    const { contractId, direction, mana, leverage, idempotencyKey } = body
    const isApi = auth.creds.kind === 'key'
    const result = await openOrAddPosition(
      contractId,
      auth.uid,
      direction,
      mana,
      leverage,
      idempotencyKey,
      isApi
    )

    const { position } = result
    return {
      result: {
        position: {
          userId: position.userId,
          direction: position.direction,
          size: position.size,
          costBasis: position.costBasis,
          originalCostBasis: position.originalCostBasis,
          entryPrice: position.entryPrice,
          leverage: position.leverage,
          liquidationPrice: position.liquidationPrice,
        },
        fee: result.fee,
      },
      continue: async () => {
        // An idempotent replay is not a trade — re-running side effects
        // would advance the streak (and pay its bonus) daily off a single
        // stored request.
        if (result.replayed) return
        try {
          await advancePerpBettingStreak(auth.uid, contractId, isApi)
        } catch (err) {
          log('perp streak update failed (non-fatal):', err)
        }
        if (result.isNewUniqueBettor) {
          try {
            await payUniqueBettorBonus(contractId, auth.uid)
          } catch (err) {
            log('perp unique bettor bonus failed (non-fatal):', err)
          }
        }
      },
    }
  })

// Credit the contract creator a unique-bettor bonus when a new user opens
// their first position on this perp. Kept out of the main engine tx so the
// trade itself doesn't fail if the bonus txn can't be issued.
const payUniqueBettorBonus = async (contractId: string, bettorId: string) => {
  const pg = createSupabaseDirectClient()
  const contractRow = await pg.oneOrNone<{ data: PerpContract }>(
    `select data from contracts where id = $1 and data->>'mechanism' = 'perp'`,
    [contractId]
  )
  if (!contractRow) return
  const contract = contractRow.data
  if (contract.creatorId === bettorId) return

  const [bettor, creator] = await Promise.all([
    getUser(bettorId),
    getUser(contract.creatorId),
  ])
  if (!bettor || !creator) return
  if (bettor.isBot) return
  if (!canReceiveBonuses(bettor) || !canReceiveBonuses(creator)) return
  if (contract.visibility === 'unlisted') return

  const isPartner = PARTNER_USER_IDS.includes(contract.creatorId)
  // Perps have no answers, and totalLiquidity isn't tracked directly — use the
  // sum of pool sizes as a proxy for bonus tier.
  const liquidityProxy = contract.poolLong + contract.poolShort
  const bonus = getUniqueBettorBonusAmount(liquidityProxy, 0)

  const bonusTxn: Omit<UniqueBettorBonusTxn, 'id' | 'createdTime'> = {
    category: 'UNIQUE_BETTOR_BONUS',
    fromType: 'BANK',
    fromId: 'BANK',
    toId: contract.creatorId,
    toType: 'USER',
    amount: bonus,
    token: 'M$',
    data: {
      contractId,
      uniqueNewBettorId: bettorId,
      isPartner,
    },
  }
  await pg.tx(async (tx) => {
    await runTxnOutsideBetQueue(tx, bonusTxn)
  })
}
