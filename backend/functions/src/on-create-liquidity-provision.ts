import * as functions from 'firebase-functions'
import { getContract, getUser, log } from 'shared/utils'
import { createFollowOrMarketSubsidizedNotification } from './create-notification'
import { LiquidityProvision } from 'common/liquidity-provision'
import { addUserToContractFollowers } from './follow-market'
import { FIXED_ANTE } from 'common/economy'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
  UNIQUE_BETTOR_LIQUIDITY_AMOUNT,
} from 'common/antes'

export const onCreateLiquidityProvision = functions.firestore
  .document('contracts/{contractId}/liquidity/{liquidityId}')
  .onCreate(async (change, context) => {
    const liquidity = change.data() as LiquidityProvision
    const { eventId } = context

    // Ignore Manifold Markets liquidity for now - users see a notification for free market liquidity provision
    if (
      liquidity.isAnte ||
      ((liquidity.userId === HOUSE_LIQUIDITY_PROVIDER_ID ||
        liquidity.userId === DEV_HOUSE_LIQUIDITY_PROVIDER_ID) &&
        (liquidity.amount === FIXED_ANTE ||
          liquidity.amount === UNIQUE_BETTOR_LIQUIDITY_AMOUNT))
    )
      return

    log(`onCreateLiquidityProvision: ${JSON.stringify(liquidity)}`)

    const contract = await getContract(liquidity.contractId)
    if (!contract)
      throw new Error('Could not find contract corresponding with liquidity')

    const liquidityProvider = await getUser(liquidity.userId)
    if (!liquidityProvider) throw new Error('Could not find liquidity provider')
    await addUserToContractFollowers(contract.id, liquidityProvider.id)

    await createFollowOrMarketSubsidizedNotification(
      contract.id,
      'liquidity',
      'created',
      liquidityProvider,
      eventId,
      liquidity.amount.toString(),
      { contract }
    )
  })
