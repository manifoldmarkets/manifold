import { getContract, getUser, log } from 'shared/utils'
import { createFollowOrMarketSubsidizedNotification } from 'shared/create-notification'
import { LiquidityProvision } from 'common/liquidity-provision'
import { addUserToContractFollowers } from 'shared/follow-market'

export const onCreateLiquidityProvision = async (
  liquidity: LiquidityProvision
) => {
  // Ignore Manifold Markets liquidity for now - users see a notification for free market liquidity provision
  if (liquidity.isAnte) return

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
    `subsidy-${liquidity.id}`,
    liquidity.amount.toString(),
    { contract }
  )
}
