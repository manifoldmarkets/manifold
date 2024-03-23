import { getContract, getUser } from 'shared/utils'
import { createFollowOrMarketSubsidizedNotification } from 'shared/create-notification'
import { addUserToContractFollowers } from 'shared/follow-market'
import { AddSubsidyTxn } from 'common/txn'

// TODO: add this as continuation of add liquidity instances

export const onCreateLiquidityProvision = async (txn: AddSubsidyTxn) => {
  // Ignore Manifold Markets liquidity for now - users see a notification for free market liquidity provision
  if (txn.fromType === 'BANK' || txn.data.isAnte) {
    return
  }

  const contract = await getContract(txn.toId)
  if (!contract)
    throw new Error('Could not find contract corresponding with liquidity')

  const liquidityProvider = await getUser(txn.fromId)
  if (!liquidityProvider) throw new Error('Could not find liquidity provider')
  await addUserToContractFollowers(contract.id, liquidityProvider.id)
  await createFollowOrMarketSubsidizedNotification(
    contract.id,
    'liquidity',
    'created',
    liquidityProvider,
    txn.id,
    txn.amount.toString(),
    { contract }
  )
}
