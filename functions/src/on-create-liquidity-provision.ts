import * as functions from 'firebase-functions'
import { getContract, getUser } from './utils'
import { createNotification } from './create-notification'
import { LiquidityProvision } from 'common/liquidity-provision'

export const onCreateLiquidityProvision = functions.firestore
  .document('contracts/{contractId}/liquidity/{liquidityId}')
  .onCreate(async (change, context) => {
    const liquidity = change.data() as LiquidityProvision
    const { eventId } = context
    const contract = await getContract(liquidity.contractId)

    if (!contract)
      throw new Error('Could not find contract corresponding with liquidity')

    // Ignore Manifold Markets liquidity for now - users see a notification for free market liquidity provision
    if (liquidity.userId === 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2') return

    const liquidityProvider = await getUser(liquidity.userId)
    if (!liquidityProvider) throw new Error('Could not find liquidity provider')

    await createNotification(
      contract.id,
      'liquidity',
      'created',
      liquidityProvider,
      eventId,
      liquidity.amount.toString(),
      contract
    )
  })
