import * as functions from 'firebase-functions'
import { getContract, getUser } from './utils'
import { createNotification } from './create-notification'
import { LiquidityProvision } from 'common/liquidity-provision'

export const onAddLiquidity = functions.firestore
  .document('contracts/{contractId}/liquidity/{liquidityId}')
  .onCreate(async (change, context) => {
    const liquidity = change.data() as LiquidityProvision
    const { eventId } = context
    const contract = await getContract(liquidity.contractId)

    if (!contract)
      throw new Error('Could not find contract corresponding with liquidity')

    const liquidityAdder = await getUser(liquidity.userId)
    if (!liquidityAdder) throw new Error('Could not find liquidity adder')

    await createNotification(
      contract.id,
      'liquidity',
      'created',
      liquidityAdder,
      eventId,
      liquidity.amount.toString(),
      contract
    )
  })
