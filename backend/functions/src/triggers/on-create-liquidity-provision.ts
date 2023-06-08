import * as functions from 'firebase-functions'
import { getContract, getUser, log } from 'shared/utils'
import { createFollowOrMarketSubsidizedNotification } from 'shared/create-notification'
import { LiquidityProvision } from 'common/liquidity-provision'
import { addUserToContractFollowers } from 'shared/follow-market'
import { FIXED_ANTE } from 'common/economy'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
  UNIQUE_BETTOR_LIQUIDITY_AMOUNT,
} from 'common/antes'
import { secrets } from 'common/secrets'
import { addContractToFeed } from 'shared/create-feed'
import { INTEREST_DISTANCE_THRESHOLDS } from 'common/feed'

export const onCreateLiquidityProvision = functions
  .runWith({ secrets })
  .firestore.document('contracts/{contractId}/liquidity/{liquidityId}')
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
    if (liquidity.amount > 100)
      await addContractToFeed(
        contract,
        [
          'similar_interest_vector_to_contract',
          'similar_interest_vector_to_user',
          'follow_user',
          'contract_in_group_you_are_in',
        ],
        'new_subsidy',
        [contract.creatorId, liquidity.userId],
        {
          minUserInterestDistanceToContract:
            INTEREST_DISTANCE_THRESHOLDS.new_subsidy,
          userIdResponsibleForEvent: liquidity.userId,
          idempotencyKey: eventId,
        }
      )
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
