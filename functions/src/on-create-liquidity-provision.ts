import * as functions from 'firebase-functions'
import { getContract, getUser, log } from './utils'
import { createNotification } from './create-notification'
import { LiquidityProvision } from '../../common/liquidity-provision'
import { addUserToContractFollowers } from './follow-market'
import { FIXED_ANTE } from '../../common/economy'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from '../../common/antes'

export const onCreateLiquidityProvision = functions.firestore
  .document('contracts/{contractId}/liquidity/{liquidityId}')
  .onCreate(async (change, context) => {
    const liquidity = change.data() as LiquidityProvision
    const { eventId } = context

    // Ignore Manifold Markets liquidity for now - users see a notification for free market liquidity provision
    if (
      (liquidity.userId === HOUSE_LIQUIDITY_PROVIDER_ID ||
        liquidity.userId === DEV_HOUSE_LIQUIDITY_PROVIDER_ID) &&
      liquidity.amount === FIXED_ANTE
    )
      return

    log(`onCreateLiquidityProvision: ${JSON.stringify(liquidity)}`)

    const contract = await getContract(liquidity.contractId)
    if (!contract)
      throw new Error('Could not find contract corresponding with liquidity')

    const liquidityProvider = await getUser(liquidity.userId)
    if (!liquidityProvider) throw new Error('Could not find liquidity provider')
    await addUserToContractFollowers(contract.id, liquidityProvider.id)

    await createNotification(
      contract.id,
      'liquidity',
      'created',
      liquidityProvider,
      eventId,
      liquidity.amount.toString(),
      { contract }
    )
  })
