import { initAdmin } from 'shared/init-admin'
initAdmin()

import { zip } from 'lodash'
import { filterDefined } from 'common/util/array'
import { resolveMarket } from 'functions/resolve-market'
import { getContract, getUser } from 'shared/utils'

if (require.main === module) {
  const contractIds = process.argv.slice(2)
  if (contractIds.length === 0) {
    throw new Error('No contract ids provided')
  }
  resolveMarketsAgain(contractIds).then(() => process.exit(0))
}

async function resolveMarketsAgain(contractIds: string[]) {
  const maybeContracts = await Promise.all(contractIds.map(getContract))
  if (maybeContracts.some((c) => !c)) {
    throw new Error('Invalid contract id')
  }
  const contracts = filterDefined(maybeContracts)

  const maybeCreators = await Promise.all(
    contracts.map((c) => getUser(c.creatorId))
  )
  if (maybeCreators.some((c) => !c)) {
    throw new Error('No creator found')
  }
  const creators = filterDefined(maybeCreators)

  if (
    !contracts.every((c) => c.resolution === 'YES' || c.resolution === 'NO')
  ) {
    throw new Error('Only YES or NO resolutions supported')
  }

  const resolutionParams = contracts.map((c) => ({
    outcome: c.resolution as string,
    value: undefined,
    probabilityInt: undefined,
    resolutions: undefined,
  }))

  const params = zip(contracts, creators, resolutionParams)

  for (const [contract, creator, resolutionParams] of params) {
    if (contract && creator && resolutionParams) {
      console.log('Resolving', contract.question)
      try {
        await resolveMarket(contract, creator, resolutionParams)
      } catch (e) {
        console.log(e)
      }
    }
  }

  console.log(`Resolved all contracts.`)
}
