import { removeUndefinedProps } from 'common/util/object'
import { groupBy, map } from 'lodash'
import { Contract } from 'common/contract'

// Exactly one is defined
export type ContractPair =
  | { manaContract: Contract }
  | { cashContract: Contract }
  | { manaContract: Contract; cashContract: Contract }

export function getDefinedContract(pair: ContractPair): Contract {
  if ('cashContract' in pair) {
    return pair.cashContract
  } else {
    return pair.manaContract
  }
}

export const pairContracts = (contracts: Contract[]) => {
  const pairs = groupBy(contracts, (contract) => {
    return [contract.id, contract.siblingContractId].sort().join('_')
  })

  return map(pairs, (group) => {
    const cashContract = group.find((c) => c.token === 'CASH')
    const manaContract = group.find((c) => c.token === 'MANA')
    return removeUndefinedProps({
      cashContract,
      manaContract,
    })
  }) as ContractPair[]
}
