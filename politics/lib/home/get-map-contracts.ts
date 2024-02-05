import {
  MapContractsDictionary,
  StateElectionMarket,
} from 'common/politics/elections-data'
import { getContract } from 'web/lib/supabase/contracts'

export async function getStateContracts(
  stateElectionContracts: StateElectionMarket[]
) {
  const presidencyContractsPromises = stateElectionContracts.map(async (m) => {
    const contract = await getContract(m.slug)
    return { state: m.state, contract: contract }
  })

  const mapContractsArray = await Promise.all(presidencyContractsPromises)

  // Convert array to dictionary
  return mapContractsArray.reduce((acc, mapContract) => {
    acc[mapContract.state] = mapContract.contract
    return acc
  }, {} as MapContractsDictionary)
}
