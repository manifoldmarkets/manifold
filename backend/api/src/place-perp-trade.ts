import { canReceiveBonuses } from 'common/user'
import { PARTNER_USER_IDS, PERPS_ENABLED } from 'common/envs/constants'
import { getUniqueBettorBonusAmount } from 'common/economy'
import { UniqueBettorBonusTxn } from 'common/txn'
import { PerpContract } from 'common/contract'
import { openOrAddPosition } from 'shared/perps/engine'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnOutsideBetQueue } from 'shared/txn/run-txn'
import { getUser, log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'

export const placePerpTrade: APIHandler<'place-perp-trade'> = async (
  body,
  auth
) => {
  if (!PERPS_ENABLED) throw new APIError(403, 'Perps are disabled')
  const { contractId, direction, mana, leverage } = body
  const result = await openOrAddPosition(
    contractId,
    auth.uid,
    direction,
    mana,
    leverage
  )

  if (result.isNewUniqueBettor) {
    try {
      await payUniqueBettorBonus(contractId, auth.uid)
    } catch (err) {
      log('perp unique bettor bonus failed (non-fatal):', err)
    }
  }

  const { position } = result
  return {
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
  }
}

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
